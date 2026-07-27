package handlers

import (
	"math"
	"testing"
)

// ---- util.go ------------------------------------------------------------

func TestOrEmpty(t *testing.T) {
	if got := orEmpty(nil); got == nil || len(got) != 0 {
		t.Fatalf("orEmpty(nil) = %v, want empty non-nil slice", got)
	}
	rows := []map[string]interface{}{{"a": 1}}
	if got := orEmpty(rows); len(got) != 1 {
		t.Fatalf("orEmpty(rows) = %v, want unchanged", got)
	}
}

func TestTodayDateFormat(t *testing.T) {
	d := todayDate()
	if len(d) != 10 || d[4] != '-' || d[7] != '-' {
		t.Fatalf("todayDate() = %q, want YYYY-MM-DD shape", d)
	}
}

// ---- bus.go: haversineMeters ---------------------------------------------

func TestHaversineMetersZeroDistance(t *testing.T) {
	d := haversineMeters(12.9, 79.1, 12.9, 79.1)
	if d != 0 {
		t.Fatalf("distance between identical points = %f, want 0", d)
	}
}

func TestHaversineMetersKnownDistance(t *testing.T) {
	// Roughly 1 degree of latitude ≈ 111km at the equator.
	d := haversineMeters(0, 0, 1, 0)
	if d < 110000 || d > 112000 {
		t.Fatalf("distance for 1 degree latitude = %f meters, want ~111000", d)
	}
}

func TestHaversineMetersWithinGeofenceRadius(t *testing.T) {
	// Two points ~50m apart (roughly 0.00045 degrees latitude) should be
	// well within the 150m geofence radius used for arrival detection.
	d := haversineMeters(12.9000, 79.1000, 12.90045, 79.1000)
	if d > geofenceRadiusMeters {
		t.Fatalf("expected points ~50m apart to be within %vm geofence, got %fm", geofenceRadiusMeters, d)
	}
}

// ---- exams.go: letterGrade ------------------------------------------------

func TestLetterGrade(t *testing.T) {
	cases := []struct {
		marks, total float64
		want         string
	}{
		{95, 100, "A+"},
		{85, 100, "A"},
		{72, 100, "B"},
		{65, 100, "C"},
		{55, 100, "D"},
		{30, 100, "F"},
		{0, 0, "-"}, // guards divide-by-zero
	}
	for _, tc := range cases {
		if got := letterGrade(tc.marks, tc.total); got != tc.want {
			t.Errorf("letterGrade(%v, %v) = %q, want %q", tc.marks, tc.total, got, tc.want)
		}
	}
}

// ---- engagement.go: clamp15 -----------------------------------------------

func TestClamp15(t *testing.T) {
	cases := map[int]int{0: 1, -5: 1, 1: 1, 3: 3, 5: 5, 6: 5, 100: 5}
	for in, want := range cases {
		if got := clamp15(in); got != want {
			t.Errorf("clamp15(%d) = %d, want %d", in, got, want)
		}
	}
}

// ---- classenergy.go: meanOf / meanOfAll -----------------------------------

func TestMeanOf(t *testing.T) {
	avg, n := meanOf([]float64{1, 2, 3, 4, 5})
	if n != 5 || math.Abs(avg-3) > 1e-9 {
		t.Fatalf("meanOf = (%v, %v), want (3, 5)", avg, n)
	}
	if avg, n := meanOf(nil); avg != 0 || n != 0 {
		t.Fatalf("meanOf(nil) = (%v, %v), want (0, 0)", avg, n)
	}
}

func TestMeanOfAll(t *testing.T) {
	logs := []map[string]interface{}{
		{"engagement_score": 4.0},
		{"engagement_score": 2.0},
		{"engagement_score": "not-a-number"}, // must be skipped, not crash
	}
	avg, n := meanOfAll(logs)
	if n != 2 || math.Abs(avg-3) > 1e-9 {
		t.Fatalf("meanOfAll = (%v, %v), want (3, 2)", avg, n)
	}
}

// ---- friendship.go: confidenceFromSample / minInt -------------------------

func TestConfidenceFromSampleIsCapped(t *testing.T) {
	if got := confidenceFromSample(3); got <= 0 || got >= 1 {
		t.Fatalf("confidenceFromSample(3) = %v, want in (0,1)", got)
	}
	if got := confidenceFromSample(1000); got > 0.85 {
		t.Fatalf("confidenceFromSample(1000) = %v, want capped at 0.85", got)
	}
}

func TestMinInt(t *testing.T) {
	if minInt(3, 5) != 3 {
		t.Fatalf("minInt(3,5) should be 3")
	}
	if minInt(5, 3) != 3 {
		t.Fatalf("minInt(5,3) should be 3")
	}
}

// ---- schoolmemory.go: parseSchoolMemoryQuery (rule-based path) -----------

func TestParseSchoolMemoryQueryStripsStopwords(t *testing.T) {
	keywords, eventType := parseSchoolMemoryQuery("Who has participated in robotics since Class 6")
	if eventType != "" {
		t.Fatalf("rule-based parser should never set eventType, got %q", eventType)
	}
	found := false
	for _, k := range keywords {
		if k == "robotics" {
			found = true
		}
		if k == "who" || k == "since" || k == "class" {
			t.Fatalf("stopword %q leaked into keywords: %v", k, keywords)
		}
	}
	if !found {
		t.Fatalf("expected 'robotics' in keywords, got %v", keywords)
	}
}

func TestParseSchoolMemoryQueryEmptyInput(t *testing.T) {
	keywords, _ := parseSchoolMemoryQuery("who has and the")
	if len(keywords) != 0 {
		t.Fatalf("all-stopword query should yield no keywords, got %v", keywords)
	}
}

func TestOrIlike(t *testing.T) {
	got := orIlike("description", []string{"robotics", "chess"})
	want := "description.ilike.*robotics*,description.ilike.*chess*"
	if got != want {
		t.Fatalf("orIlike = %q, want %q", got, want)
	}
}

// ---- simulator.go ----------------------------------------------------

func TestExtractMinutes(t *testing.T) {
	if got := extractMinutes("delay start by 20 minutes"); got != 20 {
		t.Fatalf("extractMinutes = %d, want 20", got)
	}
	if got := extractMinutes("shift start 15 min earlier"); got != -15 {
		t.Fatalf("extractMinutes with 'earlier' = %d, want -15", got)
	}
	if got := extractMinutes("change the schedule"); got != 15 {
		t.Fatalf("extractMinutes with no number should fall back to documented default 15, got %d", got)
	}
}

func TestContainsTimeShift(t *testing.T) {
	if !containsTimeShift("delay start time by 20 minutes") {
		t.Fatalf("expected timing keywords to be detected")
	}
	if containsTimeShift("cancel friday's exam") {
		t.Fatalf("exam-cancellation question should not match timing-shift detector")
	}
}

func TestRound1(t *testing.T) {
	if got := round1(3.14159); got != 3.1 {
		t.Fatalf("round1(3.14159) = %v, want 3.1", got)
	}
	if got := round1(3.15); got != 3.2 {
		t.Fatalf("round1(3.15) = %v, want 3.2 (round-half-up)", got)
	}
}

func TestEstimateAvgBusTravelFallsBackWithNoHistory(t *testing.T) {
	if got := estimateAvgBusTravel(nil); got != 20 {
		t.Fatalf("estimateAvgBusTravel(nil) = %v, want documented fallback 20", got)
	}
}

// ---- gamification.go --------------------------------------------------

func TestHighestReachedMilestone(t *testing.T) {
	cases := []struct {
		streak int
		want   string
	}{
		{0, ""},
		{4, ""},
		{5, "🔥 5-Day Rider"},
		{9, "🔥 5-Day Rider"},
		{10, "🚌 10-Day Rider"},
		{19, "🚌 10-Day Rider"},
		{20, "🚍 20-Day Rider"},
		{49, "🚍 20-Day Rider"},
		{50, "🏅 50-Day Rider"},
		{200, "🏅 50-Day Rider"},
	}
	for _, tc := range cases {
		if got := highestReachedMilestone(tc.streak); got != tc.want {
			t.Errorf("highestReachedMilestone(%d) = %q, want %q", tc.streak, got, tc.want)
		}
	}
}

func TestExamDateOfPrefersExamDateOverCreatedAt(t *testing.T) {
	g := map[string]interface{}{
		"created_at": "2026-01-01T00:00:00Z",
		"exams":      map[string]interface{}{"exam_date": "2026-03-15"},
	}
	if got := examDateOf(g); got != "2026-03-15" {
		t.Fatalf("examDateOf with a linked exam = %q, want the exam's date", got)
	}
}

func TestExamDateOfFallsBackToCreatedAt(t *testing.T) {
	g := map[string]interface{}{"created_at": "2026-01-01T00:00:00Z"}
	if got := examDateOf(g); got != "2026-01-01T00:00:00Z" {
		t.Fatalf("examDateOf with no linked exam = %q, want created_at fallback", got)
	}
}
