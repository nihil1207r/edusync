package handlers

import (
	"net/url"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

// classForUser returns the class a teacher/student/parent should be scoped
// to by default: a teacher's own assigned class (profiles.class), or the
// linked child's class for a student/parent. Falls back to "10A" only if
// nothing is resolvable (e.g. a freshly-seeded account with no class set),
// matching the rest of this codebase's existing single-class-per-teacher
// simplification rather than introducing a new default.
func (d *Deps) classForUser(c *fiber.Ctx) string {
	user := middleware.UserFromLocals(c)
	if user.Class != "" {
		return user.Class
	}
	if studentID, _ := d.resolveStudentIDForUser(c); studentID != "" {
		var student map[string]interface{}
		_ = d.UserDB(c).SelectOne("students", url.Values{"select": {"class"}, "id": {"eq." + studentID}}, &student)
		if class, _ := student["class"].(string); class != "" {
			return class
		}
	}
	return "10A"
}

// ---- Social behavior (teacher logs, student/parent view own child) -------

func (d *Deps) CreateBehaviorLog(c *fiber.Ctx) error {
	var body struct {
		StudentID string `json:"studentId"`
		Class     string `json:"class"`
		Category  string `json:"category"`
		Note      string `json:"note"`
		Rating    int    `json:"rating"`
	}
	if err := c.BodyParser(&body); err != nil || body.StudentID == "" || body.Note == "" {
		return c.JSON(fiber.Map{"success": false, "message": "studentId and note are required."})
	}
	if body.Category == "" {
		body.Category = "neutral"
	}
	if body.Class == "" {
		body.Class = d.classForUser(c)
	}
	user := middleware.UserFromLocals(c)
	var created []map[string]interface{}
	err := d.UserDB(c).Insert("student_behavior_logs", map[string]interface{}{
		"student_id": body.StudentID, "class": body.Class, "category": body.Category,
		"note": body.Note, "rating": body.Rating, "logged_by": user.Name,
	}, true, &created)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "behavior.create", "student_behavior_logs", body.StudentID, fiber.Map{"after": body})
	return c.JSON(fiber.Map{"success": true, "log": firstOrNil(created)})
}

func (d *Deps) ListBehaviorLogs(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	q := url.Values{"select": {"*,students(name,roll_no)"}, "order": {"created_at.desc"}, "limit": {"100"}}
	if user.Role == "student" || user.Role == "parent" {
		studentID, err := d.resolveStudentIDForUser(c)
		if err != nil || studentID == "" {
			return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
		}
		q.Set("student_id", "eq."+studentID)
	} else if studentID := c.Query("studentId"); studentID != "" {
		q.Set("student_id", "eq."+studentID)
	} else {
		q.Set("class", "eq."+d.classForUser(c))
	}
	var rows []map[string]interface{}
	if err := d.UserDB(c).Select("student_behavior_logs", q, &rows); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "logs": orEmpty(rows)})
}

// ---- Picnics / trips ------------------------------------------------------

func (d *Deps) CreatePicnic(c *fiber.Ctx) error {
	var body struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Class       string  `json:"class"`
		Location    string  `json:"location"`
		EventDate   string  `json:"eventDate"`
		Cost        float64 `json:"cost"`
		MaxStudents int     `json:"maxStudents"`
	}
	if err := c.BodyParser(&body); err != nil || body.Title == "" || body.EventDate == "" {
		return c.JSON(fiber.Map{"success": false, "message": "title and eventDate are required."})
	}
	if body.Class == "" {
		body.Class = d.classForUser(c)
	}
	user := middleware.UserFromLocals(c)
	var created []map[string]interface{}
	row := map[string]interface{}{
		"title": body.Title, "description": body.Description, "class": body.Class,
		"location": body.Location, "event_date": body.EventDate, "cost": body.Cost,
		"created_by": user.Name,
	}
	if body.MaxStudents > 0 {
		row["max_students"] = body.MaxStudents
	}
	if err := d.UserDB(c).Insert("picnics", row, true, &created); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "picnic.create", "picnics", "", fiber.Map{"after": body})
	return c.JSON(fiber.Map{"success": true, "picnic": firstOrNil(created)})
}

func (d *Deps) ListPicnics(c *fiber.Ctx) error {
	class := c.Query("class")
	if class == "" {
		class = d.classForUser(c)
	}
	q := url.Values{"select": {"*"}, "order": {"event_date.asc"}}
	if class != "" {
		q.Set("class", "eq."+class)
	}
	var rows []map[string]interface{}
	if err := d.UserDB(c).Select("picnics", q, &rows); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "picnics": orEmpty(rows)})
}

// RequestPicnic lets a logged-in student ask to join a picnic.
func (d *Deps) RequestPicnic(c *fiber.Ctx) error {
	var body struct {
		PicnicID string `json:"picnicId"`
	}
	if err := c.BodyParser(&body); err != nil || body.PicnicID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "picnicId is required."})
	}
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	var created []map[string]interface{}
	dbErr := d.UserDB(c).Upsert("picnic_requests", []map[string]interface{}{{
		"picnic_id": body.PicnicID, "student_id": studentID, "status": "pending",
	}}, "picnic_id,student_id", false, &created)
	if dbErr != nil {
		return c.JSON(fiber.Map{"success": false, "message": dbErr.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// SubmitPicnicConsent is the parent-facing "picnic form": the parent
// confirms (or declines) consent for their child's already-made request.
func (d *Deps) SubmitPicnicConsent(c *fiber.Ctx) error {
	var body struct {
		PicnicID string `json:"picnicId"`
		Consent  bool   `json:"consent"`
		Note     string `json:"note"`
	}
	if err := c.BodyParser(&body); err != nil || body.PicnicID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "picnicId is required."})
	}
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	db := d.UserDB(c)

	// A plain UPDATE, not an upsert: an upsert here would also overwrite
	// `status`, silently reverting a teacher's approve/reject decision back
	// to "pending" every time a parent (re)submits this form. The student's
	// own join request must already exist — the frontend only shows this
	// form once it does.
	var existing map[string]interface{}
	existErr := db.SelectOne("picnic_requests", url.Values{
		"select": {"id"}, "picnic_id": {"eq." + body.PicnicID}, "student_id": {"eq." + studentID},
	}, &existing)
	if existErr != nil || existing == nil {
		return c.JSON(fiber.Map{"success": false, "message": "Your child hasn't requested this picnic yet — ask them to request it first."})
	}

	dbErr := db.Update("picnic_requests", url.Values{
		"picnic_id": {"eq." + body.PicnicID}, "student_id": {"eq." + studentID},
	}, map[string]interface{}{"parent_consent": body.Consent, "parent_note": body.Note})
	if dbErr != nil {
		return c.JSON(fiber.Map{"success": false, "message": dbErr.Error()})
	}
	d.Audit(c, "picnic.consent", "picnic_requests", body.PicnicID, fiber.Map{"after": body})
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) ListPicnicRequests(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	q := url.Values{"select": {"*,students(name,roll_no,class)"}, "order": {"created_at.desc"}}
	if picnicID := c.Query("picnicId"); picnicID != "" {
		q.Set("picnic_id", "eq."+picnicID)
	}
	if user.Role == "student" || user.Role == "parent" {
		studentID, err := d.resolveStudentIDForUser(c)
		if err != nil || studentID == "" {
			return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
		}
		q.Set("student_id", "eq."+studentID)
	}
	var rows []map[string]interface{}
	if err := d.UserDB(c).Select("picnic_requests", q, &rows); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "requests": orEmpty(rows)})
}

func (d *Deps) UpdatePicnicRequest(c *fiber.Ctx) error {
	var body struct {
		RequestID string `json:"requestId"`
		Status    string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil || body.RequestID == "" || body.Status == "" {
		return c.JSON(fiber.Map{"success": false, "message": "requestId and status are required."})
	}
	err := d.UserDB(c).Update("picnic_requests", url.Values{"id": {"eq." + body.RequestID}}, map[string]interface{}{
		"status": body.Status,
	})
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "picnic_request.update", "picnic_requests", body.RequestID, fiber.Map{"after": fiber.Map{"status": body.Status}})
	return c.JSON(fiber.Map{"success": true})
}

// ---- Parent-Teacher Meeting (PTM) schedule --------------------------------

func (d *Deps) CreatePTM(c *fiber.Ctx) error {
	var body struct {
		Class         string `json:"class"`
		ScheduledDate string `json:"scheduledDate"`
		StartTime     string `json:"startTime"`
		EndTime       string `json:"endTime"`
		Location      string `json:"location"`
		Agenda        string `json:"agenda"`
	}
	if err := c.BodyParser(&body); err != nil || body.ScheduledDate == "" || body.StartTime == "" || body.EndTime == "" {
		return c.JSON(fiber.Map{"success": false, "message": "scheduledDate, startTime, and endTime are required."})
	}
	if body.EndTime <= body.StartTime {
		return c.JSON(fiber.Map{"success": false, "message": "endTime must be after startTime."})
	}
	if body.Class == "" {
		body.Class = d.classForUser(c)
	}
	user := middleware.UserFromLocals(c)
	var created []map[string]interface{}
	err := d.UserDB(c).Insert("ptm_schedules", map[string]interface{}{
		"class": body.Class, "teacher_name": user.Name, "scheduled_date": body.ScheduledDate,
		"start_time": body.StartTime, "end_time": body.EndTime,
		"location": body.Location, "agenda": body.Agenda,
	}, true, &created)
	if err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "ptm.create", "ptm_schedules", "", fiber.Map{"after": body})
	return c.JSON(fiber.Map{"success": true, "ptm": firstOrNil(created)})
}

func (d *Deps) ListPTM(c *fiber.Ctx) error {
	class := c.Query("class")
	if class == "" {
		class = d.classForUser(c)
	}
	q := url.Values{"select": {"*"}, "order": {"scheduled_date.asc"}}
	if class != "" {
		q.Set("class", "eq."+class)
	}
	var rows []map[string]interface{}
	if err := d.UserDB(c).Select("ptm_schedules", q, &rows); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "schedules": orEmpty(rows)})
}

func (d *Deps) BookPTM(c *fiber.Ctx) error {
	var body struct {
		PTMID    string `json:"ptmId"`
		SlotTime string `json:"slotTime"`
	}
	if err := c.BodyParser(&body); err != nil || body.PTMID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "ptmId is required."})
	}
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	var created []map[string]interface{}
	dbErr := d.UserDB(c).Upsert("ptm_bookings", []map[string]interface{}{{
		"ptm_id": body.PTMID, "student_id": studentID, "slot_time": body.SlotTime, "status": "booked",
	}}, "ptm_id,student_id", false, &created)
	if dbErr != nil {
		return c.JSON(fiber.Map{"success": false, "message": dbErr.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "booking": firstOrNil(created)})
}

func (d *Deps) ListPTMBookings(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	q := url.Values{"select": {"*,students(name,roll_no,class)"}, "order": {"created_at.desc"}}
	if ptmID := c.Query("ptmId"); ptmID != "" {
		q.Set("ptm_id", "eq."+ptmID)
	}
	if user.Role == "student" || user.Role == "parent" {
		studentID, err := d.resolveStudentIDForUser(c)
		if err != nil || studentID == "" {
			return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
		}
		q.Set("student_id", "eq."+studentID)
	}
	var rows []map[string]interface{}
	if err := d.UserDB(c).Select("ptm_bookings", q, &rows); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "bookings": orEmpty(rows)})
}

// ---- Sports activities -----------------------------------------------------

func (d *Deps) CreateSportsActivity(c *fiber.Ctx) error {
	var body struct {
		Title        string `json:"title"`
		Description  string `json:"description"`
		Class        string `json:"class"`
		Category     string `json:"category"`
		ScheduleDate string `json:"scheduleDate"`
		CoachName    string `json:"coachName"`
	}
	if err := c.BodyParser(&body); err != nil || body.Title == "" {
		return c.JSON(fiber.Map{"success": false, "message": "title is required."})
	}
	user := middleware.UserFromLocals(c)
	row := map[string]interface{}{
		"title": body.Title, "description": body.Description, "category": body.Category,
		"coach_name": body.CoachName, "created_by": user.Name,
	}
	if body.Class != "" {
		row["class"] = body.Class
	}
	if body.ScheduleDate != "" {
		row["schedule_date"] = body.ScheduleDate
	}
	var created []map[string]interface{}
	if err := d.UserDB(c).Insert("sports_activities", row, true, &created); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	d.Audit(c, "sports.create", "sports_activities", "", fiber.Map{"after": body})
	return c.JSON(fiber.Map{"success": true, "activity": firstOrNil(created)})
}

func (d *Deps) ListSportsActivities(c *fiber.Ctx) error {
	q := url.Values{"select": {"*"}, "order": {"schedule_date.asc.nullslast"}}
	if class := c.Query("class"); class != "" {
		q.Set("class", "eq."+class)
	}
	var rows []map[string]interface{}
	if err := d.UserDB(c).Select("sports_activities", q, &rows); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "activities": orEmpty(rows)})
}

func (d *Deps) SignupSports(c *fiber.Ctx) error {
	var body struct {
		ActivityID string `json:"activityId"`
	}
	if err := c.BodyParser(&body); err != nil || body.ActivityID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "activityId is required."})
	}
	studentID, err := d.resolveStudentIDForUser(c)
	if err != nil || studentID == "" {
		return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
	}
	dbErr := d.UserDB(c).Upsert("sports_signups", []map[string]interface{}{{
		"activity_id": body.ActivityID, "student_id": studentID,
	}}, "activity_id,student_id", false, nil)
	if dbErr != nil {
		return c.JSON(fiber.Map{"success": false, "message": dbErr.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (d *Deps) ListSportsSignups(c *fiber.Ctx) error {
	user := middleware.UserFromLocals(c)
	q := url.Values{"select": {"*,students(name,roll_no,class)"}, "order": {"created_at.desc"}}
	if activityID := c.Query("activityId"); activityID != "" {
		q.Set("activity_id", "eq."+activityID)
	}
	if user.Role == "student" || user.Role == "parent" {
		studentID, err := d.resolveStudentIDForUser(c)
		if err != nil || studentID == "" {
			return c.JSON(fiber.Map{"success": false, "message": "No student linked."})
		}
		q.Set("student_id", "eq."+studentID)
	}
	var rows []map[string]interface{}
	if err := d.UserDB(c).Select("sports_signups", q, &rows); err != nil {
		return c.JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "signups": orEmpty(rows)})
}
