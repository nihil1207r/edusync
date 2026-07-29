"use client";

import { useState } from "react";
import { spotlightStyle, tiltStyle, resetTiltStyle, magnetStyle, resetMagnetStyle } from "@/lib/interactive";

export function Card({
  children,
  className = "",
  interactive = true,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  const [spot, setSpot] = useState<React.CSSProperties>({});

  return (
    <div
      onMouseMove={interactive ? (e) => setSpot(spotlightStyle(e)) : undefined}
      onMouseLeave={interactive ? () => setSpot({}) : undefined}
      style={spot}
      className={`group/card relative bg-paper-raised border border-line rounded-xl p-5 shadow-card transition-shadow duration-200 hover:shadow-raised animate-surface-in ${className}`}
    >
      {interactive && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"
          style={{
            background:
              "radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%)",
          }}
        />
      )}
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-lg text-ink mb-3 tracking-tight">{children}</h2>
  );
}

export function StatCard({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string | number;
  tone?: "ink" | "leaf" | "brick" | "accent";
}) {
  const toneColor: Record<string, string> = {
    ink: "text-ink",
    leaf: "text-leaf",
    brick: "text-brick",
    accent: "text-accent",
  };
  const [style, setStyle] = useState<React.CSSProperties>({});

  return (
    <div
      onMouseMove={(e) => setStyle(tiltStyle(e, 6))}
      onMouseLeave={() => setStyle(resetTiltStyle())}
      style={{ transition: "transform 150ms ease-out", willChange: "transform", ...style }}
      className="group/stat relative bg-paper-raised border border-line rounded-xl p-5 shadow-card transition-shadow duration-200 hover:shadow-raised overflow-hidden animate-surface-in"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(220px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, var(--accent) 20%, transparent), transparent 70%)",
        }}
      />
      <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: "var(--line)" }} />
      <p className="relative text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">{label}</p>
      <p className={`relative font-serif text-3xl tracking-tight ${toneColor[tone]}`}>{value}</p>
    </div>
  );
}

export function Stamp({ grade }: { grade: string }) {
  const color = grade.startsWith("A")
    ? "text-leaf"
    : grade.startsWith("B")
      ? "text-accent"
      : "text-brick";
  return <span className={`stamp transition-transform duration-200 hover:scale-110 hover:rotate-0 ${color}`}>{grade}</span>;
}

export function Pill({
  children,
  tone = "ink",
}: {
  children: React.ReactNode;
  tone?: "ink" | "leaf" | "brick" | "accent";
}) {
  const toneClass: Record<string, string> = {
    ink: "bg-ink/8 text-ink",
    leaf: "bg-leaf/15 text-leaf",
    brick: "bg-brick/15 text-brick",
    accent: "bg-accent/15 text-accent",
  };
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full transition-transform duration-150 hover:scale-105 ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const styles: Record<string, string> = {
    primary: "bg-ink text-paper hover:bg-ink/88 shadow-card",
    secondary: "border border-line text-ink bg-paper-raised hover:bg-paper hover:border-accent/40",
    danger: "bg-brick text-paper hover:bg-brick/88 shadow-card",
  };
  const [magnet, setMagnet] = useState<React.CSSProperties>({});
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  function handleMove(e: React.MouseEvent<HTMLButtonElement>) {
    if (disabled) return;
    setMagnet(magnetStyle(e, 0.15));
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!disabled) {
      const rect = e.currentTarget.getBoundingClientRect();
      const id = Date.now() + Math.random();
      setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
      window.setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 500);
    }
    onClick?.();
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => setMagnet(resetMagnetStyle)}
      disabled={disabled}
      style={{ transition: "transform 150ms ease-out", ...magnet }}
      className={`focus-ring relative overflow-hidden text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]}`}
    >
      <span className="relative">{children}</span>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full bg-current opacity-30"
          style={{
            left: r.x,
            top: r.y,
            width: 8,
            height: 8,
            marginLeft: -4,
            marginTop: -4,
            animation: "ripple 500ms ease-out forwards",
          }}
        />
      ))}
    </button>
  );
}

export function AIHighlightBanner({
  eyebrow = "AI Insight Layer",
  title,
  description,
  ctaLabel,
  onClick,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  ctaLabel: string;
  onClick: () => void;
}) {
  const [spot, setSpot] = useState<React.CSSProperties>({});
  return (
    <div
      onMouseMove={(e) => setSpot(spotlightStyle(e))}
      onMouseLeave={() => setSpot({})}
      style={spot}
      className="group/banner relative mb-6 overflow-hidden rounded-xl border border-accent/30 bg-accent/[0.07] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-surface-in"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 group-hover/banner:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(340px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)",
        }}
      />
      <span className="absolute left-0 top-0 h-full w-[3px] bg-accent" />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-wide text-accent mb-1 font-medium">{eyebrow}</p>
        <p className="font-serif text-lg text-ink tracking-tight">{title}</p>
        <p className="text-sm text-ink-soft mt-1 max-w-2xl">{description}</p>
      </div>
      <div className="relative shrink-0">
        <Button onClick={onClick}>{ctaLabel} →</Button>
      </div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 text-ink-soft text-sm py-16">
      <span className="w-1.5 h-1.5 rounded-full bg-ink-soft animate-bounce [animation-delay:-0.2s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-ink-soft animate-bounce" />
      <span className="w-1.5 h-1.5 rounded-full bg-ink-soft animate-bounce [animation-delay:0.2s]" />
      <span className="ml-1">Loading…</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <p className="text-brick text-sm py-12 text-center">{message}</p>;
}
