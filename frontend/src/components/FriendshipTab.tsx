"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, Pill, LoadingState } from "@/components/ui";
import type { PeerRelationship, Student } from "@/lib/types";

const TYPE_LABEL: Record<PeerRelationship["relationship_type"], string> = {
  explains_well: "Explains well to",
  motivates: "Motivates",
  isolation_risk: "Isolation risk",
  suggested_seating: "Suggested seating with",
};

export default function FriendshipTab({ students }: { students: Student[] }) {
  const [relationships, setRelationships] = useState<PeerRelationship[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const [obsForm, setObsForm] = useState({ studentAId: "", studentBId: "", relationshipType: "explains_well", notes: "" });
  const [engStudent, setEngStudent] = useState("");
  const [engScores, setEngScores] = useState({ participation: 3, confidence: 3, curiosity: 3 });
  const [engSaved, setEngSaved] = useState(false);
  const [bountyAwarded, setBountyAwarded] = useState(false);

  async function logEngagement(e: React.FormEvent) {
    e.preventDefault();
    if (!engStudent) return;
    const student = students.find((s) => s.id === engStudent);
    const res = await apiPost<{ success: boolean; bountyAwarded?: boolean }>("/api/teacher/engagement", {
      studentId: engStudent, class: student?.class ?? "", ...engScores,
    });
    setEngSaved(true);
    setBountyAwarded(!!res.bountyAwarded);
    setTimeout(() => {
      setEngSaved(false);
      setBountyAwarded(false);
    }, 2500);
  }

  async function refresh() {
    const res = await apiGet<{ success: boolean; relationships: PeerRelationship[] }>("/api/teacher/friendship?status=suggested");
    setRelationships(res.relationships ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function generate() {
    setGenerating(true);
    await apiPost("/api/teacher/friendship/generate", {});
    await refresh();
    setGenerating(false);
  }

  async function respond(id: string, status: "accepted" | "rejected") {
    setResponding(id);
    await apiPost("/api/teacher/friendship/respond", { id, status });
    await refresh();
    setResponding(null);
  }

  async function addObservation(e: React.FormEvent) {
    e.preventDefault();
    if (!obsForm.studentAId) return;
    await apiPost("/api/teacher/friendship/observe", obsForm);
    setObsForm({ studentAId: "", studentBId: "", relationshipType: "explains_well", notes: "" });
    await refresh();
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionTitle>Suggestions to review</SectionTitle>
          <Button variant="secondary" onClick={generate} disabled={generating}>
            {generating ? "Generating…" : "Generate from recent engagement data"}
          </Button>
        </div>
        {!relationships ? (
          <LoadingState />
        ) : relationships.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No suggestions right now. Log engagement ratings for a few sessions, then generate.
          </p>
        ) : (
          <div className="space-y-2">
            {relationships.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center gap-2 mb-1">
                  <Pill>{TYPE_LABEL[r.relationship_type]}</Pill>
                  {r.confidence_score !== undefined && (
                    <span className="text-xs text-ink-soft">{Math.round((r.confidence_score ?? 0) * 100)}% confidence</span>
                  )}
                </div>
                <p className="text-sm text-ink">
                  {r.a?.name ?? "Student"}
                  {r.b?.name ? ` ↔ ${r.b.name}` : ""}
                </p>
                <p className="text-xs text-ink-soft mt-1">{r.evidence_source}</p>
                <div className="flex gap-2 mt-2">
                  <Button variant="secondary" onClick={() => respond(r.id, "accepted")} disabled={responding === r.id}>Accept</Button>
                  <Button variant="secondary" onClick={() => respond(r.id, "rejected")} disabled={responding === r.id}>Reject</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
        <p className="text-xs text-ink-soft mt-3 italic">
          These are pattern-based suggestions from logged engagement data, not confirmed facts — every one needs your accept or reject.
        </p>
      </div>

      <div>
        <SectionTitle>Log today&apos;s engagement</SectionTitle>
        <form onSubmit={logEngagement} className="space-y-2 bg-paper-raised border border-line rounded-lg p-4 max-w-md mb-6">
          <select required value={engStudent} onChange={(e) => setEngStudent(e.target.value)} className="w-full border border-line rounded px-3 py-2 bg-paper">
            <option value="">Student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {(["participation", "confidence", "curiosity"] as const).map((field) => (
            <div key={field} className="flex items-center gap-2">
              <label className="text-sm text-ink-soft w-24 capitalize">{field}</label>
              <input
                type="range" min={1} max={5}
                value={engScores[field]}
                onChange={(e) => setEngScores({ ...engScores, [field]: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-sm text-ink w-4">{engScores[field]}</span>
            </div>
          ))}
          <Button type="submit">Log</Button>
          {engSaved && <span className="text-sm text-leaf ml-2">Logged.</span>}
          {bountyAwarded && <span className="text-sm text-accent ml-2">✨ Curiosity bounty awarded (+10 points)!</span>}
        </form>

        <SectionTitle>Log your own observation</SectionTitle>
        <form onSubmit={addObservation} className="space-y-2 bg-paper-raised border border-line rounded-lg p-4 max-w-md">
          <select required value={obsForm.studentAId} onChange={(e) => setObsForm({ ...obsForm, studentAId: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
            <option value="">Student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={obsForm.relationshipType} onChange={(e) => setObsForm({ ...obsForm, relationshipType: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
            <option value="explains_well">Explains well to…</option>
            <option value="motivates">Motivates…</option>
            <option value="isolation_risk">Isolation risk</option>
          </select>
          {obsForm.relationshipType !== "isolation_risk" && (
            <select value={obsForm.studentBId} onChange={(e) => setObsForm({ ...obsForm, studentBId: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
              <option value="">Other student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <input placeholder="Notes (optional)" value={obsForm.notes} onChange={(e) => setObsForm({ ...obsForm, notes: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <Button type="submit">Add observation</Button>
        </form>
      </div>
    </div>
  );
}
