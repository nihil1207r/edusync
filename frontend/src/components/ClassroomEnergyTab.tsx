"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, LoadingState } from "@/components/ui";
import type { ClassEnergyInsights } from "@/lib/types";

const SCORES = [1, 2, 3, 4, 5];

export default function ClassroomEnergyTab({ defaultClass }: { defaultClass: string }) {
  const [period, setPeriod] = useState(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [insights, setInsights] = useState<ClassEnergyInsights | null>(null);

  async function refreshInsights() {
    const res = await apiGet<ClassEnergyInsights>(`/api/teacher/classenergy/insights?class=${encodeURIComponent(defaultClass)}`);
    setInsights(res);
  }

  useEffect(() => {
    refreshInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultClass]);

  async function logScore(score: number) {
    setSaving(true);
    await apiPost("/api/teacher/classenergy", { class: defaultClass, period, engagementScore: score, notes });
    setNotes("");
    setSaving(false);
    setSaved(true);
    await refreshInsights();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="max-w-md">
        <SectionTitle>Rate this class, right now</SectionTitle>
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-sm text-ink-soft">Period</label>
            <input
              type="number" min={1} max={10} value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="w-16 border border-line rounded px-2 py-1 text-sm bg-paper"
            />
          </div>
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 bg-paper mb-3 text-sm"
          />
          <div className="flex gap-2">
            {SCORES.map((s) => (
              <button
                key={s}
                onClick={() => logScore(s)}
                disabled={saving}
                className="flex-1 py-3 rounded border border-line bg-paper-raised hover:bg-accent/10 text-ink font-serif text-lg disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-soft mt-2">1 = low energy, 5 = fully engaged. One tap logs it.</p>
          {saved && <p className="text-sm text-leaf mt-2">Logged.</p>}
        </Card>
      </div>

      <div>
        <SectionTitle>What the pattern shows</SectionTitle>
        {!insights ? (
          <LoadingState />
        ) : (
          <Card>
            <p className="text-xs text-ink-soft mb-3">
              Based on {insights.sampleSize} logged session{insights.sampleSize === 1 ? "" : "s"} for {insights.class}.
            </p>
            <div className="space-y-2">
              {insights.observations.map((obs, i) => (
                <p key={i} className="text-sm text-ink">{obs}</p>
              ))}
            </div>
            <p className="text-xs text-ink-soft mt-4 italic">{insights.note}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
