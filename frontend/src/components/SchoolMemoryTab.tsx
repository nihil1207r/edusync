"use client";

import { useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, SectionTitle, Button, LoadingState } from "@/components/ui";
import type { SchoolMemoryResult, Student } from "@/lib/types";

interface SearchResponse {
  success: boolean;
  results: SchoolMemoryResult[];
  interpretedKeywords?: string[];
  message?: string;
}

export default function SchoolMemoryTab({ students }: { students?: Student[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [eventForm, setEventForm] = useState({ studentId: "", eventType: "extracurricular", description: "", eventDate: "" });
  const [savedEvent, setSavedEvent] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    const res = await apiGet<SearchResponse>(`/api/school-memory/search?q=${encodeURIComponent(query)}`);
    setResults(res);
    setSearching(false);
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    await apiPost("/api/teacher/school-events", eventForm);
    setEventForm({ studentId: "", eventType: "extracurricular", description: "", eventDate: "" });
    setSavedEvent(true);
    setTimeout(() => setSavedEvent(false), 2000);
  }

  return (
    <div className={students ? "grid lg:grid-cols-2 gap-6" : "max-w-xl"}>
      <div>
        <SectionTitle>Ask about school history</SectionTitle>
        <form onSubmit={search} className="flex gap-2 mb-4">
          <input
            placeholder='e.g. "who participated in robotics"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 border border-line rounded px-3 py-2 bg-paper-raised"
          />
          <Button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</Button>
        </form>
        {results && (
          <div className="space-y-2">
            {results.results.length === 0 ? (
              <p className="text-sm text-ink-soft">{results.message || "No matching records."}</p>
            ) : (
              results.results.map((r) => (
                <Card key={r.id}>
                  <p className="text-sm text-ink">{r.description}</p>
                  <p className="text-xs text-ink-soft mt-1">
                    {r.students?.name ?? "Student"} {r.students?.class ? `· ${r.students.class}` : ""} · {new Date(r.event_date).toLocaleDateString()} · {r.event_type}
                  </p>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {students && (
        <div>
          <SectionTitle>Add an event manually</SectionTitle>
          <p className="text-xs text-ink-soft mb-3">
            For things this app doesn&apos;t track automatically yet — club participation, awards,
            performances. Exam results and shared certificates are indexed here automatically.
          </p>
          <form onSubmit={addEvent} className="space-y-2 bg-paper-raised border border-line rounded-lg p-4">
            <select required value={eventForm.studentId} onChange={(e) => setEventForm({ ...eventForm, studentId: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
              <option value="">Student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select value={eventForm.eventType} onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper">
              <option value="extracurricular">Extracurricular</option>
              <option value="achievement">Achievement</option>
              <option value="other">Other</option>
            </select>
            <input required placeholder="Description (e.g. 'Joined robotics club')" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
            <input type="date" value={eventForm.eventDate} onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })} className="w-full border border-line rounded px-3 py-2 bg-paper" />
            <Button type="submit">Add</Button>
          </form>
          {savedEvent && <p className="text-sm text-leaf mt-2">Added.</p>}
        </div>
      )}
    </div>
  );
}
