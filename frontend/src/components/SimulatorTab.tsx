"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, LoadingState } from "@/components/ui";
import type { SimulationResponse } from "@/lib/types";

const EXAMPLES = ["Delay start time by 20 minutes", "Cancel Friday's exam", "Move start time earlier by 15 minutes"];

export default function SimulatorTab() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    const res = await apiPost<SimulationResponse>("/api/admin/simulate", { question });
    setResult(res);
    setLoading(false);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <SectionTitle>Ask a what-if question</SectionTitle>
      <form onSubmit={run} className="flex gap-2">
        <input
          placeholder='e.g. "Delay start time by 20 minutes"'
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="flex-1 border border-line rounded px-3 py-2 bg-paper-raised"
        />
        <Button type="submit" disabled={loading}>{loading ? "Estimating…" : "Estimate"}</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => setQuestion(ex)} className="text-xs text-accent underline underline-offset-2 hover:no-underline">
            {ex}
          </button>
        ))}
      </div>

      {loading && <LoadingState />}
      {result && result.success && (
        <Card>
          <p className="text-ink leading-relaxed">{result.outcomes?.summary}</p>
          {result.outcomes?.method && (
            <p className="text-xs text-ink-soft mt-3 font-mono">{result.outcomes.method}</p>
          )}
          {result.baseline && (
            <div className="mt-3 pt-3 border-t border-line text-xs text-ink-soft space-y-0.5">
              <p className="uppercase tracking-wide mb-1">Baseline data used</p>
              {Object.entries(result.baseline).map(([k, v]) => (
                <p key={k}>{k}: {v}</p>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-soft mt-3 italic">{result.note}</p>
        </Card>
      )}
      {result && !result.success && <p className="text-sm text-brick">{result.message}</p>}
    </div>
  );
}
