"use client";

import { useEffect, useState } from "react";
import { useAuthGuard } from "@/lib/useAuthGuard";
import { apiGet, apiPost } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { TabNav } from "@/components/TabNav";
import { Card, SectionTitle, StatCard, Pill, Button, LoadingState, ErrorState, AIHighlightBanner } from "@/components/ui";
import type { Student, Announcement, Homework, Gatepass, Wellness, ChatMessage, LeaveRequest, SilentStudentFlag } from "@/lib/types";
import InboxTab from "@/components/InboxTab";
import TimetableTab from "@/components/TimetableTab";
import DocumentsTab from "@/components/DocumentsTab";
import type { Exam, ExamResult, SOSAlert } from "@/lib/types";
import ClassroomEnergyTab from "@/components/ClassroomEnergyTab";
import FriendshipTab from "@/components/FriendshipTab";
import SchoolMemoryTab from "@/components/SchoolMemoryTab";
import MeetingPrepTab from "@/components/MeetingPrepTab";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "friendship", label: "Friendship Intelligence" },
  { id: "classenergy", label: "Classroom Energy" },
  { id: "meetingprep", label: "Meeting Prep" },
  { id: "schoolmemory", label: "School Memory" },
  { id: "flags", label: "Check-in Flags" },
  { id: "inbox", label: "Inbox" },
  { id: "students", label: "Students" },
  { id: "attendance", label: "Attendance" },
  { id: "homework", label: "Homework" },
  { id: "announcements", label: "Announcements" },
  { id: "gatepasses", label: "Gate Passes" },
  { id: "leave", label: "Leave Requests" },
  { id: "wellness", label: "Wellness" },
  { id: "chat", label: "Chat" },
  { id: "exams", label: "Exams & Results" },
  { id: "timetable", label: "Timetable" },
  { id: "documents", label: "Documents" },
  { id: "sos", label: "Bus SOS" },
];

interface DashboardData {
  success: boolean;
  students: Student[];
  announcements: Announcement[];
  homework: Homework[];
  avgMood: string;
  negativeMoods: number;
}

export default function TeacherPage() {
  const { user, checking } = useAuthGuard("teacher");
  const [tab, setTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (!user) return;
    apiGet<DashboardData>("/api/teacher/dashboard").then(setDashboard);
  }, [user]);

  if (checking || !user) return <LoadingState />;

  return (
    <AppShell user={user} title="Teacher dashboard — Class 10A">
      <TabNav tabs={TABS} active={tab} onChange={setTab} />
      {tab === "dashboard" && <DashboardTab data={dashboard} onOpenFriendship={() => setTab("friendship")} />}
      {tab === "inbox" && <InboxTab />}
      {tab === "students" && <StudentsTab />}
      {tab === "attendance" && <AttendanceTab />}
      {tab === "homework" && <HomeworkTab initial={dashboard?.homework} />}
      {tab === "announcements" && <AnnouncementsTab initial={dashboard?.announcements} />}
      {tab === "gatepasses" && <GatepassesTab />}
      {tab === "leave" && <LeaveReviewTab />}
      {tab === "wellness" && <WellnessTab />}
      {tab === "flags" && <FlagsTab />}
      {tab === "chat" && <ChatTab />}
      {tab === "exams" && <ExamsManageTab />}
      {tab === "timetable" && <TimetableTab />}
      {tab === "documents" && <DocumentsManageTab />}
      {tab === "sos" && <SOSTab />}
      {tab === "classenergy" && <ClassroomEnergyTab defaultClass="10A" />}
      {tab === "friendship" && <FriendshipTab students={dashboard?.students ?? []} />}
      {tab === "schoolmemory" && <SchoolMemoryTab students={dashboard?.students ?? []} />}
      {tab === "meetingprep" && <MeetingPrepTab students={dashboard?.students ?? []} />}
    </AppShell>
  );
}

function DashboardTab({ data, onOpenFriendship }: { data: DashboardData | null; onOpenFriendship: () => void }) {
  if (!data) return <LoadingState />;
  if (!data.success) return <ErrorState message="Could not load dashboard." />;
  return (
    <div className="space-y-8">
      <AIHighlightBanner
        title="See Friendship Intelligence for 10A"
        description="Participation-based isolation-risk and suggested-seating flags — every suggestion discloses its underlying stats and needs your accept/reject before it means anything."
        ctaLabel="Open Friendship Intelligence"
        onClick={onOpenFriendship}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Students" value={data.students.length} />
        <StatCard label="Avg mood" value={data.avgMood} tone="leaf" />
        <StatCard label="Low-mood entries" value={data.negativeMoods} tone="brick" />
        <StatCard label="Homework set" value={data.homework.length} tone="accent" />
      </div>
      <div>
        <SectionTitle>Recent announcements</SectionTitle>
        <div className="space-y-2">
          {data.announcements.length === 0 && <p className="text-sm text-ink-soft">No announcements yet.</p>}
          {data.announcements.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{a.title}</p>
                {a.important && <Pill tone="brick">Important</Pill>}
              </div>
              <p className="text-sm text-ink-soft mt-1">{a.message}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function StudentsTab() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiGet<{ success: boolean; students: Student[] }>("/api/teacher/students").then((res) =>
      setStudents(res.students)
    );
  }, []);

  if (!students) return <LoadingState />;
  const filtered = students.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <input
        placeholder="Search students…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-xs border border-line rounded px-3 py-2 bg-paper-raised mb-4 focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-ink-soft border-b border-line">
              <th className="py-2 pr-4">Roll no.</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Points</th>
              <th className="py-2 pr-4">Avg. marks</th>
              <th className="py-2 pr-4">Attendance</th>
              <th className="py-2 pr-4">Badges</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const grades = s.grades ?? [];
              const avgMarks = grades.length
                ? Math.round(grades.reduce((sum, g) => sum + g.marks, 0) / grades.length)
                : null;
              const att = s.attendance ?? [];
              const presentPct = att.length
                ? Math.round((att.filter((a) => a.status === "present").length / att.length) * 100)
                : null;
              return (
                <tr key={s.id} className="border-b border-line">
                  <td className="py-2 pr-4 font-mono text-ink-soft">{s.roll_no}</td>
                  <td className="py-2 pr-4 text-ink">{s.name}</td>
                  <td className="py-2 pr-4">{s.points}</td>
                  <td className="py-2 pr-4">{avgMarks ?? "—"}</td>
                  <td className="py-2 pr-4">{presentPct !== null ? `${presentPct}%` : "—"}</td>
                  <td className="py-2 pr-4">{(s.badges ?? []).join(" ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttendanceTab() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [status, setStatus] = useState<Record<string, "present" | "absent">>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet<{ success: boolean; students: Student[] }>("/api/teacher/students").then((res) => {
      setStudents(res.students);
      const init: Record<string, "present" | "absent"> = {};
      res.students.forEach((s) => (init[s.id] = "present"));
      setStatus(init);
    });
  }, []);

  if (!students) return <LoadingState />;

  async function submit() {
    setSaving(true);
    setSaved(false);
    await apiPost("/api/attendance", {
      attendance: Object.entries(status).map(([studentId, st]) => ({ studentId, status: st })),
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Button
          variant="secondary"
          onClick={() => setStatus(Object.fromEntries(students.map((s) => [s.id, "present"])))}
        >
          Mark all present
        </Button>
        <Button
          variant="secondary"
          onClick={() => setStatus(Object.fromEntries(students.map((s) => [s.id, "absent"])))}
        >
          Mark all absent
        </Button>
      </div>
      <div className="space-y-2 mb-4">
        {students.map((s) => (
          <div key={s.id} className="flex items-center justify-between bg-paper-raised border border-line rounded px-4 py-2">
            <span className="text-sm text-ink">
              {s.name} <span className="text-ink-soft font-mono">#{s.roll_no}</span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setStatus((prev) => ({ ...prev, [s.id]: "present" }))}
                className={`text-xs px-3 py-1 rounded ${status[s.id] === "present" ? "bg-leaf text-paper" : "border border-line text-ink-soft"}`}
              >
                Present
              </button>
              <button
                onClick={() => setStatus((prev) => ({ ...prev, [s.id]: "absent" }))}
                className={`text-xs px-3 py-1 rounded ${status[s.id] === "absent" ? "bg-brick text-paper" : "border border-line text-ink-soft"}`}
              >
                Absent
              </button>
            </div>
          </div>
        ))}
      </div>
      <Button onClick={submit} disabled={saving}>
        {saving ? "Saving…" : "Save today's attendance"}
      </Button>
      {saved && <p className="text-sm text-leaf mt-2">Attendance saved.</p>}
    </div>
  );
}

function HomeworkTab({ initial }: { initial?: Homework[] }) {
  const [homework, setHomework] = useState<Homework[] | undefined>(initial);
  const [form, setForm] = useState({ title: "", subject: "", description: "", dueDate: "", points: 50 });
  const [posting, setPosting] = useState(false);

  async function refresh() {
    const res = await apiGet<{ success: boolean; homework: Homework[] }>("/api/teacher/dashboard");
    setHomework(res.homework);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    if (!homework) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    await apiPost("/api/homework", form);
    setForm({ title: "", subject: "", description: "", dueDate: "", points: 50 });
    await refresh();
    setPosting(false);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <SectionTitle>Assign homework</SectionTitle>
        <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
          <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input required placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input type="number" min={0} placeholder="Points" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <Button type="submit" disabled={posting}>{posting ? "Posting…" : "Assign homework"}</Button>
        </form>
      </div>
      <div>
        <SectionTitle>Assigned homework</SectionTitle>
        <div className="space-y-2">
          {(homework ?? []).map((h) => (
            <Card key={h.id}>
              <p className="font-medium text-ink">{h.title}</p>
              <p className="text-xs text-ink-soft">{h.subject} · due {new Date(h.due_date).toLocaleDateString()} · {h.points} pts</p>
              <p className="text-sm text-ink-soft mt-1">{h.description}</p>
              <p className="text-xs text-ink-soft mt-1">
                {h.homework_submissions?.[0]?.count ?? 0} submissions
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnnouncementsTab({ initial }: { initial?: Announcement[] }) {
  const [announcements, setAnnouncements] = useState<Announcement[] | undefined>(initial);
  const [form, setForm] = useState({ title: "", message: "", important: false });
  const [posting, setPosting] = useState(false);

  async function refresh() {
    const res = await apiGet<{ success: boolean; announcements: Announcement[] }>("/api/teacher/dashboard");
    setAnnouncements(res.announcements);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    if (!announcements) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    await apiPost("/api/announcements", form);
    setForm({ title: "", message: "", important: false });
    await refresh();
    setPosting(false);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <SectionTitle>Post an announcement</SectionTitle>
        <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
          <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <textarea required placeholder="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={form.important} onChange={(e) => setForm({ ...form, important: e.target.checked })} />
            Mark as important
          </label>
          <Button type="submit" disabled={posting}>{posting ? "Posting…" : "Post announcement"}</Button>
        </form>
      </div>
      <div>
        <SectionTitle>Recent announcements</SectionTitle>
        <div className="space-y-2">
          {(announcements ?? []).map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{a.title}</p>
                {a.important && <Pill tone="brick">Important</Pill>}
              </div>
              <p className="text-sm text-ink-soft mt-1">{a.message}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function GatepassesTab() {
  const [passes, setPasses] = useState<Gatepass[] | null>(null);

  async function refresh() {
    const res = await apiGet<{ success: boolean; passes: Gatepass[] }>("/api/gatepasses");
    setPasses(res.passes);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    refresh();
  }, []);

  async function update(passId: string, status: "approved" | "denied") {
    await apiPost("/api/gatepass/update", { passId, status });
    await refresh();
  }

  if (!passes) return <LoadingState />;

  return (
    <div className="space-y-2">
      {passes.length === 0 && <p className="text-sm text-ink-soft">No gate pass requests.</p>}
      {passes.map((p) => (
        <Card key={p.id}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">{p.student_name}</p>
              <p className="text-sm text-ink-soft">{p.reason} · exit {p.exit_time}</p>
              {p.approved_by && <p className="text-xs text-ink-soft">Handled by {p.approved_by}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Pill tone={p.status === "approved" ? "leaf" : p.status === "denied" ? "brick" : "accent"}>
                {p.status}
              </Pill>
              {p.status === "pending" && (
                <>
                  <Button variant="secondary" onClick={() => update(p.id, "approved")}>Approve</Button>
                  <Button variant="danger" onClick={() => update(p.id, "denied")}>Deny</Button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function WellnessTab() {
  const [wellness, setWellness] = useState<Wellness[] | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; wellness: Wellness[] }>("/api/wellness/all").then((res) => setWellness(res.wellness));
  }, []);

  if (!wellness) return <LoadingState />;

  return (
    <div className="space-y-2">
      {wellness.length === 0 && <p className="text-sm text-ink-soft">No wellness check-ins yet.</p>}
      {wellness.map((w) => (
        <Card key={w.id}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">Mood: {w.mood}/5</span>
            <Pill tone={w.sentiment === "positive" ? "leaf" : w.sentiment === "negative" ? "brick" : "accent"}>
              {w.sentiment}
            </Pill>
          </div>
          {w.message && <p className="text-sm text-ink-soft mt-1">{w.message}</p>}
          <p className="text-xs text-ink-soft mt-1">{new Date(w.created_at).toLocaleString()}</p>
        </Card>
      ))}
    </div>
  );
}

function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function refresh() {
    const res = await apiGet<{ success: boolean; messages: ChatMessage[]; chatId: string | null }>("/api/chat/get");
    setMessages(res.messages);
    setChatId(res.chatId);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    refresh();
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    await apiPost("/api/chat/send", { chatId, text });
    setText("");
    await refresh();
    setSending(false);
  }

  if (!messages) return <LoadingState />;

  return (
    <div className="max-w-lg">
      <SectionTitle>Message parent</SectionTitle>
      <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
        {messages.length === 0 && <p className="text-sm text-ink-soft">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className="bg-paper-raised border border-line rounded px-3 py-2">
            <p className="text-xs text-ink-soft">{m.from_name}</p>
            <p className="text-sm text-ink">{m.text}</p>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 border border-line rounded px-3 py-2 bg-paper-raised"
        />
        <Button type="submit" disabled={sending}>Send</Button>
      </form>
    </div>
  );
}

function LeaveReviewTab() {
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);

  async function refresh() {
    const res = await apiGet<{ success: boolean; requests: LeaveRequest[] }>("/api/teacher/leave");
    setRequests(res.requests ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    refresh();
  }, []);

  async function update(requestId: string, status: "approved" | "denied") {
    await apiPost("/api/teacher/leave/update", { requestId, status });
    await refresh();
  }

  if (!requests) return <LoadingState />;

  return (
    <div className="space-y-2">
      {requests.length === 0 && <p className="text-sm text-ink-soft">No leave requests.</p>}
      {requests.map((r) => (
        <Card key={r.id}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">{r.students?.name ?? "Student"}</p>
              <p className="text-sm text-ink-soft">
                {new Date(r.from_date).toLocaleDateString()} – {new Date(r.to_date).toLocaleDateString()} · {r.reason}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone={r.status === "approved" ? "leaf" : r.status === "denied" ? "brick" : "accent"}>{r.status}</Pill>
              {r.status === "pending" && (
                <>
                  <Button variant="secondary" onClick={() => update(r.id, "approved")}>Approve</Button>
                  <Button variant="danger" onClick={() => update(r.id, "denied")}>Deny</Button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function FlagsTab() {
  const [flags, setFlags] = useState<SilentStudentFlag[] | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; flags: SilentStudentFlag[]; note: string }>("/api/teacher/silent-student-flags").then((res) =>
      setFlags(res.flags ?? [])
    );
  }, []);

  if (!flags) return <LoadingState />;

  return (
    <div>
      <p className="text-xs text-ink-soft mb-4">
        These are flags for a human check-in, not a diagnosis — a pattern in the data worth a look, nothing more.
      </p>
      <div className="space-y-2">
        {flags.length === 0 && <p className="text-sm text-ink-soft">No flags right now.</p>}
        {flags.map((f) => (
          <Card key={f.studentId}>
            <p className="font-medium text-ink">{f.name}</p>
            <p className="text-sm text-ink-soft mt-1">{f.signalSummary}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ExamsManageTab() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [examForm, setExamForm] = useState({ class: "", subject: "", examDate: "", maxMarks: 100, term: "" });
  const [selectedExam, setSelectedExam] = useState("");
  const [results, setResults] = useState<Record<string, { marks: string; total: string }>>({});
  const [savingExam, setSavingExam] = useState(false);
  const [savingResult, setSavingResult] = useState<string | null>(null);

  async function refreshExams() {
    const res = await apiGet<{ success: boolean; exams: Exam[] }>("/api/exams");
    setExams(res.exams ?? []);
  }

  useEffect(() => {
    refreshExams();
    apiGet<{ success: boolean; students: Student[] }>("/api/teacher/students").then((res) => setStudents(res.students ?? []));
  }, []);

  useEffect(() => {
    if (!selectedExam) return;
    apiGet<{ success: boolean; results: ExamResult[] }>(`/api/teacher/results?examId=${selectedExam}`).then((res) => {
      const map: Record<string, { marks: string; total: string }> = {};
      for (const r of res.results ?? []) map[r.student_id] = { marks: String(r.marks), total: String(r.total) };
      setResults(map);
    });
  }, [selectedExam]);

  async function createExam(e: React.FormEvent) {
    e.preventDefault();
    setSavingExam(true);
    await apiPost("/api/teacher/exams", examForm);
    setExamForm({ class: "", subject: "", examDate: "", maxMarks: 100, term: "" });
    setSavingExam(false);
    await refreshExams();
  }

  async function saveResult(studentId: string) {
    const r = results[studentId];
    if (!r || !selectedExam) return;
    setSavingResult(studentId);
    const exam = exams.find((e) => e.id === selectedExam);
    await apiPost("/api/teacher/results", {
      examId: selectedExam,
      studentId,
      subject: exam?.subject ?? "",
      marks: Number(r.marks || 0),
      total: Number(r.total || exam?.max_marks || 100),
    });
    setSavingResult(null);
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="max-w-md">
        <SectionTitle>Schedule an exam</SectionTitle>
        <form onSubmit={createExam} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
          <input required placeholder="Class (e.g. 10A)" value={examForm.class} onChange={(e) => setExamForm({ ...examForm, class: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input required placeholder="Subject" value={examForm.subject} onChange={(e) => setExamForm({ ...examForm, subject: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input required type="date" value={examForm.examDate} onChange={(e) => setExamForm({ ...examForm, examDate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input type="number" placeholder="Max marks" value={examForm.maxMarks} onChange={(e) => setExamForm({ ...examForm, maxMarks: Number(e.target.value) })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input placeholder="Term (optional)" value={examForm.term} onChange={(e) => setExamForm({ ...examForm, term: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <Button type="submit" disabled={savingExam}>{savingExam ? "Scheduling…" : "Schedule exam"}</Button>
        </form>
      </div>

      <div>
        <SectionTitle>Enter results</SectionTitle>
        <select value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)} className="w-full max-w-sm border border-line rounded px-3 py-2 bg-paper-raised mb-4">
          <option value="">Choose an exam…</option>
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.class} · {ex.subject} · {new Date(ex.exam_date).toLocaleDateString()}</option>
          ))}
        </select>
        {selectedExam && (
          <div className="space-y-2">
            {students.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-paper-raised border border-line rounded px-3 py-2">
                <span className="flex-1 text-sm text-ink">{s.name}</span>
                <input
                  type="number"
                  placeholder="Marks"
                  value={results[s.id]?.marks ?? ""}
                  onChange={(e) => setResults({ ...results, [s.id]: { marks: e.target.value, total: results[s.id]?.total ?? "" } })}
                  className="w-20 border border-line rounded px-2 py-1 bg-paper text-sm"
                />
                <span className="text-ink-soft text-sm">/</span>
                <input
                  type="number"
                  placeholder="Total"
                  value={results[s.id]?.total ?? ""}
                  onChange={(e) => setResults({ ...results, [s.id]: { marks: results[s.id]?.marks ?? "", total: e.target.value } })}
                  className="w-20 border border-line rounded px-2 py-1 bg-paper text-sm"
                />
                <Button variant="secondary" onClick={() => saveResult(s.id)} disabled={savingResult === s.id}>
                  {savingResult === s.id ? "Saving…" : "Save"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentsManageTab() {
  const [form, setForm] = useState({ studentId: "", class: "", title: "", category: "circular", fileUrl: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await apiPost("/api/teacher/documents", form);
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="max-w-md">
        <SectionTitle>Share a document</SectionTitle>
        <p className="text-xs text-ink-soft mb-3">
          File bytes aren&apos;t stored by this app yet — paste a URL to a file already hosted
          somewhere. See NOTES.md for the storage-integration stub.
        </p>
        <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
          <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
            <option value="circular">Circular</option>
            <option value="report_card">Report card</option>
            <option value="id_card">ID card</option>
            <option value="certificate">Certificate</option>
            <option value="other">Other</option>
          </select>
          <input placeholder="Class (optional — leave blank for school-wide)" value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input placeholder="Student ID (optional — leave blank for class/school-wide)" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input required placeholder="File URL" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <Button type="submit" disabled={saving}>{saving ? "Sharing…" : "Share"}</Button>
        </form>
        {saved && <p className="text-sm text-leaf mt-2">Document shared.</p>}
      </div>
      <div>
        <SectionTitle>All shared documents</SectionTitle>
        <DocumentsTab />
      </div>
    </div>
  );
}

function SOSTab() {
  const [alerts, setAlerts] = useState<SOSAlert[] | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  async function refresh() {
    const res = await apiGet<{ success: boolean; alerts: SOSAlert[] }>("/api/teacher/sos");
    setAlerts(res.alerts ?? []);
  }

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 15000);
    return () => clearInterval(poll);
  }, []);

  async function resolve(alertId: string) {
    setResolving(alertId);
    await apiPost("/api/teacher/sos/resolve", { alertId });
    await refresh();
    setResolving(null);
  }

  if (!alerts) return <LoadingState />;

  return (
    <div>
      <p className="text-xs text-ink-soft mb-4">Active SOS alerts raised by drivers, newest first.</p>
      {alerts.length === 0 ? (
        <p className="text-sm text-ink-soft">No active alerts.</p>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {alerts.map((a) => (
            <Card key={a.id} className="!flex items-center justify-between border-brick/40">
              <div>
                <p className="font-medium text-brick">{a.buses?.number_plate ?? a.bus_id} · {a.buses?.driver_name}</p>
                <p className="text-sm text-ink-soft">{a.note || "No note provided."}</p>
                <p className="text-xs text-ink-soft mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
              </div>
              <Button variant="danger" onClick={() => resolve(a.id)} disabled={resolving === a.id}>
                {resolving === a.id ? "Resolving…" : "Mark resolved"}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
