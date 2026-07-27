"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, LoadingState } from "@/components/ui";
import type { MasteryTopic } from "@/lib/types";

/**
 * "Knowledge Journey": frames each subject as a mastery percentage instead
 * of a raw score. The raw marks still live on the Grades tab — this is an
 * additional lens on the same numbers, not a replacement for them.
 */
export default function MasteryTab() {
  const [topics, setTopics] = useState<MasteryTopic[] | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; topics: MasteryTopic[] }>("/api/insight/mastery").then((res) => setTopics(res.topics ?? []));
  }, []);

  if (!topics) return <LoadingState />;

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {topics.length === 0 && <p className="text-sm text-ink-soft">No mastery data yet.</p>}
      {topics.map((t) => (
        <Card key={t.subject}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-ink">{t.subject}</p>
            <span className="text-sm text-ink-soft">{t.masteryPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-line overflow-hidden">
            <div className="h-full bg-leaf" style={{ width: `${Math.min(100, t.masteryPct)}%` }} />
          </div>
        </Card>
      ))}
    </div>
  );
}
