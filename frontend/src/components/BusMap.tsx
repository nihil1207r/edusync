"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { apiGet } from "@/lib/api";
import { Card, LoadingState, Pill } from "@/components/ui";
import type { BusETA, BusGeofenceEvent } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface ChildBusResponse {
  success: boolean;
  message?: string;
  busId?: string;
  location?: { lat: number; lng: number; updated_at: string } | null;
}

const EVENT_LABEL: Record<BusGeofenceEvent["event"], string> = {
  arrived: "Arrived at",
  departed: "Departed",
  delayed: "Delayed",
  breakdown: "Breakdown reported",
  resolved: "Back to normal",
};

export default function BusMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [status, setStatus] = useState<ChildBusResponse | null>(null);
  const [eta, setEta] = useState<BusETA | null>(null);
  const [events, setEvents] = useState<BusGeofenceEvent[]>([]);

  useEffect(() => {
    apiGet<ChildBusResponse>("/api/bus/mine").then(setStatus);
    apiGet<BusETA>("/api/bus/eta").then(setEta);
    apiGet<{ success: boolean; events: BusGeofenceEvent[] }>("/api/bus/events").then((res) => setEvents(res.events ?? []));
    const poll = setInterval(() => {
      apiGet<BusETA>("/api/bus/eta").then(setEta);
      apiGet<{ success: boolean; events: BusGeofenceEvent[] }>("/api/bus/events").then((res) => setEvents(res.events ?? []));
    }, 15000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!status?.success || !status.location || !mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [status.location.lng, status.location.lat],
      zoom: 14,
    });
    marker.current = new maplibregl.Marker({ color: "#a53f2b" })
      .setLngLat([status.location.lng, status.location.lat])
      .addTo(map.current);

    // Live updates via Server-Sent Events — the marker animates to the new
    // spot rather than jumping, using MapLibre's built-in easeTo.
    const es = new EventSource(`${API_URL}/api/bus/stream`, { withCredentials: true });
    es.onmessage = (evt) => {
      try {
        const loc = JSON.parse(evt.data) as { lat: number; lng: number };
        marker.current?.setLngLat([loc.lng, loc.lat]);
        map.current?.easeTo({ center: [loc.lng, loc.lat], duration: 1200 });
      } catch {
        // ignore malformed pings
      }
    };

    return () => {
      es.close();
      map.current?.remove();
      map.current = null;
    };
  }, [status]);

  if (!status) return <LoadingState />;
  if (!status.success) {
    return <p className="text-sm text-ink-soft py-12 text-center">{status.message || "No bus assigned yet."}</p>;
  }
  if (!status.location) {
    return <p className="text-sm text-ink-soft py-12 text-center">Bus assigned, but no live location yet.</p>;
  }

  return (
    <div className="space-y-3">
      {eta?.success && (
        <Card className="!flex items-center justify-between">
          <div>
            <p className="font-serif text-lg text-ink">
              ~{eta.etaMinutes} min away
              {eta.stopName ? ` from ${eta.stopName}` : ""}
            </p>
            <p className="text-xs text-ink-soft mt-0.5">{eta.note}</p>
          </div>
          {!eta.speedEstimated && <Pill>average-speed estimate</Pill>}
        </Card>
      )}
      <div ref={mapContainer} className="w-full h-96 rounded-lg border border-line" />
      {events.length > 0 && (
        <div className="space-y-1.5">
          {events.slice(0, 5).map((ev) => (
            <div key={ev.id} className="flex items-center justify-between text-sm bg-paper-raised border border-line rounded px-3 py-2">
              <span className="text-ink">
                {EVENT_LABEL[ev.event]}
                {ev.stop_name ? ` ${ev.stop_name}` : ""}
                {ev.note ? ` — ${ev.note}` : ""}
              </span>
              <span className="text-xs text-ink-soft">{new Date(ev.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
