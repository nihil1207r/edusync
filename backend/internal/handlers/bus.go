package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ---- Admin: routes & buses --------------------------------------------------

func (d *Deps) CreateRoute(c *fiber.Ctx) error {
	var body struct {
		Name  string `json:"name"`
		Stops []struct {
			Name string  `json:"name"`
			Lat  float64 `json:"lat"`
			Lng  float64 `json:"lng"`
		} `json:"stops"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.JSON(fiber.Map{"success": false, "message": "name is required."})
	}
	err := d.UserDB(c).Insert("routes", map[string]interface{}{"name": body.Name, "stops": body.Stops}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) ListRoutes(c *fiber.Ctx) error {
	var routes []map[string]interface{}
	_ = d.UserDB(c).Select("routes", url.Values{"select": {"*"}}, &routes)
	return c.JSON(fiber.Map{"success": true, "routes": orEmpty(routes)})
}

// AddRouteStop appends a stop to a route's stops array. Routes are created
// with an empty stops list (see CreateRoute) — this is the only way to
// populate it, and it's what geofence detection/ETA (Phase 2) actually key
// off of, so a route with no stops added yet won't produce arrival/ETA data.
func (d *Deps) AddRouteStop(c *fiber.Ctx) error {
	var body struct {
		RouteID string  `json:"routeId"`
		Name    string  `json:"name"`
		Lat     float64 `json:"lat"`
		Lng     float64 `json:"lng"`
	}
	if err := c.BodyParser(&body); err != nil || body.RouteID == "" || body.Name == "" {
		return c.JSON(fiber.Map{"success": false, "message": "routeId and name are required."})
	}
	db := d.UserDB(c)
	var route map[string]interface{}
	if err := db.SelectOne("routes", url.Values{"select": {"stops"}, "id": {"eq." + body.RouteID}}, &route); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	stops, _ := route["stops"].([]interface{})
	stops = append(stops, map[string]interface{}{"name": body.Name, "lat": body.Lat, "lng": body.Lng})
	if err := db.Update("routes", url.Values{"id": {"eq." + body.RouteID}}, map[string]interface{}{"stops": stops}); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) CreateBus(c *fiber.Ctx) error {
	var body struct {
		NumberPlate string `json:"numberPlate"`
		DriverName  string `json:"driverName"`
		DriverID    string `json:"driverId"` // optional — links to a driver's own login for the driver app view
		RouteID     string `json:"routeId"`
	}
	if err := c.BodyParser(&body); err != nil || body.NumberPlate == "" || body.DriverName == "" {
		return c.JSON(fiber.Map{"success": false, "message": "numberPlate and driverName are required."})
	}
	row := map[string]interface{}{"number_plate": body.NumberPlate, "driver_name": body.DriverName}
	if body.RouteID != "" {
		row["route_id"] = body.RouteID
	}
	if body.DriverID != "" {
		row["driver_id"] = body.DriverID
	}
	if err := d.UserDB(c).Insert("buses", row, false, nil); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) ListBuses(c *fiber.Ctx) error {
	var buses []map[string]interface{}
	_ = d.UserDB(c).Select("buses", url.Values{"select": {"*,routes(*),bus_locations(*)"}}, &buses)
	return c.JSON(fiber.Map{"success": true, "buses": orEmpty(buses)})
}

func (d *Deps) AssignRoute(c *fiber.Ctx) error {
	var body struct {
		StudentID string `json:"studentId"`
		RouteID   string `json:"routeId"`
		StopIndex int    `json:"stopIndex"`
	}
	if err := c.BodyParser(&body); err != nil || body.StudentID == "" || body.RouteID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentId and routeId are required."})
	}
	err := d.UserDB(c).Upsert("route_assignments", map[string]interface{}{
		"student_id": body.StudentID, "route_id": body.RouteID, "stop_index": body.StopIndex,
	}, "student_id", false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ---- Driver: location ping + boarding events -------------------------------

func (d *Deps) PingLocation(c *fiber.Ctx) error {
	var body struct {
		BusID string  `json:"busId"`
		Lat   float64 `json:"lat"`
		Lng   float64 `json:"lng"`
	}
	if err := c.BodyParser(&body); err != nil || body.BusID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "busId, lat, and lng are required."})
	}
	err := d.UserDB(c).Upsert("bus_locations", map[string]interface{}{
		"bus_id": body.BusID, "lat": body.Lat, "lng": body.Lng, "updated_at": time.Now().Format(time.RFC3339),
	}, "bus_id", false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	// Append to the history log (used for ETA speed estimation) and run
	// geofence detection against the bus's route stops. Both are
	// best-effort: a failure here shouldn't fail the location ping itself,
	// since the driver's phone still needs a 200 to keep pinging.
	_ = d.UserDB(c).Insert("bus_location_history", map[string]interface{}{
		"bus_id": body.BusID, "lat": body.Lat, "lng": body.Lng,
	}, false, nil)
	d.detectGeofenceEvents(c, body.BusID, body.Lat, body.Lng)

	return c.JSON(fiber.Map{"success": true})
}

// ---- Geofence detection --------------------------------------------------
// Arrived/departed are inferred from position; delayed/breakdown are
// driver-declared (see PostBusStatus) — there's no reliable way to detect
// "delayed" from GPS alone without a live traffic feed.

const geofenceRadiusMeters = 150.0

type routeStop struct {
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lng  float64 `json:"lng"`
}

func (d *Deps) detectGeofenceEvents(c *fiber.Ctx, busID string, lat, lng float64) {
	db := d.UserDB(c)

	var bus map[string]interface{}
	if err := db.SelectOne("buses", url.Values{"select": {"route_id,routes(id,stops)"}, "id": {"eq." + busID}}, &bus); err != nil {
		return
	}
	route, _ := bus["routes"].(map[string]interface{})
	if route == nil {
		return
	}
	routeID, _ := route["id"].(string)
	rawStops, _ := route["stops"].([]interface{})
	if len(rawStops) == 0 {
		return
	}

	var nearestIdx = -1
	var nearestName string
	for i, raw := range rawStops {
		m, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		sLat, _ := m["lat"].(float64)
		sLng, _ := m["lng"].(float64)
		if haversineMeters(lat, lng, sLat, sLng) <= geofenceRadiusMeters {
			nearestIdx = i
			name, _ := m["name"].(string)
			nearestName = name
			break
		}
	}

	// Last stop-tracking event for this bus (arrived/departed only).
	var lastEvents []map[string]interface{}
	_ = db.Select("bus_geofence_events", url.Values{
		"select": {"*"}, "bus_id": {"eq." + busID}, "event": {"in.(arrived,departed)"},
		"order": {"created_at.desc"}, "limit": {"1"},
	}, &lastEvents)

	var currentlyAtIdx = -1
	if len(lastEvents) > 0 {
		if ev, _ := lastEvents[0]["event"].(string); ev == "arrived" {
			if idx, ok := lastEvents[0]["stop_index"].(float64); ok {
				currentlyAtIdx = int(idx)
			}
		}
	}

	if nearestIdx == currentlyAtIdx {
		return // no state change (either still at the same stop, or still between stops)
	}
	stopName := func(idx int) string {
		if idx < 0 || idx >= len(rawStops) {
			return ""
		}
		if m, ok := rawStops[idx].(map[string]interface{}); ok {
			name, _ := m["name"].(string)
			return name
		}
		return ""
	}

	if currentlyAtIdx != -1 {
		_ = db.Insert("bus_geofence_events", map[string]interface{}{
			"bus_id": busID, "route_id": routeID, "stop_index": currentlyAtIdx,
			"stop_name": stopName(currentlyAtIdx), "event": "departed",
		}, false, nil)
	}
	if nearestIdx != -1 {
		_ = db.Insert("bus_geofence_events", map[string]interface{}{
			"bus_id": busID, "route_id": routeID, "stop_index": nearestIdx,
			"stop_name": nearestName, "event": "arrived",
		}, false, nil)
	}
}

func haversineMeters(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadius = 6371000.0
	toRad := func(deg float64) float64 { return deg * math.Pi / 180 }
	dLat := toRad(lat2 - lat1)
	dLng := toRad(lng2 - lng1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return earthRadius * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func (d *Deps) PostBoardingEvent(c *fiber.Ctx) error {
	var body struct {
		StudentID string `json:"studentId"`
		BusID     string `json:"busId"`
		Event     string `json:"event"` // boarded | alighted
	}
	if err := c.BodyParser(&body); err != nil || body.StudentID == "" || body.BusID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentId, busId, and event are required."})
	}
	err := d.UserDB(c).Insert("boarding_events", map[string]interface{}{
		"student_id": body.StudentID, "bus_id": body.BusID, "event": body.Event,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ---- Parent/student: current location of the child's assigned bus ----------

func (d *Deps) ChildBusLocation(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	busID, route, err := d.busForStudent(c, studentID)
	if err != nil || busID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No bus assigned."})
	}
	var loc map[string]interface{}
	_ = d.UserDB(c).SelectOne("bus_locations", url.Values{"select": {"*"}, "bus_id": {"eq." + busID}}, &loc)
	return c.JSON(fiber.Map{"success": true, "busId": busID, "route": route, "location": loc})
}

func (d *Deps) busForStudent(c *fiber.Ctx, studentID string) (string, map[string]interface{}, error) {
	db := d.UserDB(c)
	var assignment map[string]interface{}
	if err := db.SelectOne("route_assignments", url.Values{"select": {"*,routes(*)"}, "student_id": {"eq." + studentID}}, &assignment); err != nil {
		return "", nil, err
	}
	routeID, _ := assignment["route_id"].(string)
	route, _ := assignment["routes"].(map[string]interface{})

	var bus map[string]interface{}
	if err := db.SelectOne("buses", url.Values{"select": {"id"}, "route_id": {"eq." + routeID}}, &bus); err != nil {
		return "", route, err
	}
	busID, _ := bus["id"].(string)
	return busID, route, nil
}

// ChildBusStream pushes the bus's location to the client over Server-Sent
// Events every few seconds, so the map marker updates live without the
// client polling. (We're on plain Postgres via REST here, not Supabase
// Realtime channels, so SSE is the equivalent "live feed" mechanism.)
func (d *Deps) ChildBusStream(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.Status(fiber.StatusBadRequest).SendString("no student linked")
	}
	busID, _, err := d.busForStudent(c, studentID)
	if err != nil || busID == "" {
		return c.Status(fiber.StatusNotFound).SendString("no bus assigned")
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		deadline := time.Now().Add(10 * time.Minute) // one stream session; client reconnects after

		for range ticker.C {
			if time.Now().After(deadline) {
				return
			}
			var loc map[string]interface{}
			if err := d.UserDB(c).SelectOne("bus_locations", url.Values{"select": {"*"}, "bus_id": {"eq." + busID}}, &loc); err == nil {
				payload, _ := json.Marshal(loc)
				if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
					return
				}
				if err := w.Flush(); err != nil {
					return
				}
			}
		}
	})

	return nil
}
