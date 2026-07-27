package handlers

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"edunexus/backend/internal/middleware"
	"edunexus/backend/internal/supabase"
	"github.com/gofiber/fiber/v2"
)

// Simulate answers a what-if question (timing change, exam cancellation)
// with a heuristic estimate grounded in this school's real current data —
// current attendance rate, homework backlog, bus travel time. It is NOT a
// validated simulation model; the coefficients used are simple, disclosed,
// and stored alongside the output so anyone can see exactly how a number
// was produced. Every response is labeled as an estimate, per the brief's
// "label all outputs clearly as estimates/predictions, not certainties."
func (d *Deps) Simulate(c *fiber.Ctx) error {
	var body struct {
		Question string `json:"question"`
	}
	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Question) == "" {
		return c.JSON(fiber.Map{"success": false, "message": "question is required."})
	}
	db := d.UserDB(c)
	q := strings.ToLower(body.Question)

	baseline := gatherSimulationBaseline(db)
	var outcomes fiber.Map

	switch {
	case strings.Contains(q, "exam") && (strings.Contains(q, "cancel") || strings.Contains(q, "postpone") || strings.Contains(q, "reschedul")):
		outcomes = simulateExamChange(baseline)
	case containsTimeShift(q):
		minutes := extractMinutes(q)
		outcomes = simulateTimingChange(baseline, minutes)
	default:
		outcomes = fiber.Map{
			"summary":  "Couldn't identify a specific timing or exam-schedule change in that question, so here's the current baseline this school is operating from instead — ask again with a specific change (e.g. 'delay start by 20 minutes' or 'cancel Friday's exam') for a quantified estimate.",
			"baseline": baseline,
		}
	}

	user := middleware.UserFromLocals(c)
	_ = db.Insert("simulation_scenarios", map[string]interface{}{
		"created_by": user.Name, "question": body.Question,
		"assumptions_jsonb": map[string]interface{}(baseline), "predicted_outcomes_jsonb": map[string]interface{}(outcomes),
	}, false, nil)

	return c.JSON(fiber.Map{
		"success": true, "baseline": baseline, "outcomes": outcomes,
		"note": "This is a simple heuristic estimate from current school data, not a validated forecast — treat it as a starting point for discussion, not a decision on its own.",
	})
}

func gatherSimulationBaseline(db *supabase.Client) fiber.Map {
	var attendance []map[string]interface{}
	_ = db.Select("attendance", url.Values{"select": {"status"}, "limit": {"500"}, "order": {"date.desc"}}, &attendance)
	present := 0
	for _, a := range attendance {
		if s, _ := a["status"].(string); s == "present" {
			present++
		}
	}
	attendanceRate := 0.0
	if len(attendance) > 0 {
		attendanceRate = float64(present) / float64(len(attendance)) * 100
	}

	var students []map[string]interface{}
	_ = db.Select("students", url.Values{"select": {"id"}, "limit": {"200"}}, &students)
	var homework []map[string]interface{}
	_ = db.Select("homework", url.Values{"select": {"id"}}, &homework)
	var submissions []map[string]interface{}
	_ = db.Select("homework_submissions", url.Values{"select": {"id"}}, &submissions)
	avgPending := 0.0
	if len(students) > 0 && len(homework) > 0 {
		totalPossible := float64(len(students) * len(homework))
		if totalPossible > 0 {
			avgPending = (totalPossible - float64(len(submissions))) / float64(len(students))
			if avgPending < 0 {
				avgPending = 0
			}
		}
	}

	var history []map[string]interface{}
	_ = db.Select("bus_location_history", url.Values{"select": {"bus_id,lat,lng,created_at"}, "order": {"created_at.desc"}, "limit": {"100"}}, &history)
	avgBusTravelMin := estimateAvgBusTravel(history)

	return fiber.Map{
		"attendanceRatePct": round1(attendanceRate), "attendanceSampleSize": len(attendance),
		"avgHomeworkPendingPerStudent": round1(avgPending),
		"avgBusTravelMinutesPerRoute":  round1(avgBusTravelMin),
	}
}

func estimateAvgBusTravel(history []map[string]interface{}) float64 {
	// Extremely rough: total distance covered per bus over the sampled
	// window, divided by an assumed 20 km/h. Good enough to give a
	// ballpark for the simulator, not presented as a precise figure.
	byBus := map[string][]map[string]interface{}{}
	for _, h := range history {
		busID, _ := h["bus_id"].(string)
		byBus[busID] = append(byBus[busID], h)
	}
	if len(byBus) == 0 {
		return 20 // documented fallback assumption when there's no location data yet
	}
	totalMin := 0.0
	n := 0
	for _, points := range byBus {
		if len(points) < 2 {
			continue
		}
		lat1, _ := points[len(points)-1]["lat"].(float64)
		lng1, _ := points[len(points)-1]["lng"].(float64)
		lat2, _ := points[0]["lat"].(float64)
		lng2, _ := points[0]["lng"].(float64)
		distKm := haversineMeters(lat1, lng1, lat2, lng2) / 1000
		totalMin += (distKm / fallbackAvgSpeedKmh) * 60
		n++
	}
	if n == 0 {
		return 20
	}
	return totalMin / float64(n)
}

func simulateTimingChange(baseline fiber.Map, minutes int) fiber.Map {
	busTravel, _ := baseline["avgBusTravelMinutesPerRoute"].(float64)
	attendance, _ := baseline["attendanceRatePct"].(float64)

	// Disclosed, simple coefficients — not derived from any real
	// before/after study, since this app has no historical record of a
	// past timing change to learn from. Framed as a directional estimate.
	transportShiftPct := (float64(minutes) / busTravel) * 100
	attendanceDeltaPct := -0.05 * float64(minutes) // documented assumption: -0.05pp attendance per minute of schedule shift
	if minutes < 0 {
		attendanceDeltaPct = -attendanceDeltaPct
	}

	return fiber.Map{
		"summary": fmt.Sprintf(
			"Shifting the schedule by %d minutes would extend each bus route's active window by roughly %.0f%% relative to its current ~%.0f-minute average, and (using a simple linear assumption, not a validated model) attendance might move by about %.1f percentage points from the current %.1f%%.",
			minutes, transportShiftPct, busTravel, attendanceDeltaPct, attendance,
		),
		"method":                      "transportShiftPct = minutes / avgBusTravelMinutes * 100; attendanceDeltaPct = -0.05 * minutes (a documented, undemonstrated assumption).",
		"estimatedTransportShiftPct":  round1(transportShiftPct),
		"estimatedAttendanceDeltaPct": round1(attendanceDeltaPct),
	}
}

func simulateExamChange(baseline fiber.Map) fiber.Map {
	pending, _ := baseline["avgHomeworkPendingPerStudent"].(float64)
	freedStudyHoursEstimate := pending * 0.5 // documented assumption: ~30 min of exam prep displaced per pending homework item

	return fiber.Map{
		"summary": fmt.Sprintf(
			"With an average of %.1f pending homework items per student right now, canceling/postponing an exam would free roughly %.1f estimated study hours per student that would otherwise have gone to exam prep — a rough proxy, not a measured workload study.",
			pending, freedStudyHoursEstimate,
		),
		"method":                   "freedStudyHoursEstimate = avgHomeworkPendingPerStudent * 0.5 (a documented, undemonstrated assumption).",
		"estimatedFreedStudyHours": round1(freedStudyHoursEstimate),
	}
}

var minutesRe = regexp.MustCompile(`(\d+)\s*(?:min|minute)`)

func extractMinutes(q string) int {
	m := minutesRe.FindStringSubmatch(q)
	if len(m) < 2 {
		return 15 // documented default when a change is implied but no number given
	}
	n, err := strconv.Atoi(m[1])
	if err != nil {
		return 15
	}
	if strings.Contains(q, "earlier") || strings.Contains(q, "advance") {
		return -n
	}
	return n
}

func containsTimeShift(q string) bool {
	for _, kw := range []string{"start time", "timing", "schedule", "delay", "earlier", "later", "shift"} {
		if strings.Contains(q, kw) {
			return true
		}
	}
	return false
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}
