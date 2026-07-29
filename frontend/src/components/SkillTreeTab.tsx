"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { LoadingState } from "@/components/ui";
import type { SkillNode } from "@/lib/types";

const STATUS_STYLE: Record<SkillNode["status"], string> = {
  mastered: "bg-leaf/20 border-leaf text-leaf",
  cleared: "bg-paper-raised border-line text-ink",
  current: "bg-accent/15 border-accent text-accent",
  locked: "bg-paper border-line text-ink-soft opacity-60",
};

const STATUS_LABEL: Record<SkillNode["status"], string> = {
  mastered: "Mastered",
  cleared: "Cleared",
  current: "Up next",
  locked: "Locked",
};

export default function SkillTreeTab() {
  const [tree, setTree] = useState<Record<string, SkillNode[]> | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; tree: Record<string, SkillNode[]> }>("/api/student/skill-tree").then((res) =>
      setTree(res.tree ?? {})
    );
  }, []);

  if (!tree) return <LoadingState />;
  const subjects = Object.keys(tree);
  if (subjects.length === 0) return <p className="text-sm text-ink-soft">No results yet — your skill tree fills in as exams are recorded.</p>;

  return (
    <div className="space-y-6">
      {subjects.map((subject) => (
        <div key={subject}>
          <p className="font-serif text-lg text-ink mb-3">{subject}</p>
          <div className="flex items-center flex-wrap gap-1">
            {tree[subject].map((node, i) => (
              <div key={i} className="flex items-center">
                <div
                  className={`flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 text-center px-1 ${STATUS_STYLE[node.status]}`}
                  title={STATUS_LABEL[node.status]}
                >
                  {node.status === "locked" ? (
                    <span className="text-lg">🔒</span>
                  ) : (
                    <span className="font-serif text-lg leading-none">{node.masteryPct}%</span>
                  )}
                  <span className="text-[10px] mt-1 leading-tight">{node.label}</span>
                </div>
                {i < tree[subject].length - 1 && <div className="w-6 h-0.5 bg-line" />}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
