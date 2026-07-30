package handlers

import (
	"fmt"
	"net/url"
	"time"

	"github.com/gofiber/fiber/v2"
)

func (d *Deps) CreateClassEnergyLog(c *fiber.Ctx) error {
	var body struct {
		Class           string `json:"class"`
		Period          int    `json:"period"`
		EngagementScore int    `json:"engagementScore"`
		Notes           string `json:"notes"`
	}
	if err := c.BodyParser(&body); err != nil || body.Class == "" || body.EngagementScore < 1 || body.EngagementScore > 5 {
		return c.JSON(fiber.Map{"success": false, "message": "class and engagementScore (1-5) are required."})
	}
	row := map[string]interface{}{"class": body.Class, "engagement_score": body.EngagementScore, "notes": body.Notes}
	if body.Period > 0 {
		row["period"] = body.Period
	}
	if err := d.UserDB(c).Insert("class_energy_logs", row, false, nil); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ClassEnergyInsights aggregates class_energy_logs into observations —
// "Mondays underperform", "later periods score lower" — each labeled with
// its sample size and only surfaced once there's enough data to say
// anything ("present findings as observations with the underlying sample
// size shown, not as unqualified facts," per the brief). This does not
// claim minute-level attention curves — a teacher logs once per period, not
// continuously, so "attention drops after N minutes" isn't something this
// data can actually support; period-level framing is the honest version of
// that same idea.
func (d *Deps) ClassEnergyInsights(c *fiber.Ctx) error {
	class := c.Query("class")
	if class == "" {
		class = d.classForUser(c) // teacher's own assigned class, falling back to "10A"
	}
	var logs []map[string]interface{}
	_ = d.UserDB(c).Select("class_energy_logs", url.Values{
		"select": {"*"}, "class": {"eq." + class}, "order": {"session_date.desc"}, "limit": {"200"},
	}, &logs)

	byDay := map[string][]float64{}
	byPeriod := map[int][]float64{}
	for _, l := range logs {
		score, _ := l["engagement_score"].(float64)
		if dateStr, ok := l["session_date"].(string); ok {
			if t, err := time.Parse("2006-01-02", dateStr); err == nil {
				day := t.Weekday().String()
				byDay[day] = append(byDay[day], score)
			}
		}
		if p, ok := l["period"].(float64); ok {
			byPeriod[int(p)] = append(byPeriod[int(p)], score)
		}
	}

	const minSample = 3
	observations := make([]string, 0)

	if avg, n := meanOf(byDay["Monday"]); n >= minSample {
		if overall, on := meanOfAll(logs); on > 0 && avg < overall-0.4 {
			observations = append(observations, fmt.Sprintf("Mondays average %.1f/5 vs an overall %.1f/5 (based on %d logged Monday sessions).", avg, overall, n))
		}
	}
	if overall, on := meanOfAll(logs); on > 0 {
		worstPeriod, worstAvg, worstN := -1, 0.0, 0
		for p, scores := range byPeriod {
			avg, n := meanOf(scores)
			if n < minSample {
				continue
			}
			if worstPeriod == -1 || avg < worstAvg {
				worstPeriod, worstAvg, worstN = p, avg, n
			}
		}
		if worstPeriod != -1 && worstAvg < overall-0.4 {
			observations = append(observations, fmt.Sprintf("Period %d averages %.1f/5 vs an overall %.1f/5 (based on %d logged sessions in that period).", worstPeriod, worstAvg, overall, worstN))
		}
	}
	if len(logs) < minSample {
		observations = append(observations, "Not enough logged sessions yet to surface a reliable pattern — keep logging after class.")
	}

	return c.JSON(fiber.Map{
		"success": true, "class": class, "sampleSize": len(logs), "observations": observations,
		"note": "These are observations from teacher-logged ratings, not measured attention — treat them as a starting point for a conversation, not a verdict.",
	})
}

func meanOf(vals []float64) (float64, int) {
	if len(vals) == 0 {
		return 0, 0
	}
	sum := 0.0
	for _, v := range vals {
		sum += v
	}
	return sum / float64(len(vals)), len(vals)
}

func meanOfAll(logs []map[string]interface{}) (float64, int) {
	vals := make([]float64, 0, len(logs))
	for _, l := range logs {
		if s, ok := l["engagement_score"].(float64); ok {
			vals = append(vals, s)
		}
	}
	return meanOf(vals)
}
