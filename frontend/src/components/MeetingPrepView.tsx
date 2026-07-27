"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, LoadingState } from "@/components/ui";

interface MeetingPrepDoc {
  id: string;
  meeting_date: string;
  achievements: string[];
  concerns: string[];
  suggested_actions: string[];
  generated_at: string;
}

export default function MeetingPrepView() {
  const [docs, setDocs] = useState<MeetingPrepDoc[] | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; docs: MeetingPrepDoc[] }>("/api/meeting-prep").then((res) => setDocs(res.docs ?? []));
  }, []);

  if (!docs) return <LoadingState />;
  if (docs.length === 0) return <p className="text-sm text-ink-soft">No meeting briefs yet.</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      {docs.map((d) => (
        <Card key={d.id}>
          <p className="font-serif text-lg text-ink mb-2">Meeting on {new Date(d.meeting_date).toLocaleDateString()}</p>
          <Section title="Achievements" items={d.achievements} />
          <Section title="Concerns" items={d.concerns} />
          <Section title="Suggested talking points" items={d.suggested_actions} />
        </Card>
      ))}
    </div>
  );
}

function Section({ title, items }: { title: string; items?: string[] }) {
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
