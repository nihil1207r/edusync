"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, LoadingState, Pill } from "@/components/ui";
import type { SchoolDocument } from "@/lib/types";

const CATEGORY_LABEL: Record<SchoolDocument["category"], string> = {
  report_card: "Report Card",
  id_card: "ID Card",
  certificate: "Certificate",
  circular: "Circular",
  other: "Other",
};

export default function DocumentsTab() {
  const [docs, setDocs] = useState<SchoolDocument[] | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; documents: SchoolDocument[] }>("/api/documents").then((res) =>
      setDocs(res.documents ?? [])
    );
  }, []);

  if (!docs) return <LoadingState />;

  return (
    <div className="space-y-2 max-w-2xl">
      {docs.length === 0 && <p className="text-sm text-ink-soft">No documents shared yet.</p>}
      {docs.map((d) => (
        <Card key={d.id} className="flex items-center justify-between !flex">
          <div className="flex items-center gap-2">
            <Pill>{CATEGORY_LABEL[d.category]}</Pill>
            <p className="font-medium text-ink">{d.title}</p>
          </div>
          <a
            href={d.file_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent-ink underline underline-offset-2 hover:no-underline"
          >
            View
          </a>
        </Card>
      ))}
    </div>
  );
}
