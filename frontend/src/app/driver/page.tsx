"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthGuard } from "@/lib/useAuthGuard";
import { apiGet, apiPost } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Card, SectionTitle, Button, Pill, LoadingState, ErrorState } from "@/components/ui";
import type { DriverBus, RosterEntry } from "@/lib/types";

interface MyBusResponse {
  success: boolean;
  message?: string;
  bus?: DriverBus;
}

export default function DriverPage() {
  const { user, checking } = useAuthGuard("driver");
  const [busRes, setBusRes] = useState<MyBusResponse | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [onRoute, setOnRoute] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [posting, setPosting] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  async function refresh() {
    const bus = await apiGet<MyBusResponse>("/api/driver/mybus");
    setBusRes(bus);
    if (bus.success) {
      const r = await apiGet<{ success: boolean; roster: RosterEntry[] }>("/api/driver/roster");
      setRoster(r.roster ?? []);
    }
  }

  useEffect(() => {
    if (!checking && user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user]);

  function pingOnce(busId: string) {
    if (!navigator.geolocation) {
      setGeoError("This browser/device doesn't support location — use the driver's phone.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        apiPost("/api/driver/location", { busId, lat: pos.coords.latitude, lng: pos.coords.longitude }).then(() => {
          setLastPing(new Date().toLocaleTimeString());
        });
        setGeoError(null);
      },
      (err) => setGeoError(err.message)
    );
  }

  function startRoute(busId: string) {
    if (!navigator.geolocation) {
      setGeoError("This browser/device doesn't support location — use the driver's phone.");
      return;
    }
    pingOnce(busId);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        apiPost("/api/driver/location", { busId, lat: pos.coords.latitude, lng: pos.coords.longitude }).then(() => {
          setLastPing(new Date().toLocaleTimeString());
        });
      },
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    setOnRoute(true);
  }

  function endRoute() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setOnRoute(false);
  }

  async function markEvent(studentId: string, event: "boarded" | "alighted", busId: string) {
    setPosting(studentId + event);
    await apiPost("/api/driver/boarding", { studentId, busId, event });
    setPosting(null);
  }

  async function reportStatus(busId: string, status: "delayed" | "breakdown" | "resolved") {
    setPosting(status);
    await apiPost("/api/driver/status", { busId, status, note: statusNote });
    setStatusNote("");
    setPosting(null);
  }

  async function raiseSOS(busId: string) {
    setPosting("sos");
    const doPost = (lat?: number, lng?: number) =>
      apiPost("/api/driver/sos", { busId, lat, lng, note: statusNote }).then(() => setPosting(null));
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => doPost(pos.coords.latitude, pos.coords.longitude),
        () => doPost()
      );
    } else {
      doPost();
    }
  }

  if (checking || !user) return <LoadingState />;
  if (!busRes) return <LoadingState />;
  if (!busRes.success || !busRes.bus) {
    return (
      <AppShell user={user} title="Driver">
        <ErrorState message={busRes.message || "No bus assigned."} />
      </AppShell>
    );
  }

  const bus = busRes.bus;

  return (
    <AppShell user={user} title="Driver">
      <div className="space-y-6">
        <Card className="!flex items-center justify-between">
          <div>
            <p className="font-serif text-xl text-ink">{bus.number_plate}</p>
            <p className="text-sm text-ink-soft">{bus.routes?.name ?? "No route assigned"}</p>
          </div>
          <div className="flex items-center gap-2">
            {onRoute && <Pill tone="leaf">on route{lastPing ? ` · last ping ${lastPing}` : ""}</Pill>}
            {!onRoute ? (
              <Button onClick={() => startRoute(bus.id)}>Start route</Button>
            ) : (
              <Button variant="secondary" onClick={endRoute}>End route</Button>
            )}
          </div>
        </Card>
        {geoError && <p className="text-sm text-brick">{geoError}</p>}

        <div>
          <SectionTitle>Report an issue</SectionTitle>
          <div className="flex flex-wrap items-center gap-2 max-w-xl">
            <input
              placeholder="Note (optional)"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              className="flex-1 min-w-[200px] border border-line rounded px-3 py-2 bg-paper-raised"
            />
            <Button variant="secondary" onClick={() => reportStatus(bus.id, "delayed")} disabled={posting === "delayed"}>
              Report delay
            </Button>
            <Button variant="secondary" onClick={() => reportStatus(bus.id, "breakdown")} disabled={posting === "breakdown"}>
              Report breakdown
            </Button>
            <Button variant="secondary" onClick={() => reportStatus(bus.id, "resolved")} disabled={posting === "resolved"}>
              Mark resolved
            </Button>
            <Button variant="danger" onClick={() => raiseSOS(bus.id)} disabled={posting === "sos"}>
              SOS
            </Button>
          </div>
        </div>

        <div>
          <SectionTitle>Students on this route</SectionTitle>
          {!roster ? (
            <LoadingState />
          ) : roster.length === 0 ? (
            <p className="text-sm text-ink-soft">No students assigned to this route yet.</p>
          ) : (
            <div className="space-y-1.5 max-w-xl">
              {roster.map((r) => (
                <div key={r.student_id} className="flex items-center justify-between bg-paper-raised border border-line rounded px-3 py-2">
                  <span className="text-sm text-ink">
                    {r.students.name} <span className="text-ink-soft">· {r.students.class} · #{r.students.roll_no}</span>
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => markEvent(r.student_id, "boarded", bus.id)}
                      disabled={posting === r.student_id + "boarded"}
                    >
                      Boarded
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => markEvent(r.student_id, "alighted", bus.id)}
                      disabled={posting === r.student_id + "alighted"}
                    >
                      Alighted
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
