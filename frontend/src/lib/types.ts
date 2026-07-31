export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "parent" | "student" | "admin" | "driver";
  class: string;
  childId: string;
}

export interface MeResponse {
  loggedIn: boolean;
  user?: SessionUser;
}

// Raw row shape returned by GET /api/admin/stats (select("profiles", "*")) —
// snake_case straight from Postgres, distinct from the camelCase SessionUser
// the client gets back from /auth/me.
export interface AdminProfileRow {
  id: string;
  name: string;
  email: string;
  role: SessionUser["role"];
  class?: string;
  child_id?: string | null;
}

export interface Grade {
  id: string;
  student_id: string;
  subject: string;
  marks: number;
  total: number;
  grade: string;
}

export interface Attendance {
  id: string;
  student_id: string;
  date: string;
  status: "present" | "absent";
}

export interface Student {
  id: string;
  name: string;
  class: string;
  roll_no: string;
  points: number;
  badges: string[];
  grades?: Grade[];
  attendance?: Attendance[];
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  by_name: string;
  important: boolean;
  created_at: string;
}

export interface Homework {
  id: string;
  title: string;
  subject: string;
  description: string;
  due_date: string;
  points: number;
  class?: string;
  homework_submissions?: { count: number }[];
}

// ---- Phase 7: Teams-style homework — PDF turn-in + AI auto-eval ---------

export interface HomeworkRosterRow {
  studentId: string;
  name: string;
  rollNo: string;
  turnedIn: boolean;
  submissionId?: string;
  submittedAt?: string;
  fileName?: string;
  marksAwarded?: number | null;
  gradedBy?: string;
  gradedAt?: string;
  aiSuggestedScore?: number | null;
  aiFeedback?: string;
  aiMistakeTags?: string[];
  aiGeneratedBy?: "llm" | "unavailable" | "error" | null;
  late?: boolean;
}

export interface HomeworkMistakeTag {
  tag: string;
  count: number;
  example: string;
}

export interface HomeworkInsight {
  totalSubmissions: number;
  aiEvaluatedCount: number;
  mistakeTags: HomeworkMistakeTag[];
  teachingSuggestions: string[];
  averageSuggestedScore: number;
  averageMarksAwarded: number;
  gradedCount: number;
}

export interface HomeworkAiMistake {
  tag: string;
  explanation: string;
}

export interface MyHomeworkSubmission {
  id: string;
  submitted_at: string;
  file_name: string;
  marks_awarded?: number | null;
  graded_by?: string;
  graded_at?: string;
  ai_suggested_score?: number | null;
  ai_feedback?: string;
  ai_mistakes?: HomeworkAiMistake[];
  ai_strengths?: string[];
  ai_generated_by?: "llm" | "unavailable" | "error" | null;
  ai_evaluated_at?: string;
}

export interface Wellness {
  id: string;
  student_id: string;
  mood: number;
  message: string;
  sentiment: "positive" | "neutral" | "negative";
  created_at: string;
}

export interface Gatepass {
  id: string;
  student_id: string;
  student_name: string;
  reason: string;
  exit_time: string;
  status: "pending" | "approved" | "denied";
  approved_by?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  from_id: string;
  from_name: string;
  text: string;
  created_at: string;
}

// ---- v2 additions ----------------------------------------------------

export interface Fee {
  id: string;
  student_id: string;
  term: string;
  amount: number;
  due_date: string;
  status: "pending" | "paid" | "overdue";
}

export interface FeePayment {
  id: string;
  fee_id: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  amount: number;
  method?: string;
  verified: boolean;
  paid_at?: string;
}

export interface Notice {
  id: string;
  title: string;
  message: string;
  important: boolean;
  by_name: string;
  audience: "school" | "class" | "role";
  audience_value?: string;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  student_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  approved_by?: string;
  created_at: string;
  students?: { name: string; roll_no: string; class: string };
}

export interface RouteStop {
  name: string;
  lat: number;
  lng: number;
}

export interface BusRoute {
  id: string;
  name: string;
  stops: RouteStop[];
}

export interface Bus {
  id: string;
  number_plate: string;
  driver_name: string;
  route_id?: string;
  routes?: BusRoute;
  bus_locations?: { lat: number; lng: number; updated_at: string }[];
}

export interface BusLocation {
  bus_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

export interface DailySummaryResponse {
  success: boolean;
  message?: string;
  summary?: string;
  generatedBy?: "rules" | "llm";
  cached?: boolean;
  sourceData?: Record<string, unknown>;
}

export interface SilentStudentFlag {
  studentId: string;
  name: string;
  signalSummary: string;
}

export interface MasteryTopic {
  subject: string;
  masteryPct: number;
}

export interface InboxItem {
  type: "notice" | "homework" | "gatepass" | "leave";
  id: string;
  title: string;
  body?: string;
  createdAt: string;
  important?: boolean;
  dueDate?: string;
}

// ---- Phase 1 additions: timetable, exams/results, documents ----------

export interface TimetableSlot {
  id: string;
  class: string;
  day_of_week: number; // 1=Mon .. 6=Sat
  period: number;
  subject: string;
  teacher_name?: string;
  start_time: string;
  end_time: string;
}

export interface Exam {
  id: string;
  class: string;
  subject: string;
  exam_date: string;
  max_marks: number;
  term?: string;
}

export interface ExamResult extends Grade {
  exam_id?: string;
  students?: { name: string; roll_no: string };
}

export interface SchoolDocument {
  id: string;
  student_id?: string;
  class?: string;
  title: string;
  category: "report_card" | "id_card" | "certificate" | "circular" | "other";
  file_url: string;
  uploaded_by?: string;
  created_at: string;
}

// ---- Phase 2 additions: geofence notifications, ETA, SOS --------------

export interface BusGeofenceEvent {
  id: string;
  bus_id: string;
  route_id?: string;
  stop_index?: number;
  stop_name?: string;
  event: "arrived" | "departed" | "delayed" | "breakdown" | "resolved";
  note?: string;
  created_at: string;
}

export interface BusETA {
  success: boolean;
  message?: string;
  stopName?: string;
  etaMinutes?: number;
  distanceMeters?: number;
  speedEstimated?: boolean;
  note?: string;
}

export interface SOSAlert {
  id: string;
  bus_id: string;
  lat?: number;
  lng?: number;
  note?: string;
  created_at: string;
  resolved: boolean;
  buses?: { number_plate: string; driver_name: string };
}

export interface DriverBus {
  id: string;
  number_plate: string;
  driver_name: string;
  route_id?: string;
  routes?: BusRoute;
}

export interface RosterEntry {
  student_id: string;
  stop_index: number;
  students: { id: string; name: string; roll_no: string; class: string };
}

// ---- Phase 3 additions: engagement, classroom energy, friendship, memory ----

export interface EngagementLog {
  id: string;
  student_id: string;
  class: string;
  session_date: string;
  participation: number;
  confidence: number;
  curiosity: number;
  notes?: string;
}

export interface ClassEnergyInsights {
  success: boolean;
  class: string;
  sampleSize: number;
  observations: string[];
  note: string;
}

export interface PeerRelationship {
  id: string;
  student_a_id: string;
  student_b_id?: string;
  relationship_type: "explains_well" | "motivates" | "isolation_risk" | "suggested_seating";
  confidence_score?: number;
  evidence_source?: string;
  status: "suggested" | "accepted" | "rejected";
  created_at: string;
  a?: { name: string };
  b?: { name: string };
}

export interface SchoolMemoryResult {
  id: string;
  student_id: string;
  event_type: string;
  description: string;
  event_date: string;
  students?: { name: string; class: string };
}

// ---- Phase 4 additions: simulator, parent personality, meeting prep ----

export interface SimulationResponse {
  success: boolean;
  message?: string;
  baseline?: Record<string, number>;
  outcomes?: { summary: string; method?: string; [k: string]: unknown };
  note?: string;
}

export interface CommPrefs {
  success: boolean;
  preferredFormat: "voice" | "concise" | "detailed" | "visual";
  learnedConfidence: number;
  sampleSize: number;
  note: string;
}

export interface MeetingPrep {
  success: boolean;
  message?: string;
  studentName?: string;
  meetingDate?: string;
  achievements?: string[];
  concerns?: string[];
  suggestedActions?: string[];
  sourceData?: Record<string, unknown>;
  note?: string;
}

// ---- Gamification: curiosity bounty, skill tree, commute streak, you-vs-past-you ----

export interface CuriosityBounty {
  id: string;
  description: string;
  created_at: string;
}

export interface SkillNode {
  examId?: string;
  subject: string;
  label: string;
  masteryPct: number;
  status: "mastered" | "cleared" | "current" | "locked";
}

export interface CommuteStreakResponse {
  success: boolean;
  message?: string;
  streakDays: number;
  newBadge?: string;
}

export interface MonthMetrics {
  attendanceRatePct: number;
  homeworkOnTimePct: number;
  avgGradePct: number;
}

export interface ProgressComparisonResponse {
  success: boolean;
  message?: string;
  thisMonth?: MonthMetrics;
  lastMonth?: MonthMetrics;
  note?: string;
}

// ---- Phase 6 additions: social behavior, picnics, PTM, sports ----------

export interface BehaviorLog {
  id: string;
  student_id: string;
  class: string;
  category: "positive" | "neutral" | "needs_attention" | "incident";
  note: string;
  rating?: number;
  logged_by?: string;
  created_at: string;
  students?: { name: string; roll_no: string };
}

export interface Picnic {
  id: string;
  title: string;
  description?: string;
  class: string;
  location?: string;
  event_date: string;
  cost: number;
  max_students?: number;
  status: "planned" | "confirmed" | "cancelled" | "completed";
  created_by?: string;
  created_at: string;
}

export interface PicnicRequest {
  id: string;
  picnic_id: string;
  student_id: string;
  status: "pending" | "approved" | "rejected";
  parent_consent: boolean;
  parent_note?: string;
  created_at: string;
  students?: { name: string; roll_no: string; class: string };
}

export interface PTMSchedule {
  id: string;
  class: string;
  teacher_name?: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  location?: string;
  agenda?: string;
  created_at: string;
}

export interface PTMBooking {
  id: string;
  ptm_id: string;
  student_id: string;
  slot_time?: string;
  status: "booked" | "cancelled";
  created_at: string;
  students?: { name: string; roll_no: string; class: string };
}

export interface SportsActivity {
  id: string;
  title: string;
  description?: string;
  class?: string;
  category?: string;
  schedule_date?: string;
  coach_name?: string;
  created_by?: string;
  created_at: string;
}

export interface SportsSignup {
  id: string;
  activity_id: string;
  student_id: string;
  created_at: string;
  students?: { name: string; roll_no: string; class: string };
}