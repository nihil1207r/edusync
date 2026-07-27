"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { DailySummaryResponse, CommPrefs } from "@/lib/types";

/**
 * Deliberately not a dashboard: one quiet paragraph, read once and move on.
 * No charts, no navigation — per the brief's "calm, not gamified" rule for
 * the AI Insight Layer.
 *
 * Adapts its default view to the parent's learned delivery preference
 * (Parent Personality) — a parent who tends to expand to detail sees detail
 * by default, one who tends to listen gets the Listen button emphasized —
 * and logs whichever action is actually taken so that preference keeps
 * learning from real behavior, not a one-time guess.
 */
export default function DailySummaryCard() {
  const [data, setData] = useState<DailySummaryResponse | null>(null);
  const [prefs, setPrefs] = useState<CommPrefs | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    apiGet<DailySummaryResponse>("/api/insight/daily-summary").then(setData);
    apiGet<CommPrefs>("/api/comm-prefs").then((p) => {
      setPrefs(p);
      if (p.preferredFormat === "detailed" || p.preferredFormat === "visual") setShowDetail(true);
    });
  }, []);

  function logRead(action: "concise" | "detailed" | "voice" | "visual") {
    apiPost("/api/parent/message-read", { messageType: "daily_summary", action });
  }

  function toggleDetail() {
    const next = !showDetail;
    setShowDetail(next);
    logRead(next ? "detailed" : "concise");
  }

  function listen() {
    if (!data?.summary || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(data.summary);
    utter.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
    logRead("voice");
  }

  if (!data || !data.success || !data.summary) return null;

  const source = data.sourceData;

  return (
    <div className="bg-paper-raised border border-line rounded-lg p-5">
      <p className="text-xs uppercase tracking-wide text-ink-soft mb-2">Today, in short</p>
      <p className="text-ink leading-relaxed">{data.summary}</p>
      <p className="text-xs text-ink-soft mt-3">
        {data.generatedBy === "llm" ? "AI-written from today's data" : "Auto-generated from today's data"} — an
        observation, not a prediction.
      </p>

      <div className="flex items-center gap-3 mt-3">
        <button onClick={listen} disabled={speaking} className="text-xs text-accent-ink underline underline-offset-2 hover:no-underline disabled:opacity-50">
          {speaking ? "Speaking…" : "Listen"}
        </button>
        <button onClick={toggleDetail} className="text-xs text-accent-ink underline underline-offset-2 hover:no-underline">
          {showDetail ? "Show less" : "Show the numbers behind this"}
        </button>
      </div>

      {showDetail && source && (
        <div className="mt-3 pt-3 border-t border-line text-xs text-ink-soft space-y-0.5">
          {Object.entries(source).map(([k, v]) => (
            <p key={k}>
              {k}: {String(v)}
            </p>
          ))}
        </div>
      )}

      {prefs && prefs.sampleSize > 0 && (
        <p className="text-[11px] text-ink-soft mt-3 italic">
          Shown this way because you tend to prefer {prefs.preferredFormat} ({prefs.sampleSize} recent interactions).
        </p>
      )}
    </div>
  );
}
