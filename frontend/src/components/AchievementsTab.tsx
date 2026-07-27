"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, Pill, LoadingState } from "@/components/ui";
import type { CuriosityBounty, CommuteStreakResponse, ProgressComparisonResponse } from "@/lib/types";

export default function GamificationTab() {
  const [bounties, setBounties] = useState<{ bounties: CuriosityBounty[]; totalCount: number } | null>(null);
  const [streak, setStreak] = useState<CommuteStreakResponse | null>(null);
  const [comparison, setComparison] = useState<ProgressComparisonResponse | null>(null);

  useEffect(() => {
    apiGet<{ success: boolean; bounties: CuriosityBounty[]; totalCount: number }>("/api/student/curiosity-bounties").then(setBounties);
    apiGet<CommuteStreakResponse>("/api/student/commute-streak").then(setStreak);
    apiGet<ProgressComparisonResponse>("/api/student/progress-comparison").then(setComparison);
  }, []);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <p className="text-xs uppercase tracking-wide text-ink-soft mb-2">🚌 Commute streak</p>
        {!streak ? (
          <LoadingState />
        ) : !streak.success ? (
          <p className="text-sm text-ink-soft">{streak.message}</p>
        ) : (
          <>
            <p className="font-serif text-3xl text-ink">
              {streak.streakDays} <span className="text-base text-ink-soft">day{streak.streakDays === 1 ? "" : "s"}</span>
            </p>
            {streak.newBadge && <Pill tone="leaf">New badge: {streak.newBadge}</Pill>}
            <p className="text-xs text-ink-soft mt-2">Consecutive school days you&apos;ve boarded the bus.</p>
          </>
        )}
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-wide text-ink-soft mb-2">✨ Curiosity bounties</p>
        {!bounties ? (
          <LoadingState />
        ) : (
          <>
            <p className="font-serif text-3xl text-ink">{bounties.totalCount}</p>
            <p className="text-xs text-ink-soft mt-1 mb-2">Earned when a teacher logs you as especially curious in class.</p>
            <div className="space-y-1">
              {bounties.bounties.slice(0, 3).map((b) => (
                <p key={b.id} className="text-xs text-ink-soft">
                  {new Date(b.created_at).toLocaleDateString()} — {b.description}
                </p>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="md:col-span-2">
        <p className="text-xs uppercase tracking-wide text-ink-soft mb-3">📈 You vs. past-you</p>
        {!comparison ? (
          <LoadingState />
        ) : !comparison.success ? (
          <p className="text-sm text-ink-soft">{comparison.message}</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <ComparisonMetric label="Attendance" thisMonth={comparison.thisMonth?.attendanceRatePct} lastMonth={comparison.lastMonth?.attendanceRatePct} />
              <ComparisonMetric label="Homework on time" thisMonth={comparison.thisMonth?.homeworkOnTimePct} lastMonth={comparison.lastMonth?.homeworkOnTimePct} />
              <ComparisonMetric label="Avg. grade" thisMonth={comparison.thisMonth?.avgGradePct} lastMonth={comparison.lastMonth?.avgGradePct} />
            </div>
            <p className="text-xs text-ink-soft mt-4 italic">{comparison.note}</p>
          </>
        )}
      </Card>
    </div>
  );
}

function ComparisonMetric({ label, thisMonth, lastMonth }: { label: string; thisMonth?: number; lastMonth?: number }) {
  const t = thisMonth ?? 0;
  const l = lastMonth ?? 0;
  const delta = Math.round((t - l) * 10) / 10;
  const up = delta > 0;
  const flat = delta === 0;

  return (
    <div>
      <p className="text-xs text-ink-soft mb-1">{label}</p>
      <p className="font-serif text-2xl text-ink">{t.toFixed(0)}%</p>
      <p className={`text-xs ${flat ? "text-ink-soft" : up ? "text-leaf" : "text-brick"}`}>
        {flat ? "same as" : up ? `▲ +${delta.toFixed(0)}pp vs` : `▼ ${delta.toFixed(0)}pp vs`} last month ({l.toFixed(0)}%)
      </p>
    </div>
  );
}
