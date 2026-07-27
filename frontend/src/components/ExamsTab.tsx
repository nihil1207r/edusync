"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, LoadingState, Stamp } from "@/components/ui";
import type { Exam, Grade } from "@/lib/types";

export default function ExamsTab({ grades }: { grades: Grade[] }) {
  const [exams, setExams] = useState<Exam[] | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; exams: Exam[] }>("/api/exams").then((res) => setExams(res.exams ?? []));
  }, []);

  if (!exams) return <LoadingState />;

  const upcoming = exams.filter((e) => new Date(e.exam_date) >= new Date(new Date().toDateString()));
  const gradeBySubject = new Map(grades.map((g) => [g.subject, g]));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-soft mb-2">Upcoming exams</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-soft">No upcoming exams scheduled.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {upcoming.map((e) => (
              <Card key={e.id}>
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{e.subject}</p>
                  <span className="text-xs text-ink-soft">{e.term}</span>
                </div>
                <p className="text-sm text-ink-soft mt-1">
                  {new Date(e.exam_date).toLocaleDateString()} · Max marks {e.max_marks}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-ink-soft mb-2">Results</p>
        <div className="space-y-2 max-w-xl">
          {grades.length === 0 && <p className="text-sm text-ink-soft">No results published yet.</p>}
          {grades.map((g) => (
            <Card key={g.id} className="flex items-center justify-between !flex">
              <div>
                <p className="font-medium text-ink">{g.subject}</p>
                <p className="text-xs text-ink-soft">
                  {g.marks} / {g.total}
                </p>
              </div>
              <Stamp grade={g.grade} />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
