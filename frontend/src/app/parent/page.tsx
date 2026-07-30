"use client";

import { useEffect, useState } from "react";
import { useAuthGuard } from "@/lib/useAuthGuard";
import { apiGet, apiPost } from "@/lib/api";
import AppShell, { type ShellTab } from "@/components/AppShell";
import { Card, SectionTitle, StatCard, Stamp, Pill, Button, LoadingState, ErrorState, AIHighlightBanner } from "@/components/ui";
import DailySummaryCard from "@/components/DailySummaryCard";
import FeesTab from "@/components/FeesTab";
import BusMap from "@/components/BusMap";
import type { Student, Grade, Attendance, Announcement, Wellness, ChatMessage } from "@/lib/types";
import InboxTab from "@/components/InboxTab";
import TimetableTab from "@/components/TimetableTab";
import DocumentsTab from "@/components/DocumentsTab";
import ExamsTab from "@/components/ExamsTab";
import SchoolMemoryTab from "@/components/SchoolMemoryTab";
import MeetingPrepView from "@/components/MeetingPrepView";
import GamificationTab from "@/components/AchievementsTab";
import SkillTreeTab from "@/components/SkillTreeTab";
import PicnicTab from "@/components/PicnicTab";
import PTMTab from "@/components/PTMTab";

const TABS: ShellTab[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "memory", label: "School Memory", icon: "archive" },
  { id: "meetingprep", label: "Meeting Prep", icon: "notes" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "bus", label: "Bus Tracking", icon: "bus" },
  { id: "progress", label: "Academic Progress", icon: "chart" },
  { id: "timetable", label: "Timetable", icon: "clock" },
  { id: "exams", label: "Exams & Results", icon: "examPaper" },
  { id: "documents", label: "Documents", icon: "folder" },
  { id: "attendance", label: "Attendance", icon: "calendarCheck" },
  { id: "wellness", label: "Wellness", icon: "heart" },
  { id: "picnic", label: "Picnic Form", icon: "bus" },
  { id: "ptm", label: "PTM Schedule", icon: "calendarCheck" },
  { id: "announcements", label: "Announcements", icon: "megaphone" },
  { id: "chat", label: "Message Teacher", icon: "chat" },
  { id: "fees", label: "Fees", icon: "wallet" },
  { id: "achievements", label: "Achievements", icon: "trophy" },
  { id: "skilltree", label: "Skill Tree", icon: "tree" },
];

interface DashboardData {
  success: boolean;
  message?: string;
  student: Student;
  grades: Grade[];
  attendance: Attendance[];
  announcements: Announcement[];
  wellness: Wellness[];
  attendancePct: number;
  avgGrade: number;
}

export default function ParentPage() {
  const { user, checking } = useAuthGuard("parent");
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (!user) return;
    apiGet<DashboardData>("/api/parent/dashboard").then(setData);
  }, [user]);

  if (checking || !user) return <LoadingState />;
  if (!data) return <LoadingState />;
  if (!data.success) return <ErrorState message={data.message || "No child linked to this account."} />;

  return (
    <AppShell user={user} title={`Parent dashboard — ${data.student?.name ?? ""}`} tabs={TABS} activeTab={tab} onTabChange={setTab}>
      {tab === "dashboard" && <OverviewTab data={data} onOpenMemory={() => setTab("memory")} />}
      {tab === "inbox" && <InboxTab />}
      {tab === "progress" && <ProgressTab grades={data.grades} avgGrade={data.avgGrade} />}
      {tab === "timetable" && <TimetableTab classOverride={data.student.class} />}
      {tab === "exams" && <ExamsTab grades={data.grades} />}
      {tab === "documents" && <DocumentsTab />}
      {tab === "memory" && <SchoolMemoryTab />}
      {tab === "meetingprep" && <MeetingPrepView />}
      {tab === "achievements" && <GamificationTab />}
      {tab === "skilltree" && <SkillTreeTab />}
      {tab === "attendance" && <AttendanceTab attendance={data.attendance} pct={data.attendancePct} />}
      {tab === "wellness" && <WellnessTab wellness={data.wellness} />}
      {tab === "picnic" && <PicnicTab role="parent" />}
      {tab === "ptm" && <PTMTab role="parent" />}
      {tab === "fees" && <FeesTab />}
      {tab === "bus" && <BusMap />}
      {tab === "announcements" && <AnnouncementsTab announcements={data.announcements} />}
      {tab === "chat" && <ChatTab />}
    </AppShell>
  );
}

function OverviewTab({ data, onOpenMemory }: { data: DashboardData; onOpenMemory: () => void }) {
  return (
    <div className="space-y-8">
      <DailySummaryCard />
      <AIHighlightBanner
        title="Ask School Memory anything"
        description='Try "what has my child participated in this year?" — answered from real logged events, not a free-text query hitting your database directly.'
        ctaLabel="Open School Memory"
        onClick={onOpenMemory}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Avg. grade" value={data.avgGrade} tone="accent" />
        <StatCard label="Attendance" value={`${data.attendancePct}%`} tone="leaf" />
        <StatCard label="Points" value={data.student?.points ?? 0} />
        <StatCard label="Badges" value={(data.student?.badges ?? []).length} />
      </div>
      <div>
        <SectionTitle>Recent announcements</SectionTitle>
        <AnnouncementsList announcements={data.announcements} />
      </div>
    </div>
  );
}

function ProgressTab({ grades, avgGrade }: { grades: Grade[]; avgGrade: number }) {
  return (
    <div>
      <StatCard label="Average grade" value={avgGrade} tone="accent" />
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
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
    </div>
  );
}

function AttendanceTab({ attendance, pct }: { attendance: Attendance[]; pct: number }) {
  return (
    <div>
      <StatCard label="Attendance rate (last 14 days)" value={`${pct}%`} tone="leaf" />
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

function WellnessTab({ wellness }: { wellness: Wellness[] }) {
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
          <p className="text-xs text-ink-soft mt-1">{new Date(w.created_at).toLocaleDateString()}</p>
        </Card>
      ))}
    </div>
  );
}

function AnnouncementsList({ announcements }: { announcements: Announcement[] }) {
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

function AnnouncementsTab({ announcements }: { announcements: Announcement[] }) {
  return (
    <div>
      <SectionTitle>Announcements</SectionTitle>
      <AnnouncementsList announcements={announcements} />
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
      <SectionTitle>Message teacher</SectionTitle>
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
