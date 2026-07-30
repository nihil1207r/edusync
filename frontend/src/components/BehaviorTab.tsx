"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, Pill, LoadingState } from "@/components/ui";
import type { BehaviorLog, Student } from "@/lib/types";

const CATEGORY_TONE: Record<string, "leaf" | "ink" | "accent" | "brick"> = {
  positive: "leaf",
  neutral: "ink",
  needs_attention: "accent",
  incident: "brick",
};

const CATEGORY_LABEL: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  needs_attention: "Needs attention",
  incident: "Incident",
};

export default function BehaviorTab({ role }: { role: "teacher" | "student" | "parent" }) {
  const [logs, setLogs] = useState<BehaviorLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const res = await apiGet<{ success: boolean; logs: BehaviorLog[] }>("/api/behavior");
      setLogs(res.logs ?? []);
    } catch {
      setError("Couldn't load behavior notes right now — try again in a moment.");
      setLogs((prev) => prev ?? []);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className={role === "teacher" ? "grid lg:grid-cols-2 gap-6" : ""}>
      {role === "teacher" && (
        <div className="max-w-md">
          <SectionTitle>Log social behavior</SectionTitle>
          <p className="text-xs text-ink-soft mb-3">
            Short, specific notes — kindness, participation, conflicts, or anything worth a parent
            knowing about. Visible to the student&apos;s own family only.
          </p>
          <BehaviorForm onSaved={refresh} />
        </div>
      )}
      <div>
        <SectionTitle>{role === "teacher" ? "Recent entries — your class" : "Behavior notes"}</SectionTitle>
        {error && <p className="text-sm text-brick mb-3">{error}</p>}
        {!logs ? (
          <LoadingState />
        ) : logs.length === 0 ? (
          <p className="text-sm text-ink-soft">No behavior notes logged yet.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((l) => (
              <Card key={l.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-ink text-sm">
                    {l.students?.name ?? "Student"}
                    {l.students?.roll_no ? <span className="text-ink-soft font-mono text-xs"> #{l.students.roll_no}</span> : null}
                  </p>
                  <Pill tone={CATEGORY_TONE[l.category] ?? "ink"}>{CATEGORY_LABEL[l.category] ?? l.category}</Pill>
                </div>
                <p className="text-sm text-ink-soft mt-1">{l.note}</p>
                <p className="text-xs text-ink-soft mt-1">
                  {l.rating ? `Rating ${l.rating}/5 · ` : ""}
                  {l.logged_by ? `${l.logged_by} · ` : ""}
                  {new Date(l.created_at).toLocaleString()}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BehaviorForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsError, setStudentsError] = useState(false);
  const [form, setForm] = useState({ studentId: "", category: "positive", note: "", rating: 5 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; students: Student[] }>("/api/teacher/students")
      .then((res) => setStudents(res.students ?? []))
      .catch(() => setStudentsError(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.studentId || !form.note.trim()) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await apiPost<{ success: boolean; message?: string }>("/api/teacher/behavior", form);
      if (!res.success) {
        setError(res.message || "Couldn't save this entry — try again.");
        return;
      }
      setForm({ studentId: "", category: "positive", note: "", rating: 5 });
      setSaved(true);
      await onSaved();
    } catch {
      setError("Couldn't save this entry — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
      {studentsError && <p className="text-xs text-brick">Couldn&apos;t load your class roster — refresh and try again.</p>}
      <select required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
        <option value="">Select a student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>{s.name} · roll {s.roll_no}</option>
        ))}
      </select>
      <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
        <option value="positive">Positive</option>
        <option value="neutral">Neutral</option>
        <option value="needs_attention">Needs attention</option>
        <option value="incident">Incident</option>
      </select>
      <textarea required placeholder="What happened?" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
      <div className="flex items-center gap-2">
        <label className="text-sm text-ink-soft">Rating</label>
        <input type="range" min={1} max={5} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} className="flex-1" />
        <span className="text-sm text-ink w-6 text-right">{form.rating}</span>
      </div>
      <Button type="submit" disabled={saving || !form.studentId || !form.note.trim()}>{saving ? "Saving…" : "Log entry"}</Button>
      {saved && <p className="text-sm text-leaf">Saved.</p>}
      {error && <p className="text-sm text-brick">{error}</p>}
    </form>
  );
}
