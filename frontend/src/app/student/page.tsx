"use client";

import { useEffect, useState } from "react";
import { useAuthGuard } from "@/lib/useAuthGuard";
import { apiGet, apiPost } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { TabNav } from "@/components/TabNav";
import { Card, SectionTitle, StatCard, Stamp, Pill, Button, LoadingState, ErrorState, AIHighlightBanner } from "@/components/ui";
import DailySummaryCard from "@/components/DailySummaryCard";
import FeesTab from "@/components/FeesTab";
import BusMap from "@/components/BusMap";
import type { Grade, Attendance, Homework, Announcement, LeaveRequest } from "@/lib/types";
import InboxTab from "@/components/InboxTab";
import MasteryTab from "@/components/MasteryTab";
import TimetableTab from "@/components/TimetableTab";
import DocumentsTab from "@/components/DocumentsTab";
import ExamsTab from "@/components/ExamsTab";
import SchoolMemoryTab from "@/components/SchoolMemoryTab";
import MeetingPrepView from "@/components/MeetingPrepView";
import GamificationTab from "@/components/AchievementsTab";
import SkillTreeTab from "@/components/SkillTreeTab";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "mastery", label: "Knowledge Journey" },
  { id: "memory", label: "School Memory" },
  { id: "meetingprep", label: "Meeting Prep" },
  { id: "inbox", label: "Inbox" },
  { id: "bus", label: "My Bus" },
  { id: "grades", label: "My Grades" },
  { id: "timetable", label: "Timetable" },
  { id: "exams", label: "Exams & Results" },
  { id: "documents", label: "Documents" },
  { id: "homework", label: "Homework" },
  { id: "attendance", label: "Attendance" },
  { id: "wellness", label: "Wellness" },
  { id: "gatepass", label: "Gate Pass" },
  { id: "leave", label: "Leave" },
  { id: "announcements", label: "Announcements" },
  { id: "fees", label: "Fees" },
  { id: "skilltree", label: "Skill Tree" },
  { id: "achievements", label: "Achievements" },
];

interface DashboardData {
  success: boolean;
  message?: string;
  profile: { name: string; points: number; badges: string[]; roll_no: string; class: string };
  grades: Grade[];
  attendance: Attendance[];
  homework: Homework[];
  announcements: Announcement[];
  submittedIds: string[];
}

export default function StudentPage() {
  const { user, checking } = useAuthGuard("student");
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState<DashboardData | null>(null);

  async function refresh() {
    const res = await apiGet<DashboardData>("/api/student/dashboard");
    setData(res);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    if (user) refresh();
  }, [user]);

  if (checking || !user) return <LoadingState />;
  if (!data) return <LoadingState />;
  if (!data.success) return <ErrorState message={data.message || "Student record not linked."} />;

  return (
    <AppShell user={user} title={`Student dashboard — ${data.profile?.class ?? ""}`}>
      <TabNav tabs={TABS} active={tab} onChange={setTab} />
      {tab === "dashboard" && <OverviewTab data={data} onOpenMastery={() => setTab("mastery")} />}
      {tab === "inbox" && <InboxTab />}
      {tab === "mastery" && <MasteryTab />}
      {tab === "skilltree" && <SkillTreeTab />}
      {tab === "grades" && <GradesTab grades={data.grades} />}
      {tab === "timetable" && <TimetableTab />}
      {tab === "exams" && <ExamsTab grades={data.grades} />}
      {tab === "documents" && <DocumentsTab />}
      {tab === "memory" && <SchoolMemoryTab />}
      {tab === "meetingprep" && <MeetingPrepView />}
      {tab === "homework" && <HomeworkTab homework={data.homework} submittedIds={data.submittedIds} onSubmitted={refresh} />}
      {tab === "attendance" && <AttendanceTab attendance={data.attendance} />}
      {tab === "wellness" && <WellnessTab />}
      {tab === "gatepass" && <GatepassTab />}
      {tab === "leave" && <LeaveTab />}
      {tab === "fees" && <FeesTab />}
      {tab === "bus" && <BusMap />}
      {tab === "announcements" && <AnnouncementsTab announcements={data.announcements} />}
      {tab === "achievements" && <AchievementsTab profile={data.profile} />}
    </AppShell>
  );
}

function OverviewTab({ data, onOpenMastery }: { data: DashboardData; onOpenMastery: () => void }) {
  const upcoming = data.homework.filter((h) => !data.submittedIds.includes(h.id)).slice(0, 3);
  return (
    <div className="space-y-8">
      <DailySummaryCard />
      <AIHighlightBanner
        title="See your Knowledge Journey"
        description="Your real exam results laid out as a subject-by-subject progression — no fabricated curriculum graph, just what you've actually taken."
        ctaLabel="Open Knowledge Journey"
        onClick={onOpenMastery}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Points" value={data.profile?.points ?? 0} tone="accent" />
        <StatCard label="Badges" value={(data.profile?.badges ?? []).length} />
        <StatCard label="Subjects graded" value={data.grades.length} />
        <StatCard label="Homework pending" value={upcoming.length} tone="brick" />
      </div>
      <div>
        <SectionTitle>Upcoming homework</SectionTitle>
        {upcoming.length === 0 && <p className="text-sm text-ink-soft">Nothing pending — nice work.</p>}
        <div className="space-y-2">
          {upcoming.map((h) => (
            <Card key={h.id}>
              <p className="font-medium text-ink">{h.title}</p>
              <p className="text-xs text-ink-soft">{h.subject} · due {new Date(h.due_date).toLocaleDateString()}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function GradesTab({ grades }: { grades: Grade[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {grades.map((g) => (
        <Card key={g.id} className="flex items-center justify-between">
          <div>
            <p className="font-medium text-ink">{g.subject}</p>
            <p className="text-sm text-ink-soft">{g.marks} / {g.total}</p>
          </div>
          <Stamp grade={g.grade} />
        </Card>
      ))}
    </div>
  );
}

function HomeworkTab({
  homework,
  submittedIds,
  onSubmitted,
}: {
  homework: Homework[];
  submittedIds: string[];
  onSubmitted: () => void;
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [earned, setEarned] = useState<number | null>(null);

  async function submit(id: string) {
    setSubmitting(id);
    const res = await apiPost<{ success: boolean; pointsEarned?: number }>("/api/homework/submit", { homeworkId: id });
    if (res.success && res.pointsEarned) setEarned(res.pointsEarned);
    await onSubmitted();
    setSubmitting(null);
  }

  return (
    <div>
      {earned !== null && <p className="text-sm text-leaf mb-3">+{earned} points earned!</p>}
      <div className="space-y-2">
        {homework.map((h) => {
          const done = submittedIds.includes(h.id);
          return (
            <Card key={h.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink">{h.title}</p>
                  <p className="text-xs text-ink-soft">{h.subject} · due {new Date(h.due_date).toLocaleDateString()} · {h.points} pts</p>
                  <p className="text-sm text-ink-soft mt-1">{h.description}</p>
                </div>
                {done ? (
                  <Pill tone="leaf">Submitted</Pill>
                ) : (
                  <Button onClick={() => submit(h.id)} disabled={submitting === h.id}>
                    {submitting === h.id ? "Submitting…" : "Submit"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AttendanceTab({ attendance }: { attendance: Attendance[] }) {
  const presentPct = attendance.length
    ? Math.round((attendance.filter((a) => a.status === "present").length / attendance.length) * 100)
    : 0;
  return (
    <div>
      <StatCard label="Attendance (last 7 days)" value={`${presentPct}%`} tone="leaf" />
      <div className="space-y-1 mt-4">
        {attendance.map((a) => (
          <div key={a.id} className="flex items-center justify-between bg-paper-raised border border-line rounded px-4 py-2">
            <span className="text-sm text-ink">{new Date(a.date).toLocaleDateString()}</span>
            <Pill tone={a.status === "present" ? "leaf" : "brick"}>{a.status}</Pill>
          </div>
        ))}
      </div>
    </div>
  );
}

function WellnessTab() {
  const [mood, setMood] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!mood) return;
    setSubmitting(true);
    await apiPost("/api/wellness", { mood, message });
    setSubmitting(false);
    setDone(true);
    setMessage("");
  }

  return (
    <div className="max-w-md">
      <SectionTitle>How are you feeling today?</SectionTitle>
      <p className="text-xs text-ink-soft mb-3">Your check-in is anonymous to other students.</p>
      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4, 5].map((m) => (
          <button
            key={m}
            onClick={() => setMood(m)}
            className={`w-12 h-12 rounded-full border text-lg ${mood === m ? "bg-accent border-accent" : "border-line"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <textarea
        placeholder="Anything you'd like to share (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full border border-line rounded px-3 py-2 bg-paper-raised mb-3"
      />
      <Button onClick={submit} disabled={!mood || submitting}>
        {submitting ? "Sending…" : "Submit check-in"}
      </Button>
      {done && <p className="text-sm text-leaf mt-2">Thanks for checking in.</p>}
    </div>
  );
}

function GatepassTab() {
  const [reason, setReason] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await apiPost("/api/gatepass", { reason, exitTime });
    setSubmitting(false);
    setDone(true);
    setReason("");
    setExitTime("");
  }

  return (
    <div className="max-w-md">
      <SectionTitle>Request a gate pass</SectionTitle>
      <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
        <input required placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <input required type="time" value={exitTime} onChange={(e) => setExitTime(e.target.value)} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <Button type="submit" disabled={submitting}>{submitting ? "Requesting…" : "Request gate pass"}</Button>
      </form>
      {done && <p className="text-sm text-leaf mt-2">Request sent to your teacher.</p>}
    </div>
  );
}

function AnnouncementsTab({ announcements }: { announcements: Announcement[] }) {
  return (
    <div className="space-y-2">
      {announcements.length === 0 && <p className="text-sm text-ink-soft">No announcements yet.</p>}
      {announcements.map((a) => (
        <Card key={a.id}>
          <div className="flex items-center justify-between">
            <p className="font-medium text-ink">{a.title}</p>
            {a.important && <Pill tone="brick">Important</Pill>}
          </div>
          <p className="text-sm text-ink-soft mt-1">{a.message}</p>
        </Card>
      ))}
    </div>
  );
}

function AchievementsTab({ profile }: { profile: DashboardData["profile"] }) {
  return (
    <div className="space-y-6">
      <div>
        <StatCard label="Total points" value={profile?.points ?? 0} tone="accent" />
        <div className="flex flex-wrap gap-2 mt-4">
          {(profile?.badges ?? []).length === 0 && <p className="text-sm text-ink-soft">No badges yet.</p>}
          {(profile?.badges ?? []).map((b) => (
            <span key={b} className="text-sm bg-paper-raised border border-line rounded-full px-4 py-2">
              {b}
            </span>
          ))}
        </div>
      </div>
      <GamificationTab />
    </div>
  );
}

function LeaveTab() {
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [form, setForm] = useState({ fromDate: "", toDate: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    const res = await apiGet<{ success: boolean; requests: LeaveRequest[] }>("/api/leave/mine");
    setRequests(res.requests ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    refresh();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await apiPost("/api/leave", form);
    setForm({ fromDate: "", toDate: "", reason: "" });
    await refresh();
    setSubmitting(false);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <SectionTitle>Apply for leave</SectionTitle>
        <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
          <input required type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input required type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <textarea required placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Apply"}</Button>
        </form>
      </div>
      <div>
        <SectionTitle>My requests</SectionTitle>
        <div className="space-y-2">
          {(requests ?? []).length === 0 && <p className="text-sm text-ink-soft">No leave requests yet.</p>}
          {(requests ?? []).map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between">
                <p className="text-sm text-ink">
                  {new Date(r.from_date).toLocaleDateString()} – {new Date(r.to_date).toLocaleDateString()}
                </p>
                <Pill tone={r.status === "approved" ? "leaf" : r.status === "denied" ? "brick" : "accent"}>{r.status}</Pill>
              </div>
              <p className="text-sm text-ink-soft mt-1">{r.reason}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
