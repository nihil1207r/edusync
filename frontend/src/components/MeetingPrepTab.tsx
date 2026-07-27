"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, LoadingState } from "@/components/ui";
import type { MeetingPrep, Student } from "@/lib/types";

export default function MeetingPrepTab({ students }: { students: Student[] }) {
  const [studentId, setStudentId] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [prep, setPrep] = useState<MeetingPrep | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    setLoading(true);
    const res = await apiPost<MeetingPrep>("/api/teacher/meeting-prep", { studentId, meetingDate });
    setPrep(res);
    setLoading(false);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <SectionTitle>Generate a meeting brief</SectionTitle>
      <form onSubmit={generate} className="flex flex-wrap gap-2">
        <select required value={studentId} onChange={(e) => setStudentId(e.target.value)} className="border border-line rounded px-3 py-2 bg-paper-raised">
          <option value="">Student</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="border border-line rounded px-3 py-2 bg-paper-raised" />
        <Button type="submit" disabled={loading}>{loading ? "Generating…" : "Generate"}</Button>
      </form>

      {loading && <LoadingState />}
      {prep && prep.success && (
        <Card>
          <p className="font-serif text-lg text-ink mb-3">{prep.studentName} · {prep.meetingDate}</p>
          <MeetingSection title="Achievements" items={prep.achievements} />
          <MeetingSection title="Concerns" items={prep.concerns} />
          <MeetingSection title="Suggested talking points" items={prep.suggestedActions} />
          <p className="text-xs text-ink-soft mt-4 italic">{prep.note}</p>
        </Card>
      )}
      {prep && !prep.success && <p className="text-sm text-brick">{prep.message}</p>}
    </div>
  );
}

function MeetingSection({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="text-xs uppercase tracking-wide text-ink-soft mb-1">{title}</p>
      <ul className="list-disc list-inside space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-ink">{it}</li>
        ))}
      </ul>
    </div>
  );
}
