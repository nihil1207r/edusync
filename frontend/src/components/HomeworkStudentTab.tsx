"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, Pill, LoadingState } from "@/components/ui";
import { fileToBase64 } from "@/lib/pdf";
import type { Homework, MyHomeworkSubmission } from "@/lib/types";

export default function HomeworkStudentTab({
  homework,
  submittedIds,
  onSubmitted,
}: {
  homework: Homework[];
  submittedIds: string[];
  onSubmitted: () => void | Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const open = homework.find((h) => h.id === openId);

  if (open) {
    return (
      <HomeworkDetail
        homework={open}
        submitted={submittedIds.includes(open.id)}
        onBack={() => setOpenId(null)}
        onSubmitted={onSubmitted}
      />
    );
  }

  return (
    <div>
      <SectionTitle>Assignments</SectionTitle>
      {homework.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing assigned right now.</p>
      ) : (
        <div className="space-y-2">
          {homework.map((h) => {
            const done = submittedIds.includes(h.id);
            const overdue = !done && new Date(h.due_date).getTime() < now;
            return (
              <div key={h.id} onClick={() => setOpenId(h.id)} className="cursor-pointer">
                <Card className="hover:border-accent transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">{h.title}</p>
                      <p className="text-xs text-ink-soft">
                        {h.subject} · due {new Date(h.due_date).toLocaleString()} · {h.points} pts
                      </p>
                    </div>
                    {done ? (
                      <Pill tone="leaf">Turned in</Pill>
                    ) : overdue ? (
                      <Pill tone="brick">Overdue</Pill>
                    ) : (
                      <Pill tone="ink">Not submitted</Pill>
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HomeworkDetail({
  homework,
  submitted,
  onBack,
  onSubmitted,
}: {
  homework: Homework;
  submitted: boolean;
  onBack: () => void;
  onSubmitted: () => void | Promise<void>;
}) {
  const [mySubmission, setMySubmission] = useState<MyHomeworkSubmission | null | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earned, setEarned] = useState<number | null>(null);
  const [now] = useState(() => Date.now());

  async function refresh() {
    try {
      const res = await apiGet<{ success: boolean; submission: MyHomeworkSubmission | null }>(`/api/student/homework/submission?homeworkId=${homework.id}`);
      setMySubmission(res.submission ?? null);
    } catch {
      setMySubmission(null);
    }
  }

  useEffect(() => {
    if (submitted) refresh();
    else setMySubmission(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homework.id, submitted]);

  async function submit() {
    if (!file) {
      setError("Attach your homework as a PDF first.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Only PDF files are accepted.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await apiPost<{ success: boolean; message?: string; pointsEarned?: number }>("/api/homework/submit", {
        homeworkId: homework.id, fileBase64, fileName: file.name,
      });
      if (!res.success) {
        setError(res.message || "Couldn't submit — try again.");
        return;
      }
      if (res.pointsEarned) setEarned(res.pointsEarned);
      setFile(null);
      await onSubmitted();
      await refresh();
    } catch {
      setError("Couldn't submit — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const overdue = new Date(homework.due_date).getTime() < now;

  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="text-sm text-ink-soft hover:text-ink mb-3">&larr; Back to assignments</button>
      <p className="font-serif text-xl text-ink">{homework.title}</p>
      <p className="text-sm text-ink-soft mt-0.5">
        {homework.subject} · due {new Date(homework.due_date).toLocaleString()} · {homework.points} pts
      </p>
      {homework.description && <p className="text-sm text-ink-soft mt-3">{homework.description}</p>}

      {earned !== null && <p className="text-sm text-leaf mt-3">+{earned} points earned!</p>}

      <div className="mt-4">
        {!submitted ? (
          <Card>
            {overdue && <p className="text-sm text-brick mb-2">This was due {new Date(homework.due_date).toLocaleString()} — you can still turn it in, but it&apos;ll show as late.</p>}
            <label className="block text-sm text-ink-soft mb-2">Attach your homework as a PDF</label>
            <input
              type="file" accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-ink-soft file:mr-3 file:rounded file:border file:border-line file:bg-paper-raised file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
            {error && <p className="text-sm text-brick mt-2">{error}</p>}
            <div className="mt-3">
              <Button onClick={submit} disabled={submitting || !file}>
                {submitting ? "Turning in…" : "Turn in"}
              </Button>
            </div>
          </Card>
        ) : (
          <SubmissionStatus submission={mySubmission} maxPoints={homework.points} />
        )}
      </div>
    </div>
  );
}

function SubmissionStatus({ submission, maxPoints }: { submission: MyHomeworkSubmission | null | undefined; maxPoints: number }) {
  if (submission === undefined) return <LoadingState />;
  if (!submission) return <p className="text-sm text-ink-soft">Turned in — refresh in a moment to see details.</p>;

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-ink">
          Turned in <span className="font-medium">{new Date(submission.submitted_at).toLocaleString()}</span>
        </p>
        <Pill tone="leaf">{submission.file_name}</Pill>
      </div>

      {submission.marks_awarded != null ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs text-ink-soft uppercase tracking-wide">Your grade</p>
          <p className="font-serif text-3xl text-leaf">{submission.marks_awarded}/{maxPoints}</p>
          {submission.graded_by && (
            <p className="text-xs text-ink-soft mt-0.5">
              Graded by {submission.graded_by}{submission.graded_at ? ` · ${new Date(submission.graded_at).toLocaleString()}` : ""}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-soft mt-3 border-t border-line pt-3">Your teacher hasn&apos;t graded this yet.</p>
      )}

      <div className="mt-3">
        {submission.ai_generated_by === "llm" ? (
          <div className="bg-accent/[0.07] border border-accent/30 rounded-lg p-3">
            <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-1">
              AI first look — suggested {submission.ai_suggested_score}/{maxPoints}
            </p>
            {submission.ai_feedback && <p className="text-sm text-ink">{submission.ai_feedback}</p>}
            {submission.ai_mistakes && submission.ai_mistakes.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-ink-soft mb-1">What to work on</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {submission.ai_mistakes.map((m) => (
                    <li key={m.tag} className="text-sm text-ink-soft"><span className="text-ink">{m.tag}</span> — {m.explanation}</li>
                  ))}
                </ul>
              </div>
            )}
            {submission.ai_strengths && submission.ai_strengths.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {submission.ai_strengths.map((s) => <Pill key={s} tone="leaf">{s}</Pill>)}
              </div>
            )}
            <p className="text-xs text-ink-soft mt-2 italic">This is an automatic first read, not your final grade — your teacher decides that.</p>
          </div>
        ) : submission.ai_generated_by === "unavailable" ? (
          <p className="text-xs text-ink-soft">AI review isn&apos;t configured for this deployment.</p>
        ) : submission.ai_generated_by === "error" ? (
          <p className="text-xs text-ink-soft">AI review couldn&apos;t process this submission — your teacher will grade it directly.</p>
        ) : (
          <p className="text-xs text-ink-soft">AI is reviewing your submission — check back in a bit.</p>
        )}
      </div>
    </Card>
  );
}
