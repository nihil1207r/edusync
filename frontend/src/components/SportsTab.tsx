"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, Pill, LoadingState } from "@/components/ui";
import type { SportsActivity, SportsSignup } from "@/lib/types";
import { CLASS_OPTIONS } from "@/lib/classOptions";

export default function SportsTab({ role }: { role: "teacher" | "student" }) {
  const [activities, setActivities] = useState<SportsActivity[] | null>(null);
  const [signups, setSignups] = useState<SportsSignup[]>([]);

  async function refresh() {
    const [a, s] = await Promise.all([
      apiGet<{ success: boolean; activities: SportsActivity[] }>("/api/sports"),
      role === "student"
        ? apiGet<{ success: boolean; signups: SportsSignup[] }>("/api/sports-signups").catch(() => ({ success: false, signups: [] }))
        : Promise.resolve({ success: true, signups: [] as SportsSignup[] }),
    ]);
    setActivities(a.activities ?? []);
    setSignups(s.signups ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!activities) return <LoadingState />;

  return (
    <div className={role === "teacher" ? "grid lg:grid-cols-2 gap-6" : ""}>
      {role === "teacher" && <TeacherCreateSports onSaved={refresh} />}
      <div>
        <SectionTitle>Sports activities</SectionTitle>
        {activities.length === 0 ? (
          <p className="text-sm text-ink-soft">No sports activities scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <ActivityCard key={a.id} activity={a} role={role} signedUp={signups.some((s) => s.activity_id === a.id)} onChange={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityCard({
  activity,
  role,
  signedUp,
  onChange,
}: {
  activity: SportsActivity;
  role: "teacher" | "student";
  signedUp: boolean;
  onChange: () => void;
}) {
  const [signing, setSigning] = useState(false);
  const [signups, setSignups] = useState<SportsSignup[] | null>(null);

  async function signup() {
    setSigning(true);
    await apiPost("/api/student/sports-signup", { activityId: activity.id });
    setSigning(false);
    onChange();
  }

  async function loadSignups() {
    const res = await apiGet<{ success: boolean; signups: SportsSignup[] }>(`/api/sports-signups?activityId=${activity.id}`);
    setSignups(res.signups ?? []);
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-serif text-base text-ink">{activity.title}</p>
          <p className="text-xs text-ink-soft mt-0.5">
            {activity.category ?? "General"} · {activity.class ?? "Whole school"}
            {activity.schedule_date ? ` · ${new Date(activity.schedule_date).toLocaleDateString()}` : ""}
            {activity.coach_name ? ` · Coach: ${activity.coach_name}` : ""}
          </p>
        </div>
      </div>
      {activity.description && <p className="text-sm text-ink-soft mt-2">{activity.description}</p>}

      {role === "student" && (
        <div className="mt-3">
          <Button onClick={signup} disabled={signing || signedUp}>{signedUp ? "Signed up ✓" : signing ? "Signing up…" : "Sign up"}</Button>
        </div>
      )}

      {role === "teacher" && (
        <div className="mt-3 border-t border-line pt-3">
          {signups === null ? (
            <Button variant="secondary" onClick={loadSignups}>Show sign-ups</Button>
          ) : signups.length === 0 ? (
            <p className="text-xs text-ink-soft">No sign-ups yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {signups.map((s) => (
                <Pill key={s.id} tone="accent">{s.students?.name ?? s.student_id}</Pill>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function TeacherCreateSports({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", class: "", category: "", scheduleDate: "", coachName: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await apiPost("/api/teacher/sports", form);
    setSaving(false);
    setSaved(true);
    onSaved();
  }

  return (
    <div className="max-w-md">
      <SectionTitle>Add a sports activity</SectionTitle>
      <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
        <input required placeholder="Title (e.g. Inter-house Cricket)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <input placeholder="Category (e.g. cricket, athletics)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
          <option value="">Whole school</option>
          {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={form.scheduleDate} onChange={(e) => setForm({ ...form, scheduleDate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <input placeholder="Coach name" value={form.coachName} onChange={(e) => setForm({ ...form, coachName: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add activity"}</Button>
        {saved && <p className="text-sm text-leaf">Activity added.</p>}
      </form>
    </div>
  );
}
