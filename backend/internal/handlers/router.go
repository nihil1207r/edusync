package handlers

import (
	"time"

	"edunexus/backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
)

func (d *Deps) RegisterRoutes(app *fiber.App) {
	requireAuth := func(role string) fiber.Handler { return middleware.RequireAuth(d.Secret, role) }

	// Brute-force protection: much stricter than the global limiter in main.go.
	loginLimiter := limiter.New(limiter.Config{Max: 5, Expiration: time.Minute})
	webhookLimiter := limiter.New(limiter.Config{Max: 30, Expiration: time.Minute})

	app.Post("/auth/login", loginLimiter, d.Login)
	app.Post("/auth/logout", d.Logout)
	app.Get("/auth/me", d.Me)

	// MFA: reachable with just a valid session (not yet aal2), since these
	// endpoints are how aal2 gets established in the first place.
	requireSession := middleware.RequireSession(d.Secret)
	app.Post("/auth/mfa/enroll", requireSession, d.MFAEnrollStart)
	app.Post("/auth/mfa/enroll/confirm", loginLimiter, requireSession, d.MFAEnrollConfirm)
	app.Post("/auth/mfa/verify", loginLimiter, requireSession, d.MFAVerifyLogin)
	// Dev-only endpoints. Previously /debug/profile had no auth check at all
	// (anyone could dump every user/profile) and /admin/seed had no auth
	// check either (anyone could reseed/wipe demo data). Both are now
	// admin-gated AND hard-disabled outright when IsProduction is set
	// (APP_ENV=production), rather than relying solely on auth/rate
	// limiting to keep dev tooling out of a live deployment.
	devOnly := func(h fiber.Handler) fiber.Handler {
		return func(c *fiber.Ctx) error {
			if d.IsProduction {
				return c.SendStatus(fiber.StatusNotFound)
			}
			return h(c)
		}
	}
	app.Get("/debug/profile", devOnly(requireAuth("admin")), d.DebugProfile)
	app.Post("/admin/seed", devOnly(requireAuth("admin")), loginLimiter, d.Seed)

	teacher := app.Group("/api/teacher", requireAuth("teacher"))
	teacher.Get("/dashboard", d.TeacherDashboard)
	teacher.Get("/students", d.TeacherStudents)

	app.Post("/api/attendance", requireAuth("teacher"), d.PostAttendance)
	app.Post("/api/announcements", requireAuth("teacher"), d.PostAnnouncement)
	app.Post("/api/homework", requireAuth("teacher"), d.PostHomework)
	app.Get("/api/gatepasses", requireAuth("teacher"), d.GetGatepasses)
	app.Post("/api/gatepass/update", requireAuth("teacher"), d.UpdateGatepass)
	app.Get("/api/wellness/all", requireAuth("teacher"), d.WellnessAll)

	app.Get("/api/parent/dashboard", requireAuth("parent"), d.ParentDashboard)

	app.Get("/api/student/dashboard", requireAuth("student"), d.StudentDashboard)
	app.Post("/api/wellness", requireAuth("student"), d.PostWellness)
	app.Post("/api/homework/submit", requireAuth("student"), d.SubmitHomework)
	app.Get("/api/teacher/homework/submissions", requireAuth("teacher"), d.GetHomeworkSubmissions)
	app.Post("/api/teacher/homework/grade", requireAuth("teacher"), d.GradeHomeworkSubmission)
	app.Get("/api/teacher/homework/insight", requireAuth("teacher"), d.GetHomeworkClassInsight)
	app.Get("/api/homework/submission-file", requireAuth(""), d.GetSubmissionFile)
	app.Get("/api/student/homework/submission", requireAuth("student"), d.GetMyHomeworkSubmission)
	app.Post("/api/gatepass", requireAuth("student"), d.PostGatepass)

	app.Get("/api/chat/get", requireAuth(""), d.ChatGet)
	app.Post("/api/chat/send", requireAuth(""), d.ChatSend)

	app.Get("/api/admin/stats", requireAuth("admin"), d.AdminStats)
	app.Get("/api/admin/audit-log", requireAuth("admin"), d.AdminAuditLog)
	app.Post("/api/admin/link-child", requireAuth("admin"), d.LinkChild)
	app.Post("/api/admin/unlink-child", requireAuth("admin"), d.UnlinkChild)

	// ---- Fees ----
	app.Get("/api/fees", requireAuth(""), d.FeesForChild)
	app.Post("/api/admin/fees", requireAuth("admin"), d.CreateFee)
	app.Post("/api/fees/razorpay/order", requireAuth(""), d.CreateRazorpayOrder)
	app.Post("/api/webhooks/razorpay", webhookLimiter, d.RazorpayWebhook) // Razorpay calls this directly; verified via signature, not session

	// ---- Notices ----
	app.Get("/api/notices", requireAuth(""), d.GetNotices)
	app.Post("/api/notices", requireAuth("teacher"), d.PostNotice)

	// ---- Leave requests ----
	app.Post("/api/leave", requireAuth("student"), d.ApplyLeave)
	app.Get("/api/leave/mine", requireAuth(""), d.ChildLeaveRequests)
	app.Get("/api/teacher/leave", requireAuth("teacher"), d.TeacherLeaveRequests)
	app.Post("/api/teacher/leave/update", requireAuth("teacher"), d.UpdateLeaveRequest)

	// ---- Bus tracking ----
	app.Post("/api/admin/routes", requireAuth("admin"), d.CreateRoute)
	app.Post("/api/admin/routes/stops", requireAuth("admin"), d.AddRouteStop)
	app.Get("/api/routes", requireAuth(""), d.ListRoutes)
	app.Post("/api/admin/buses", requireAuth("admin"), d.CreateBus)
	app.Get("/api/buses", requireAuth("admin"), d.ListBuses)
	app.Post("/api/admin/route-assignments", requireAuth("admin"), d.AssignRoute)
	app.Post("/api/driver/location", requireAuth("driver"), d.PingLocation)
	app.Post("/api/driver/boarding", requireAuth("driver"), d.PostBoardingEvent)
	app.Post("/api/driver/status", requireAuth("driver"), d.PostBusStatus)
	app.Post("/api/driver/sos", requireAuth("driver"), d.PostSOS)
	app.Get("/api/driver/mybus", requireAuth("driver"), d.DriverMyBus)
	app.Get("/api/driver/roster", requireAuth("driver"), d.DriverRoster)
	app.Get("/api/bus/mine", requireAuth(""), d.ChildBusLocation)
	app.Get("/api/bus/stream", requireAuth(""), d.ChildBusStream)
	app.Get("/api/bus/events", requireAuth(""), d.ChildBusEvents)
	app.Get("/api/bus/eta", requireAuth(""), d.ChildBusETA)
	app.Get("/api/teacher/sos", requireAuth("teacher"), d.ListSOS)
	app.Post("/api/teacher/sos/resolve", requireAuth("teacher"), d.ResolveSOS)

	// ---- Timetable ----
	app.Get("/api/timetable", requireAuth(""), d.ListTimetable)
	app.Post("/api/admin/timetable", requireAuth("admin"), d.CreateTimetableSlot)
	app.Post("/api/teacher/timetable", requireAuth("teacher"), d.CreateTimetableSlot)

	// ---- Social behavior (teacher logs; student/parent view own child) ----
	app.Post("/api/teacher/behavior", requireAuth("teacher"), d.CreateBehaviorLog)
	app.Get("/api/behavior", requireAuth(""), d.ListBehaviorLogs)

	// ---- Picnics / trips ----
	app.Get("/api/picnics", requireAuth(""), d.ListPicnics)
	app.Post("/api/teacher/picnics", requireAuth("teacher"), d.CreatePicnic)
	app.Post("/api/student/picnic-request", requireAuth("student"), d.RequestPicnic)
	app.Post("/api/parent/picnic-consent", requireAuth("parent"), d.SubmitPicnicConsent)
	app.Get("/api/picnic-requests", requireAuth(""), d.ListPicnicRequests)
	app.Post("/api/teacher/picnic-requests/update", requireAuth("teacher"), d.UpdatePicnicRequest)

	// ---- Parent-Teacher Meeting (PTM) schedule ----
	app.Get("/api/ptm", requireAuth(""), d.ListPTM)
	app.Post("/api/teacher/ptm", requireAuth("teacher"), d.CreatePTM)
	app.Post("/api/parent/ptm-book", requireAuth("parent"), d.BookPTM)
	app.Get("/api/teacher/ptm-bookings", requireAuth("teacher"), d.ListPTMBookings)

	// ---- Sports activities ----
	app.Get("/api/sports", requireAuth(""), d.ListSportsActivities)
	app.Post("/api/teacher/sports", requireAuth("teacher"), d.CreateSportsActivity)
	app.Post("/api/student/sports-signup", requireAuth("student"), d.SignupSports)
	app.Get("/api/sports-signups", requireAuth(""), d.ListSportsSignups)

	// ---- Exams & results ----
	app.Get("/api/exams", requireAuth(""), d.ListExams)
	app.Post("/api/teacher/exams", requireAuth("teacher"), d.CreateExam)
	app.Get("/api/teacher/results", requireAuth("teacher"), d.ListResultsForExam)
	app.Post("/api/teacher/results", requireAuth("teacher"), d.UpsertResult)

	// ---- Document repository ----
	app.Get("/api/documents", requireAuth(""), d.ListDocuments)
	app.Post("/api/teacher/documents", requireAuth("teacher"), d.CreateDocument)

	// ---- AI Insight Layer ----
	// Phase 3: Classroom Energy, Friendship Intelligence, School Memory
	app.Post("/api/teacher/engagement", requireAuth("teacher"), d.CreateEngagementLog)
	app.Get("/api/engagement", requireAuth(""), d.ListEngagementLogs)
	app.Post("/api/teacher/classenergy", requireAuth("teacher"), d.CreateClassEnergyLog)
	app.Get("/api/teacher/classenergy/insights", requireAuth("teacher"), d.ClassEnergyInsights)
	app.Post("/api/teacher/friendship/generate", requireAuth("teacher"), d.GenerateFriendshipSuggestions)
	app.Get("/api/teacher/friendship", requireAuth("teacher"), d.ListPeerRelationships)
	app.Post("/api/teacher/friendship/respond", requireAuth("teacher"), d.RespondToPeerSuggestion)
	app.Post("/api/teacher/friendship/observe", requireAuth("teacher"), d.AddTeacherPeerObservation)
	app.Post("/api/teacher/school-events", requireAuth("teacher"), d.CreateSchoolEvent)
	app.Get("/api/school-memory/search", requireAuth(""), d.SearchSchoolMemory)

	// Gamification: curiosity bounty (see engagement.go's CreateEngagementLog
	// for the award trigger), skill tree, commute streak, you-vs-past-you.
	app.Get("/api/student/curiosity-bounties", requireAuth(""), d.ListCuriosityBounties)
	app.Get("/api/student/skill-tree", requireAuth(""), d.SkillTree)
	app.Get("/api/student/commute-streak", requireAuth(""), d.CommuteStreak)
	app.Get("/api/student/progress-comparison", requireAuth(""), d.ProgressComparison)

	// Phase 4: AI School Simulator, Parent Personality, AI Meeting Prep
	app.Post("/api/admin/simulate", requireAuth("admin"), d.Simulate)
	app.Post("/api/parent/message-read", requireAuth("parent"), d.LogMessageRead)
	app.Get("/api/comm-prefs", requireAuth(""), d.GetCommPrefs)
	app.Post("/api/teacher/meeting-prep", requireAuth("teacher"), d.GenerateMeetingPrep)
	app.Get("/api/meeting-prep", requireAuth(""), d.ListMeetingPrepDocs)
	app.Get("/api/insight/daily-summary", requireAuth(""), d.DailySummary)
	app.Get("/api/teacher/silent-student-flags", requireAuth("teacher"), d.SilentStudentFlags)
	app.Get("/api/insight/mastery", requireAuth(""), d.Mastery)
	app.Get("/api/inbox", requireAuth(""), d.Inbox)
}
