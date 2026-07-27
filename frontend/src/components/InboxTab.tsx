"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, Pill, LoadingState } from "@/components/ui";
import type { InboxItem } from "@/lib/types";

const TYPE_LABEL: Record<InboxItem["type"], string> = {
  notice: "Notice",
  homework: "Homework",
  gatepass: "Gate Pass",
  leave: "Leave",
};

export default function InboxTab() {
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; items: InboxItem[] }>("/api/inbox").then((res) => setItems(res.items ?? []));
  }, []);

  if (!items) return <LoadingState />;

  return (
    <div className="space-y-2 max-w-2xl">
      {items.length === 0 && <p className="text-sm text-ink-soft">Nothing here yet.</p>}
      {items.map((item) => (
        <Card key={`${item.type}-${item.id}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pill tone={item.important ? "brick" : "ink"}>{TYPE_LABEL[item.type]}</Pill>
              <p className="font-medium text-ink">{item.title}</p>
            </div>
            <span className="text-xs text-ink-soft">{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
          {item.body && <p className="text-sm text-ink-soft mt-1">{item.body}</p>}
        </Card>
      ))}
    </div>
  );
}
