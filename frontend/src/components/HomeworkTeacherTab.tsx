"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, Pill, LoadingState } from "@/components/ui";
import { openPdfFromBase64 } from "@/lib/pdf";
import type { Homework, HomeworkRosterRow, HomeworkInsight } from "@/lib/types";
import { CLASS_OPTIONS } from "@/lib/classOptions";

export default function HomeworkTeacherTab({ initial }: { initial?: Homework[] }) {
  const [homework, setHomework] = useState<Homework[] | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const res = await apiGet<{ success: boolean; homework: Homework[] }>("/api/teacher/dashboard");
      setHomework(res.homework);
    } catch {
      setError("Couldn't load assignments right now — try again in a moment.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches every other tab in this codebase
    if (!homework) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = homework?.find((h) => h.id === openId);

  return (
    <div>
      {!open ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <AssignHomeworkForm onSaved={refresh} />
          <div>
            <SectionTitle>Assigned homework</SectionTitle>
            {error && <p className="text-sm text-brick mb-3">{error}</p>}
            {!homework ? (
              <LoadingState />
            ) : homework.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {homework.map((h) => (
                  <div key={h.id} onClick={() => setOpenId(h.id)} className="cursor-pointer">
                  <Card className="hover:border-accent transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{h.title}</p>
                        <p className="text-xs text-ink-soft">
                          {h.subject} · {h.class ?? "class"} · due {new Date(h.due_date).toLocaleString()} · {h.points} pts
                        </p>
                      </div>
                      <Pill tone="accent">{h.homework_submissions?.[0]?.count ?? 0} turned in</Pill>
                    </div>
                    {h.description && <p className="text-sm text-ink-soft mt-1">{h.description}</p>}
                  </Card>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <HomeworkRoster homework={open} onBack={() => setOpenId(null)} />
      )}
    </div>
  );
}

function AssignHomeworkForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({ title: "", subject: "", description: "", class: "", dueDate: "", points: 50 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // datetime-local gives "YYYY-MM-DDTHH:mm" with no timezone — convert
      // to a real instant (in the teacher's own timezone) before sending,
      // so "due 11:59 PM" means the same moment for every student, not
      // whatever the DB server's session timezone happens to default to.
      const dueDateIso = form.dueDate ? new Date(form.dueDate).toISOString() : "";
      const res = await apiPost<{ success: boolean; message?: string }>("/api/homework", { ...form, dueDate: dueDateIso });
      if (!res.success) {
        setError(res.message || "Couldn't assign this homework — try again.");
        return;
      }
      setSaved(true);
      setForm({ title: "", subject: "", description: "", class: "", dueDate: "", points: 50 });
      await onSaved();
    } catch {
      setError("Couldn't assign this homework — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionTitle>Assign homework</SectionTitle>
      <p className="text-xs text-ink-soft mb-3">
        Students turn this in as a PDF, with a real turned-in time — and each submission gets an automatic
        first-pass AI review once it lands.
      </p>
      <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
        <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <input required placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <textarea placeholder="Instructions for students (this is also what the AI grades against)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
          <option value="">My class (default)</option>
          {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div>
          <label className="text-xs text-ink-soft block mb-1">Due date &amp; time</label>
          <input required type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        </div>
        <input type="number" min={1} placeholder="Points" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <Button type="submit" disabled={saving}>{saving ? "Posting…" : "Assign homework"}</Button>
        {saved && <p className="text-sm text-leaf">Assigned.</p>}
        {error && <p className="text-sm text-brick">{error}</p>}
      </form>
    </div>
  );
}

function HomeworkRoster({ homework, onBack }: { homework: Homework; onBack: () => void }) {
  const [roster, setRoster] = useState<HomeworkRosterRow[] | null>(null);
  const [insight, setInsight] = useState<HomeworkInsight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [rosterRes, insightRes] = await Promise.all([
        apiGet<{ success: boolean; roster: HomeworkRosterRow[] }>(`/api/teacher/homework/submissions?homeworkId=${homework.id}`),
        apiGet<{ success: boolean } & HomeworkInsight>(`/api/teacher/homework/insight?homeworkId=${homework.id}`),
      ]);
      setRoster(rosterRes.roster ?? []);
      setInsight(insightRes);
    } catch {
      setError("Couldn't load this assignment's submissions — try again in a moment.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homework.id]);

  async function viewFile(submissionId: string, fileName: string) {
    setLoadingFile(submissionId);
    try {
      const res = await apiGet<{ success: boolean; fileBase64?: string; fileName?: string; message?: string }>(`/api/homework/submission-file?submissionId=${submissionId}`);
      if (res.success && res.fileBase64) {
        openPdfFromBase64(res.fileBase64, res.fileName || fileName);
      } else {
        setError(res.message || "Couldn't open this PDF.");
      }
    } catch {
      setError("Couldn't open this PDF — try again.");
    } finally {
      setLoadingFile(null);
    }
  }

  const turnedInCount = roster?.filter((r) => r.turnedIn).length ?? 0;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-ink-soft hover:text-ink mb-3">&larr; Back to all assignments</button>
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <p className="font-serif text-xl text-ink">{homework.title}</p>
          <p className="text-sm text-ink-soft">
            {homework.subject} · {homework.class} · due {new Date(homework.due_date).toLocaleString()} · out of {homework.points} pts
          </p>
        </div>
        <Button variant="secondary" onClick={refresh}>Refresh</Button>
      </div>
      {error && <p className="text-sm text-brick mb-3">{error}</p>}

      {!roster ? (
        <LoadingState />
      ) : (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <div>
            <SectionTitle>{turnedInCount} / {roster.length} turned in</SectionTitle>
            <div className="space-y-2">
              {roster.map((r) => (
                <RosterRow key={r.studentId} row={r} maxPoints={homework.points} onGraded={refresh} onViewFile={viewFile} loadingFile={loadingFile === r.submissionId} />
              ))}
            </div>
          </div>
          <div>
            <SectionTitle>Class insight</SectionTitle>
            <ClassInsightPanel insight={insight} maxPoints={homework.points} />
          </div>
        </div>
      )}
    </div>
  );
}

function RosterRow({
  row,
  maxPoints,
  onGraded,
  onViewFile,
  loadingFile,
}: {
  row: HomeworkRosterRow;
  maxPoints: number;
  onGraded: () => void | Promise<void>;
  onViewFile: (submissionId: string, fileName: string) => void;
  loadingFile: boolean;
}) {
  const [marks, setMarks] = useState(row.marksAwarded ?? row.aiSuggestedScore ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveMarks() {
    if (!row.submissionId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiPost<{ success: boolean; message?: string }>("/api/teacher/homework/grade", {
        submissionId: row.submissionId, marksAwarded: marks,
      });
      if (!res.success) {
        setError(res.message || "Couldn't save this grade.");
        return;
      }
      await onGraded();
    } catch {
      setError("Couldn't save this grade — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!row.turnedIn) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-ink">{row.name} <span className="text-ink-soft font-mono text-xs">#{row.rollNo}</span></p>
          </div>
          <Pill tone="ink">Not turned in</Pill>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm text-ink">{row.name} <span className="text-ink-soft font-mono text-xs">#{row.rollNo}</span></p>
          <p className="text-xs text-ink-soft mt-0.5">
            Turned in {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "—"}
            {row.late && <span className="text-brick"> · late</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={row.late ? "brick" : "leaf"}>{row.late ? "Late" : "On time"}</Pill>
          {row.submissionId && (
            <Button variant="secondary" onClick={() => onViewFile(row.submissionId!, row.fileName || "homework.pdf")} disabled={loadingFile}>
              {loadingFile ? "Opening…" : "View PDF"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 border-t border-line pt-2">
        {row.aiGeneratedBy === "llm" ? (
          <>
            <p className="text-xs text-ink-soft">
              AI suggested <span className="text-ink font-medium">{row.aiSuggestedScore}/{maxPoints}</span>
            </p>
            {row.aiFeedback && <p className="text-sm text-ink-soft mt-1 italic">&ldquo;{row.aiFeedback}&rdquo;</p>}
            {row.aiMistakeTags && row.aiMistakeTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {row.aiMistakeTags.map((t) => <Pill key={t} tone="accent">{t}</Pill>)}
              </div>
            )}
          </>
        ) : row.aiGeneratedBy === "unavailable" ? (
          <p className="text-xs text-ink-soft">AI review isn&apos;t configured for this deployment.</p>
        ) : row.aiGeneratedBy === "error" ? (
          <p className="text-xs text-ink-soft">AI review failed for this submission — grade it manually.</p>
        ) : (
          <p className="text-xs text-ink-soft">AI is reviewing this submission — check back shortly.</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number" min={0} max={maxPoints} value={marks}
          onChange={(e) => setMarks(Number(e.target.value))}
          className="w-20 border border-line rounded px-2 py-1 text-sm bg-paper"
        />
        <span className="text-xs text-ink-soft">/ {maxPoints}</span>
        <Button onClick={saveMarks} disabled={saving}>{saving ? "Saving…" : row.marksAwarded != null ? "Update grade" : "Save grade"}</Button>
        {row.marksAwarded != null && <Pill tone="leaf">Graded</Pill>}
      </div>
      {error && <p className="text-xs text-brick mt-1">{error}</p>}
    </Card>
  );
}

function ClassInsightPanel({ insight, maxPoints }: { insight: HomeworkInsight | null; maxPoints: number }) {
  if (!insight) return <LoadingState />;
  if (insight.totalSubmissions === 0) {
    return <p className="text-sm text-ink-soft">No submissions yet — insight appears once students turn work in.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <p className="text-xs text-ink-soft">Avg. AI suggested</p>
          <p className="font-serif text-2xl text-ink">{insight.aiEvaluatedCount > 0 ? `${insight.averageSuggestedScore}/${maxPoints}` : "—"}</p>
        </Card>
        <Card>
          <p className="text-xs text-ink-soft">Avg. final grade</p>
          <p className="font-serif text-2xl text-ink">{insight.gradedCount > 0 ? `${insight.averageMarksAwarded}/${maxPoints}` : "—"}</p>
        </Card>
      </div>

      {insight.teachingSuggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-1">Worth revisiting in class</p>
          <div className="space-y-1.5">
            {insight.teachingSuggestions.map((s) => (
              <div key={s} className="bg-accent/[0.07] border border-accent/30 rounded-lg px-3 py-2 text-sm text-ink">{s}</div>
            ))}
          </div>
        </div>
      )}

      {insight.mistakeTags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-1">All mistakes seen</p>
          <div className="space-y-1.5">
            {insight.mistakeTags.map((t) => (
              <div key={t.tag} className="flex items-start justify-between gap-2 bg-paper-raised border border-line rounded px-3 py-2">
                <div>
                  <p className="text-sm text-ink">{t.tag}</p>
                  {t.example && <p className="text-xs text-ink-soft mt-0.5">{t.example}</p>}
                </div>
                <Pill tone={t.count >= 2 ? "brick" : "ink"}>{t.count} student{t.count === 1 ? "" : "s"}</Pill>
              </div>
            ))}
          </div>
        </div>
      )}

      {insight.aiEvaluatedCount === 0 && (
        <p className="text-xs text-ink-soft">
          No AI evaluations yet for this assignment — either they&apos;re still running, or AI review isn&apos;t
          configured for this deployment (needs a GEMINI_API_KEY).
        </p>
      )}
    </div>
  );
}
