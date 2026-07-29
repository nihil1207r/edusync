"use client";

import { useEffect, useRef } from "react";

/**
 * A restrained ambient light that trails the cursor across the whole app —
 * tinted with the live --accent token so it matches day/night editions
 * automatically. Purely decorative: fixed, non-interactive, and switched
 * off for touch devices and reduced-motion preferences.
 */
export default function CursorGlow() {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let raf = 0;

    function onMove(e: MouseEvent) {
      targetX = e.clientX;
      targetY = e.clientY;
    }

    function tick() {
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={dotRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[60] hidden sm:block"
      style={{ transform: "translate3d(-9999px, -9999px, 0)" }}
    >
      <div
        className="-translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 280,
          height: 280,
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 72%)",
        }}
      />
    </div>
  );
}
