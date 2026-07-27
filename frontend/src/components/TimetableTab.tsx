"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, LoadingState } from "@/components/ui";
import type { TimetableSlot } from "@/lib/types";

const DAY_LABEL = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TimetableTab({ classOverride }: { classOverride?: string }) {
  const [slots, setSlots] = useState<TimetableSlot[] | null>(null);

  useEffect(() => {
    const qs = classOverride ? `?class=${encodeURIComponent(classOverride)}` : "";
    apiGet<{ success: boolean; slots: TimetableSlot[] }>(`/api/timetable${qs}`).then((res) =>
      setSlots(res.slots ?? [])
    );
  }, [classOverride]);

  if (!slots) return <LoadingState />;
  if (slots.length === 0) return <p className="text-sm text-ink-soft">No timetable published yet.</p>;

  const byDay: Record<number, TimetableSlot[]> = {};
  for (const s of slots) (byDay[s.day_of_week] ||= []).push(s);

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[1, 2, 3, 4, 5, 6].map(
        (day) =>
          byDay[day] && (
            <Card key={day}>
              <p className="font-serif text-base text-ink mb-2">{DAY_LABEL[day]}</p>
              <div className="space-y-1.5">
                {byDay[day]
                  .sort((a, b) => a.period - b.period)
                  .map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-ink">{s.subject}</span>
                      <span className="text-ink-soft text-xs">
                        {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        {s.teacher_name ? ` · ${s.teacher_name}` : ""}
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          )
      )}
    </div>
  );
}
