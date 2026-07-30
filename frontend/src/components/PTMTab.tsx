"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, Pill, LoadingState } from "@/components/ui";
import type { PTMSchedule, PTMBooking } from "@/lib/types";
import { CLASS_OPTIONS } from "@/lib/classOptions";

export default function PTMTab({ role }: { role: "teacher" | "parent" }) {
  const [schedules, setSchedules] = useState<PTMSchedule[] | null>(null);

  async function refresh() {
    const res = await apiGet<{ success: boolean; schedules: PTMSchedule[] }>("/api/ptm");
    setSchedules(res.schedules ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!schedules) return <LoadingState />;

  return (
    <div className={role === "teacher" ? "grid lg:grid-cols-2 gap-6" : ""}>
      {role === "teacher" && <TeacherCreatePTM onSaved={refresh} />}
      <div>
        <SectionTitle>Parent-Teacher Meeting schedule</SectionTitle>
        {schedules.length === 0 ? (
          <p className="text-sm text-ink-soft">No PTM slots scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {schedules.map((s) => (
              <PTMCard key={s.id} ptm={s} role={role} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PTMCard({ ptm, role }: { ptm: PTMSchedule; role: "teacher" | "parent" }) {
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [slotTime, setSlotTime] = useState(ptm.start_time?.slice(0, 5) ?? "");
  const [bookings, setBookings] = useState<PTMBooking[] | null>(null);

  async function book() {
    setBooking(true);
    await apiPost("/api/parent/ptm-book", { ptmId: ptm.id, slotTime });
    setBooking(false);
    setBooked(true);
  }

  async function loadBookings() {
    const res = await apiGet<{ success: boolean; bookings: PTMBooking[] }>(`/api/teacher/ptm-bookings?ptmId=${ptm.id}`);
    setBookings(res.bookings ?? []);
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-serif text-base text-ink">{ptm.class} · {new Date(ptm.scheduled_date).toLocaleDateString()}</p>
          <p className="text-xs text-ink-soft mt-0.5">
            {ptm.start_time?.slice(0, 5)}–{ptm.end_time?.slice(0, 5)}
            {ptm.location ? ` · ${ptm.location}` : ""}
            {ptm.teacher_name ? ` · ${ptm.teacher_name}` : ""}
          </p>
        </div>
      </div>
      {ptm.agenda && <p className="text-sm text-ink-soft mt-2">{ptm.agenda}</p>}

      {role === "parent" && (
        <div className="mt-3 flex items-center gap-2">
          <input type="time" value={slotTime} onChange={(e) => setSlotTime(e.target.value)} className="border border-line rounded px-2 py-1 text-sm bg-paper" />
          <Button onClick={book} disabled={booking || booked}>{booked ? "Booked ✓" : booking ? "Booking…" : "Book a slot"}</Button>
        </div>
      )}

      {role === "teacher" && (
        <div className="mt-3 border-t border-line pt-3">
          {bookings === null ? (
            <Button variant="secondary" onClick={loadBookings}>Show bookings</Button>
          ) : bookings.length === 0 ? (
            <p className="text-xs text-ink-soft">No parents have booked a slot yet.</p>
          ) : (
            <div className="space-y-1">
              {bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{b.students?.name ?? b.student_id}</span>
                  <Pill tone="accent">{b.slot_time?.slice(0, 5) ?? "—"}</Pill>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function TeacherCreatePTM({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ class: "", scheduledDate: "", startTime: "", endTime: "", location: "", agenda: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await apiPost("/api/teacher/ptm", form);
    setSaving(false);
    setSaved(true);
    onSaved();
  }

  return (
    <div className="max-w-md">
      <SectionTitle>Schedule a PTM</SectionTitle>
      <form onSubmit={submit} className="space-y-3 bg-paper-raised border border-line rounded-lg p-4">
        <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
          <option value="">My class (default)</option>
          {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input required type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <div className="flex gap-2">
          <input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
          <input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        </div>
        <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <textarea placeholder="Agenda" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Schedule PTM"}</Button>
        {saved && <p className="text-sm text-leaf">PTM scheduled.</p>}
      </form>
    </div>
  );
}
