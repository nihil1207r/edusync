package handlers

import (
	"net/url"
	"time"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// ---- Driver: delayed/breakdown status (not geofence-detectable) --------

func (d *Deps) PostBusStatus(c *fiber.Ctx) error {
	var body struct {
		BusID  string `json:"busId"`
		Status string `json:"status"` // delayed | breakdown | resolved
		Note   string `json:"note"`
	}
	if err := c.BodyParser(&body); err != nil || body.BusID == "" || body.Status == "" {
		return c.JSON(fiber.Map{"success": false, "message": "busId and status are required."})
	}
	if body.Status != "delayed" && body.Status != "breakdown" && body.Status != "resolved" {
		return c.JSON(fiber.Map{"success": false, "message": "status must be delayed, breakdown, or resolved."})
	}
	err := d.UserDB(c).Insert("bus_geofence_events", map[string]interface{}{
		"bus_id": body.BusID, "event": body.Status, "note": body.Note,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ---- Family: geofence event feed for the child's assigned bus -----------

func (d *Deps) ChildBusEvents(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	busID, _, err := d.busForStudent(c, studentID)
	if err != nil || busID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No bus assigned."})
	}
	var events []map[string]interface{}
	_ = d.UserDB(c).Select("bus_geofence_events", url.Values{
		"select": {"*"}, "bus_id": {"eq." + busID}, "order": {"created_at.desc"}, "limit": {"20"},
	}, &events)
	return c.JSON(fiber.Map{"success": true, "events": orEmpty(events)})
}

// ---- Family: ETA to the child's stop -------------------------------------
// Speed is estimated from the two most recent points in bus_location_history.
// Without enough history yet (first ping, or the bus hasn't moved), falls
// back to a documented average school-bus speed rather than guessing —
// labeled as an estimate either way, never presented as a guarantee.

const fallbackAvgSpeedKmh = 20.0

func (d *Deps) ChildBusETA(c *fiber.Ctx) error {
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	db := d.UserDB(c)

	var assignment map[string]interface{}
	if err := db.SelectOne("route_assignments", url.Values{"select": {"*,routes(stops)"}, "student_id": {"eq." + studentID}}, &assignment); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": "No route assigned."})
	}
	stopIndexF, _ := assignment["stop_index"].(float64)
	stopIndex := int(stopIndexF)
	route, _ := assignment["routes"].(map[string]interface{})
	rawStops, _ := route["stops"].([]interface{})
	if stopIndex < 0 || stopIndex >= len(rawStops) {
		return c.JSON(fiber.Map{"success": false, "message": "Assigned stop not found on route."})
	}
	stopMap, _ := rawStops[stopIndex].(map[string]interface{})
	stopLat, _ := stopMap["lat"].(float64)
	stopLng, _ := stopMap["lng"].(float64)
	stopName, _ := stopMap["name"].(string)

	busID, _, err := d.busForStudent(c, studentID)
	if err != nil || busID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No bus assigned."})
	}

	var history []map[string]interface{}
	_ = db.Select("bus_location_history", url.Values{
		"select": {"lat,lng,created_at"}, "bus_id": {"eq." + busID}, "order": {"created_at.desc"}, "limit": {"2"},
	}, &history)
	if len(history) == 0 {
		return c.JSON(fiber.Map{"success": false, "message": "No location data for this bus yet."})
	}

	curLat, _ := history[0]["lat"].(float64)
	curLng, _ := history[0]["lng"].(float64)
	distanceMeters := haversineMeters(curLat, curLng, stopLat, stopLng)

	speedKmh := fallbackAvgSpeedKmh
	speedIsEstimated := false
	if len(history) == 2 {
		prevLat, _ := history[1]["lat"].(float64)
		prevLng, _ := history[1]["lng"].(float64)
		t1, err1 := time.Parse(time.RFC3339, asString(history[0]["created_at"]))
		t0, err0 := time.Parse(time.RFC3339, asString(history[1]["created_at"]))
		if err0 == nil && err1 == nil {
			elapsedHours := t1.Sub(t0).Hours()
			movedMeters := haversineMeters(prevLat, prevLng, curLat, curLng)
			if elapsedHours > 0 {
				computed := (movedMeters / 1000) / elapsedHours
				// A stopped/idling bus computes ~0 km/h, which would make the
				// ETA blow up to infinity — fall back to the average instead
				// of reporting a nonsensical number.
				if computed >= 3 {
					speedKmh = computed
					speedIsEstimated = true
				}
			}
		}
	}

	etaMinutes := int((distanceMeters / 1000) / speedKmh * 60)
	if etaMinutes < 1 {
		etaMinutes = 1
	}

	return c.JSON(fiber.Map{
		"success": true, "stopName": stopName, "etaMinutes": etaMinutes,
		"distanceMeters": int(distanceMeters), "speedEstimated": speedIsEstimated,
		"note": "Estimate based on the bus's recent movement, not live traffic — treat as approximate.",
	})
}

func asString(v interface{}) string {
	s, _ := v.(string)
	return s
}

// ---- Driver: which bus is mine, and who's on my route -------------------

func (d *Deps) DriverMyBus(c *fiber.Ctx) error {
	bus, err := d.resolveBusForDriver(c)
	if err != nil || bus == nil {
		return c.JSON(fiber.Map{"success": false, "message": "No bus assigned to this driver account. Ask an admin to link your login to a bus."})
	}
	return c.JSON(fiber.Map{"success": true, "bus": bus})
}

// resolveBusForDriver looks up the bus by driver_id (the real link, added in
// migration 006) and falls back to matching driver_name for buses created
// before that link existed — documented simplification, not a security
// boundary (RLS still governs what the driver can actually read/write).
func (d *Deps) resolveBusForDriver(c *fiber.Ctx) (map[string]interface{}, error) {
	user := middleware.UserFromLocals(c)
	db := d.UserDB(c)

	var bus map[string]interface{}
	if err := db.SelectOne("buses", url.Values{"select": {"*,routes(*)"}, "driver_id": {"eq." + user.ID}}, &bus); err == nil && bus != nil {
		return bus, nil
	}
	if err := db.SelectOne("buses", url.Values{"select": {"*,routes(*)"}, "driver_name": {"eq." + user.Name}}, &bus); err == nil && bus != nil {
		return bus, nil
	}
	return nil, nil
}

func (d *Deps) DriverRoster(c *fiber.Ctx) error {
	bus, err := d.resolveBusForDriver(c)
	if err != nil || bus == nil {
		return c.JSON(fiber.Map{"success": false, "message": "No bus assigned."})
	}
	routeID, _ := bus["route_id"].(string)
	if routeID == "" {
		return c.JSON(fiber.Map{"success": true, "roster": []map[string]interface{}{}})
	}
	var roster []map[string]interface{}
	_ = d.UserDB(c).Select("route_assignments", url.Values{
		"select": {"*,students(id,name,roll_no,class)"}, "route_id": {"eq." + routeID}, "order": {"stop_index.asc"},
	}, &roster)
	return c.JSON(fiber.Map{"success": true, "roster": orEmpty(roster)})
}

func (d *Deps) PostSOS(c *fiber.Ctx) error {
	var body struct {
		BusID string  `json:"busId"`
		Lat   float64 `json:"lat"`
		Lng   float64 `json:"lng"`
		Note  string  `json:"note"`
	}
	if err := c.BodyParser(&body); err != nil || body.BusID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "busId is required."})
	}
	user := middleware.UserFromLocals(c)
	err := d.UserDB(c).Insert("sos_alerts", map[string]interface{}{
		"bus_id": body.BusID, "driver_id": user.ID, "lat": body.Lat, "lng": body.Lng, "note": body.Note,
	}, false, nil)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "sos.raise", "sos_alerts", "", fiber.Map{"after": fiber.Map{"busId": body.BusID, "note": body.Note}})
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) ListSOS(c *fiber.Ctx) error {
	var alerts []map[string]interface{}
	_ = d.UserDB(c).Select("sos_alerts", url.Values{
		"select": {"*,buses(number_plate,driver_name)"}, "resolved": {"eq.false"}, "order": {"created_at.desc"},
	}, &alerts)
	return c.JSON(fiber.Map{"success": true, "alerts": orEmpty(alerts)})
}

func (d *Deps) ResolveSOS(c *fiber.Ctx) error {
	var body struct {
		AlertID string `json:"alertId"`
	}
	if err := c.BodyParser(&body); err != nil || body.AlertID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "alertId is required."})
	}
	user := middleware.UserFromLocals(c)
	err := d.UserDB(c).Update("sos_alerts", url.Values{"id": {"eq." + body.AlertID}}, map[string]interface{}{
		"resolved": true, "resolved_by": user.Name, "resolved_at": time.Now().Format(time.RFC3339),
	})
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "sos.resolve", "sos_alerts", body.AlertID, fiber.Map{"after": fiber.Map{"resolved": true}})
	return c.JSON(fiber.Map{"success": true})
}
