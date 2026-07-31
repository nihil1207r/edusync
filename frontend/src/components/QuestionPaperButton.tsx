"use client";

import { useState } from "react";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui";
import { openPdfFromBase64 } from "@/lib/pdf";

export default function QuestionPaperButton({ homeworkId, fileName }: { homeworkId: string; fileName?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function view() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ success: boolean; fileBase64?: string; fileName?: string; message?: string }>(
        `/api/homework/question-file?homeworkId=${homeworkId}`
      );
      if (res.success && res.fileBase64) {
        openPdfFromBase64(res.fileBase64, res.fileName || fileName || "question-paper.pdf");
      } else {
        setError(res.message || "Couldn't open the question paper.");
      }
    } catch {
      setError("Couldn't open the question paper — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span>
      <Button variant="secondary" onClick={view} disabled={loading}>
        {loading ? "Opening…" : "View question paper"}
      </Button>
      {error && <p className="text-xs text-brick mt-1">{error}</p>}
    </span>
  );
}
