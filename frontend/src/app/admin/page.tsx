"use client";

import { useEffect, useState } from "react";
import { useAuthGuard } from "@/lib/useAuthGuard";
import { apiGet, apiPost } from "@/lib/api";
import AppShell, { type ShellTab } from "@/components/AppShell";
import { Card, StatCard, Pill, Button, SectionTitle, LoadingState, ErrorState, AIHighlightBanner } from "@/components/ui";
import type { Student, Wellness, Homework, AdminProfileRow, BusRoute, Bus, SOSAlert } from "@/lib/types";
import InboxTab from "@/components/InboxTab";
import DocumentsTab from "@/components/DocumentsTab";
import TimetableTab from "@/components/TimetableTab";
import SimulatorTab from "@/components/SimulatorTab";

const TABS: ShellTab[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "simulator", label: "School Simulator", icon: "wand" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "wellness", label: "Wellness", icon: "heart" },
  { id: "users", label: "Users", icon: "users" },
  { id: "students", label: "Students", icon: "users" },
  { id: "notices", label: "Notices", icon: "bell" },
  { id: "buses", label: "Buses & Routes", icon: "bus" },
  { id: "timetable", label: "Timetable", icon: "clock" },
  { id: "documents", label: "Documents", icon: "folder" },
];

interface StatsData {
  success: boolean;
  users: AdminProfileRow[];
  students: Student[];
  wellness: Wellness[];
  homework: Homework[];
  avgMood: string;
}

export default function AdminPage() {
  const { user, checking } = useAuthGuard("admin");
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState<StatsData | null>(null);

  function refreshStats() {
    return apiGet<StatsData>("/api/admin/stats").then(setData);
  }

  useEffect(() => {
    if (!user) return;
    refreshStats();
  }, [user]);

  if (checking || !user) return <LoadingState />;
  if (!data) return <LoadingState />;
  if (!data.success) return <ErrorState message="Could not load admin stats." />;

  return (
    <AppShell user={user} title="Admin dashboard" tabs={TABS} activeTab={tab} onTabChange={setTab}>
      {tab === "dashboard" && <OverviewTab data={data} onOpenSimulator={() => setTab("simulator")} />}
      {tab === "inbox" && <InboxTab />}
      {tab === "users" && <UsersTab users={data.users} students={data.students} onChange={refreshStats} />}
      {tab === "students" && <StudentsTab students={data.students} />}
      {tab === "wellness" && <WellnessTab wellness={data.wellness} avgMood={data.avgMood} />}
      {tab === "notices" && <NoticesTab />}
      {tab === "buses" && <BusesTab users={data.users} />}
      {tab === "timetable" && <TimetableManageTab />}
      {tab === "documents" && <DocumentsManageTab />}
      {tab === "simulator" && <SimulatorTab />}
    </AppShell>
  );
}

function OverviewTab({ data, onOpenSimulator }: { data: StatsData; onOpenSimulator: () => void }) {
  return (
    <>
      <AIHighlightBanner
        title="Ask the AI School Simulator"
        description='Try "what if we delay the start of school by 20 minutes?" — estimated against real attendance, homework, and bus-timing data, with every assumption disclosed.'
        ctaLabel="Open Simulator"
        onClick={onOpenSimulator}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Users" value={data.users.length} />
        <StatCard label="Students" value={data.students.length} />
        <StatCard label="Avg. mood" value={data.avgMood} tone="leaf" />
        <StatCard label="Homework assigned" value={data.homework.length} tone="accent" />
      </div>
    </>
  );
}

function UsersTab({
  users,
  students,
  onChange,
}: {
  users: AdminProfileRow[];
  students: Student[];
  onChange: () => void;
}) {
  const [linkForm, setLinkForm] = useState({ parentId: "", studentId: "" });
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  // Only parent and student logins carry a child_id — that's the field
  // ParentDashboard/StudentDashboard read to know which student row is
  // "theirs". Teachers/admins/drivers are excluded from the picker.
  const linkable = users.filter((u) => u.role === "parent" || u.role === "student");
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]));

  async function link(e: React.FormEvent) {
    e.preventDefault();
    if (!linkForm.parentId || !linkForm.studentId) return;
    setLinking(true);
    await apiPost("/api/admin/link-child", linkForm);
    setLinkForm({ parentId: "", studentId: "" });
    setLinking(false);
    onChange();
  }

  async function unlink(parentId: string) {
    setUnlinkingId(parentId);
    await apiPost("/api/admin/unlink-child", { parentId });
    setUnlinkingId(null);
    onChange();
  }

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <SectionTitle>Link a parent or student login to a child record</SectionTitle>
        <p className="text-xs text-ink-soft mb-3">
          This is what makes the parent/student dashboards, fees, bus tracking, etc. show the
          right child&apos;s data — a login with no student linked sees &quot;No child linked.&quot;
        </p>
        <form onSubmit={link} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
          <select
            required
            value={linkForm.parentId}
            onChange={(e) => setLinkForm({ ...linkForm, parentId: e.target.value })}
            className="w-full border border-line rounded px-3 py-2 bg-paper"
          >
            <option value="">Select a parent/student login…</option>
            {linkable.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email}) · {u.role}
                {u.child_id ? ` — currently linked to ${studentById[u.child_id]?.name ?? u.child_id}` : ""}
              </option>
            ))}
          </select>
          <select
            required
            value={linkForm.studentId}
            onChange={(e) => setLinkForm({ ...linkForm, studentId: e.target.value })}
            className="w-full border border-line rounded px-3 py-2 bg-paper"
          >
            <option value="">Select the student record…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.class} · roll {s.roll_no}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={linking}>{linking ? "Linking…" : "Link"}</Button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-ink-soft border-b border-line">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Linked child</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line">
                <td className="py-2 pr-4 text-ink">{u.name}</td>
                <td className="py-2 pr-4 font-mono text-ink-soft">{u.email}</td>
                <td className="py-2 pr-4">
                  <Pill>{u.role}</Pill>
                </td>
                <td className="py-2 pr-4 text-ink-soft">
                  {(u.role === "parent" || u.role === "student") &&
                    (u.child_id ? studentById[u.child_id]?.name ?? u.child_id : "—")}
                </td>
                <td className="py-2 pr-4">
                  {(u.role === "parent" || u.role === "student") && u.child_id && (
                    <Button variant="secondary" onClick={() => unlink(u.id)} disabled={unlinkingId === u.id}>
                      {unlinkingId === u.id ? "Unlinking…" : "Unlink"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentsTab({ students }: { students: Student[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-ink-soft border-b border-line">
            <th className="py-2 pr-4">Roll no.</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Class</th>
            <th className="py-2 pr-4">Points</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id} className="border-b border-line">
              <td className="py-2 pr-4 font-mono text-ink-soft">{s.roll_no}</td>
              <td className="py-2 pr-4 text-ink">{s.name}</td>
              <td className="py-2 pr-4">{s.class}</td>
              <td className="py-2 pr-4">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WellnessTab({ wellness, avgMood }: { wellness: Wellness[]; avgMood: string }) {
  return (
    <div>
      <StatCard label="Average mood (last 20 check-ins)" value={avgMood} tone="leaf" />
      <div className="space-y-2 mt-4">
        {wellness.map((w) => (
          <Card key={w.id}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">Mood: {w.mood}/5</span>
              <Pill tone={w.sentiment === "positive" ? "leaf" : w.sentiment === "negative" ? "brick" : "accent"}>
                {w.sentiment}
              </Pill>
            </div>
            <p className="text-xs text-ink-soft mt-1">{new Date(w.created_at).toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function NoticesTab() {
  const [form, setForm] = useState({ title: "", message: "", important: false, audience: "school", audienceValue: "" });
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    await apiPost("/api/notices", form);
    setForm({ title: "", message: "", important: false, audience: "school", audienceValue: "" });
    setPosting(false);
    setPosted(true);
  }

  return (
    <div className="max-w-md">
      <SectionTitle>Broadcast a notice</SectionTitle>
      <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
        <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <textarea required placeholder="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
          <option value="school">Whole school</option>
          <option value="class">Specific class</option>
          <option value="role">Specific role</option>
        </select>
        {form.audience !== "school" && (
          <input
            placeholder={form.audience === "class" ? "e.g. 10A" : "e.g. parent"}
            value={form.audienceValue}
            onChange={(e) => setForm({ ...form, audienceValue: e.target.value })}
            className="w-full border border-line rounded px-3 py-2 bg-paper"
          />
        )}
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={form.important} onChange={(e) => setForm({ ...form, important: e.target.checked })} />
          Mark as important
        </label>
        <Button type="submit" disabled={posting}>{posting ? "Posting…" : "Broadcast"}</Button>
      </form>
      {posted && <p className="text-sm text-leaf mt-2">Notice sent.</p>}
    </div>
  );
}

function BusesTab({ users }: { users: AdminProfileRow[] }) {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routeForm, setRouteForm] = useState({ name: "" });
  const [busForm, setBusForm] = useState({ numberPlate: "", driverName: "", driverId: "", routeId: "" });
  const [stopForm, setStopForm] = useState<Record<string, { name: string; lat: string; lng: string }>>({});
  const drivers = users.filter((u) => u.role === "driver");

  async function refresh() {
    const [r, b] = await Promise.all([
      apiGet<{ success: boolean; routes: BusRoute[] }>("/api/routes"),
      apiGet<{ success: boolean; buses: Bus[] }>("/api/buses"),
    ]);
    setRoutes(r.routes ?? []);
    setBuses(b.buses ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    refresh();
  }, []);

  async function addRoute(e: React.FormEvent) {
    e.preventDefault();
    await apiPost("/api/admin/routes", { name: routeForm.name, stops: [] });
    setRouteForm({ name: "" });
    await refresh();
  }

  async function addStop(routeId: string, e: React.FormEvent) {
    e.preventDefault();
    const f = stopForm[routeId];
    if (!f?.name) return;
    await apiPost("/api/admin/routes/stops", { routeId, name: f.name, lat: Number(f.lat), lng: Number(f.lng) });
    setStopForm({ ...stopForm, [routeId]: { name: "", lat: "", lng: "" } });
    await refresh();
  }

  async function addBus(e: React.FormEvent) {
    e.preventDefault();
    await apiPost("/api/admin/buses", busForm);
    setBusForm({ numberPlate: "", driverName: "", driverId: "", routeId: "" });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <SectionTitle>Routes & stops</SectionTitle>
          <form onSubmit={addRoute} className="flex gap-2 mb-4">
            <input required placeholder="Route name" value={routeForm.name} onChange={(e) => setRouteForm({ name: e.target.value })} className="flex-1 border border-line rounded px-3 py-2 bg-paper-raised" />
            <Button type="submit">Add</Button>
          </form>
          <div className="space-y-3">
            {routes.map((r) => (
              <div key={r.id} className="bg-paper-raised border border-line rounded px-3 py-2">
                <p className="text-sm font-medium text-ink mb-1">{r.name}</p>
                <div className="text-xs text-ink-soft mb-2">
                  {r.stops.length === 0 ? "No stops yet — ETA and arrival alerts need at least one." : r.stops.map((s) => s.name).join(" → ")}
                </div>
                <form onSubmit={(e) => addStop(r.id, e)} className="flex flex-wrap gap-1.5">
                  <input placeholder="Stop name" value={stopForm[r.id]?.name ?? ""} onChange={(e) => setStopForm({ ...stopForm, [r.id]: { ...stopForm[r.id], name: e.target.value, lat: stopForm[r.id]?.lat ?? "", lng: stopForm[r.id]?.lng ?? "" } })} className="flex-1 min-w-[100px] border border-line rounded px-2 py-1 text-sm bg-paper" />
                  <input placeholder="Lat" value={stopForm[r.id]?.lat ?? ""} onChange={(e) => setStopForm({ ...stopForm, [r.id]: { ...stopForm[r.id], name: stopForm[r.id]?.name ?? "", lat: e.target.value, lng: stopForm[r.id]?.lng ?? "" } })} className="w-20 border border-line rounded px-2 py-1 text-sm bg-paper" />
                  <input placeholder="Lng" value={stopForm[r.id]?.lng ?? ""} onChange={(e) => setStopForm({ ...stopForm, [r.id]: { ...stopForm[r.id], name: stopForm[r.id]?.name ?? "", lat: stopForm[r.id]?.lat ?? "", lng: e.target.value } })} className="w-20 border border-line rounded px-2 py-1 text-sm bg-paper" />
                  <Button variant="secondary" type="submit">Add stop</Button>
                </form>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle>Buses</SectionTitle>
          <form onSubmit={addBus} className="space-y-2 mb-4">
            <input required placeholder="Number plate" value={busForm.numberPlate} onChange={(e) => setBusForm({ ...busForm, numberPlate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper-raised" />
            <input required placeholder="Driver name" value={busForm.driverName} onChange={(e) => setBusForm({ ...busForm, driverName: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper-raised" />
            <select value={busForm.driverId} onChange={(e) => setBusForm({ ...busForm, driverId: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper-raised">
              <option value="">Link to a driver login (optional)</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.email})</option>
              ))}
            </select>
            {drivers.length === 0 && (
              <p className="text-xs text-ink-soft">No driver accounts exist yet — create one via Supabase Auth, then it&apos;ll show up here.</p>
            )}
            <select value={busForm.routeId} onChange={(e) => setBusForm({ ...busForm, routeId: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper-raised">
              <option value="">No route yet</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <Button type="submit">Add bus</Button>
          </form>
          <div className="space-y-1">
            {buses.map((b) => (
              <div key={b.id} className="bg-paper-raised border border-line rounded px-3 py-2 text-sm text-ink flex items-center justify-between">
                <span>{b.number_plate} · {b.driver_name}</span>
                {b.bus_locations && b.bus_locations.length > 0 && <Pill tone="leaf">live</Pill>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <SOSPanel />
    </div>
  );
}

function SOSPanel() {
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

  return (
    <div>
      <SectionTitle>Active SOS alerts</SectionTitle>
      {!alerts ? (
        <LoadingState />
      ) : alerts.length === 0 ? (
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

const DAY_OPTIONS = [
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" },
];

function TimetableManageTab() {
  const [form, setForm] = useState({
    class: "", dayOfWeek: 1, period: 1, subject: "", teacherName: "", startTime: "", endTime: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState("10A");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await apiPost("/api/admin/timetable", form);
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="max-w-md">
        <SectionTitle>Add a timetable slot</SectionTitle>
        <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
          <input required placeholder="Class (e.g. 10A)" value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })} className="w-full border border-line rounded px-3 py-2 bg-paper">
            {DAY_OPTIONS.map((d) => (
              <option key={d.v} value={d.v}>{d.label}</option>
            ))}
          </select>
          <input required type="number" min={1} max={10} placeholder="Period number" value={form.period} onChange={(e) => setForm({ ...form, period: Number(e.target.value) })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input required placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input placeholder="Teacher name (optional)" value={form.teacherName} onChange={(e) => setForm({ ...form, teacherName: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <div className="flex gap-2">
            <input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
            <input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save slot"}</Button>
        </form>
        {saved && <p className="text-sm text-leaf mt-2">Slot saved. Adding another for the same class/day/period overwrites it.</p>}
      </div>
      <div>
        <SectionTitle>Preview a class&apos;s week</SectionTitle>
        <input placeholder="Class (e.g. 10A)" value={preview} onChange={(e) => setPreview(e.target.value)} className="w-full max-w-xs border border-line rounded px-3 py-2 bg-paper mb-3" />
        <TimetableTab classOverride={preview} />
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
          File bytes aren&apos;t stored by this app yet (no storage bucket credentials in this
          pass — see NOTES.md). Paste a URL to a file already hosted somewhere (e.g. a Supabase
          Storage public URL once configured, or a Google Drive share link).
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
