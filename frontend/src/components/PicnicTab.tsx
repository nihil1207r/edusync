"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, Pill, LoadingState } from "@/components/ui";
import type { Picnic, PicnicRequest } from "@/lib/types";
import { CLASS_OPTIONS } from "@/lib/classOptions";

export default function PicnicTab({ role }: { role: "teacher" | "student" | "parent" }) {
  const [picnics, setPicnics] = useState<Picnic[] | null>(null);
  const [requests, setRequests] = useState<PicnicRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      // Teachers don't need "my requests" (they browse per-picnic via
      // TeacherRequestsPanel instead) — skip that fetch for them so this
      // tab does one API call, not two, on every load/refresh.
      const [p, r] = await Promise.all([
        apiGet<{ success: boolean; picnics: Picnic[] }>("/api/picnics"),
        role === "teacher"
          ? Promise.resolve({ success: true, requests: [] as PicnicRequest[] })
          : apiGet<{ success: boolean; requests: PicnicRequest[] }>("/api/picnic-requests"),
      ]);
      setPicnics(p.picnics ?? []);
      setRequests(r.requests ?? []);
    } catch {
      setError("Couldn't load picnics right now — try again in a moment.");
      setPicnics((prev) => prev ?? []);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (!picnics) return <LoadingState />;

  return (
    <div className={role === "teacher" ? "space-y-8" : "grid lg:grid-cols-2 gap-6"}>
      {role === "teacher" && <TeacherCreatePicnic onSaved={refresh} />}
      <div>
        <SectionTitle>{role === "teacher" ? "Planned picnics & trips" : "Picnics & trips"}</SectionTitle>
        {error && <p className="text-sm text-brick mb-3">{error}</p>}
        {picnics.length === 0 ? (
          <p className="text-sm text-ink-soft">No picnics planned yet.</p>
        ) : (
          <div className="space-y-3">
            {picnics.map((p) => (
              <PicnicCard key={p.id} picnic={p} role={role} myRequest={requests.find((r) => r.picnic_id === p.id)} onChange={refresh} />
            ))}
          </div>
        )}
      </div>
      {role === "teacher" && (
        <div>
          <SectionTitle>Join requests</SectionTitle>
          <TeacherRequestsPanel picnics={picnics} />
        </div>
      )}
    </div>
  );
}

function PicnicCard({
  picnic,
  role,
  myRequest,
  onChange,
}: {
  picnic: Picnic;
  role: "teacher" | "student" | "parent";
  myRequest?: PicnicRequest;
  onChange: () => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const [consenting, setConsenting] = useState(false);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  async function request() {
    setRequesting(true);
    setActionError(null);
    try {
      const res = await apiPost<{ success: boolean; message?: string }>("/api/student/picnic-request", { picnicId: picnic.id });
      if (!res.success) {
        setActionError(res.message || "Couldn't send your request — try again.");
        return;
      }
      await onChange();
    } catch {
      setActionError("Couldn't send your request — check your connection and try again.");
    } finally {
      setRequesting(false);
    }
  }

  async function consent(agree: boolean) {
    setConsenting(true);
    setActionError(null);
    try {
      const res = await apiPost<{ success: boolean; message?: string }>("/api/parent/picnic-consent", { picnicId: picnic.id, consent: agree, note });
      if (!res.success) {
        setActionError(res.message || "Couldn't save your response — try again.");
        return;
      }
      await onChange();
    } catch {
      setActionError("Couldn't save your response — check your connection and try again.");
    } finally {
      setConsenting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-serif text-base text-ink">{picnic.title}</p>
          <p className="text-xs text-ink-soft mt-0.5">
            {picnic.class} · {new Date(picnic.event_date).toLocaleDateString()}
            {picnic.location ? ` · ${picnic.location}` : ""}
            {picnic.cost > 0 ? ` · ₹${picnic.cost}` : ""}
          </p>
        </div>
        <Pill tone={picnic.status === "confirmed" ? "leaf" : picnic.status === "cancelled" ? "brick" : "accent"}>{picnic.status}</Pill>
      </div>
      {picnic.description && <p className="text-sm text-ink-soft mt-2">{picnic.description}</p>}
      {actionError && <p className="text-xs text-brick mt-2">{actionError}</p>}

      {role === "student" && (
        <div className="mt-3">
          {myRequest ? (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-ink-soft">Your request:</span>
              <Pill tone={myRequest.status === "approved" ? "leaf" : myRequest.status === "rejected" ? "brick" : "accent"}>{myRequest.status}</Pill>
              <Pill tone={myRequest.parent_consent ? "leaf" : "ink"}>{myRequest.parent_consent ? "Parent consented" : "Awaiting parent form"}</Pill>
            </div>
          ) : picnic.status === "cancelled" ? (
            <p className="text-xs text-ink-soft">This picnic was cancelled — requests are closed.</p>
          ) : (
            <Button onClick={request} disabled={requesting}>{requesting ? "Requesting…" : "Request to join"}</Button>
          )}
        </div>
      )}

      {role === "parent" && (
        <div className="mt-3 border-t border-line pt-3">
          {myRequest ? (
            <>
              <p className="text-xs text-ink-soft mb-2">
                Your child has requested to join. Fill this picnic consent form to confirm.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Pill tone={myRequest.status === "approved" ? "leaf" : myRequest.status === "rejected" ? "brick" : "accent"}>{myRequest.status}</Pill>
                <Pill tone={myRequest.parent_consent ? "leaf" : "ink"}>{myRequest.parent_consent ? "Consent given" : "No consent yet"}</Pill>
              </div>
              <textarea
                placeholder="Notes for the teacher (allergies, pickup instructions, etc.) — optional"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-line rounded px-3 py-2 bg-paper text-sm mt-2"
              />
              <div className="flex gap-2 mt-2">
                <Button onClick={() => consent(true)} disabled={consenting}>{consenting ? "Saving…" : "Give consent"}</Button>
                <Button variant="secondary" onClick={() => consent(false)} disabled={consenting}>Decline</Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-ink-soft">Your child hasn&apos;t requested this picnic yet — the form appears here once they do.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function TeacherCreatePicnic({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({ title: "", description: "", class: "", location: "", eventDate: "", cost: 0, maxStudents: 40 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await apiPost<{ success: boolean; message?: string }>("/api/teacher/picnics", form);
      if (!res.success) {
        setError(res.message || "Couldn't save the picnic — try again.");
        return;
      }
      setSaved(true);
      setForm({ title: "", description: "", class: "", location: "", eventDate: "", cost: 0, maxStudents: 40 });
      await onSaved();
    } catch {
      setError("Couldn't save the picnic — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md">
      <SectionTitle>Plan a picnic / trip</SectionTitle>
      <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
        <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
          <option value="">My class (default)</option>
          {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <input required type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <div className="flex gap-2">
          <input type="number" min={0} placeholder="Cost (₹)" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input type="number" min={1} placeholder="Max students" value={form.maxStudents} onChange={(e) => setForm({ ...form, maxStudents: Number(e.target.value) })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        </div>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Plan picnic"}</Button>
        {saved && <p className="text-sm text-leaf">Picnic published.</p>}
        {error && <p className="text-sm text-brick">{error}</p>}
      </form>
    </div>
  );
}

function TeacherRequestsPanel({ picnics }: { picnics: Picnic[] }) {
  const [selected, setSelected] = useState("");
  const [requests, setRequests] = useState<PicnicRequest[] | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(picnicId: string) {
    setSelected(picnicId);
    setError(null);
    if (!picnicId) {
      setRequests(null);
      return;
    }
    try {
      const res = await apiGet<{ success: boolean; requests: PicnicRequest[] }>(`/api/picnic-requests?picnicId=${picnicId}`);
      setRequests(res.requests ?? []);
    } catch {
      setError("Couldn't load requests for this picnic — try again.");
    }
  }

  async function update(requestId: string, status: string) {
    setUpdating(requestId);
    setError(null);
    try {
      const res = await apiPost<{ success: boolean; message?: string }>("/api/teacher/picnic-requests/update", { requestId, status });
      if (!res.success) {
        setError(res.message || "Couldn't update that request — try again.");
        return;
      }
      await load(selected);
    } catch {
      setError("Couldn't update that request — check your connection and try again.");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div>
      <select value={selected} onChange={(e) => load(e.target.value)} className="w-full max-w-sm border border-line rounded px-3 py-2 bg-paper-raised mb-4">
        <option value="">Choose a picnic…</option>
        {picnics.map((p) => (
          <option key={p.id} value={p.id}>{p.title} · {p.class}</option>
        ))}
      </select>
      {error && <p className="text-sm text-brick mb-2">{error}</p>}
      {selected && !requests && !error && <LoadingState />}
      {requests && requests.length === 0 && <p className="text-sm text-ink-soft">No join requests yet for this picnic.</p>}
      {requests && requests.length > 0 && (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-paper-raised border border-line rounded px-3 py-2 text-sm gap-2">
              <div>
                <span className="text-ink">{r.students?.name ?? r.student_id}</span>{" "}
                <span className="text-ink-soft font-mono text-xs">#{r.students?.roll_no}</span>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <Pill tone={r.status === "approved" ? "leaf" : r.status === "rejected" ? "brick" : "accent"}>{r.status}</Pill>
                  <Pill tone={r.parent_consent ? "leaf" : "ink"}>{r.parent_consent ? "Parent consented" : "No consent"}</Pill>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="secondary" onClick={() => update(r.id, "approved")} disabled={updating === r.id || r.status === "approved"}>
                  {updating === r.id ? "…" : "Approve"}
                </Button>
                <Button variant="danger" onClick={() => update(r.id, "rejected")} disabled={updating === r.id || r.status === "rejected"}>
                  {updating === r.id ? "…" : "Reject"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
