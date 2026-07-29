"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui";
import ThemeToggle from "@/components/ThemeToggle";
import { hasActiveTabSession, markSessionActive } from "@/lib/session";
import type { MeResponse } from "@/lib/types";
import { tiltStyle, resetTiltStyle } from "@/lib/interactive";

const DEMO_ACCOUNTS = [
  { role: "Teacher", email: "priya@edunexus.com", password: "teacher123" },
  { role: "Parent", email: "arjun@edunexus.com", password: "parent123" },
  { role: "Student", email: "rahul@edunexus.com", password: "student123" },
  { role: "Admin", email: "admin@edunexus.com", password: "admin123" },
];

type LoginResponse = {
  success: boolean;
  role?: string;
  name?: string;
  message?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    // Only trust an existing session if THIS tab is the one that created it
    // (see session.ts) — otherwise a stale cookie from a closed/reopened
    // tab would silently sign the visitor back in on the login page.
    if (!hasActiveTabSession()) {
      apiPost("/auth/logout", {}).catch(() => {});
      return;
    }
    apiGet<MeResponse>("/auth/me").then((res) => {
      if (res.loggedIn && res.user) {
        router.replace(`/${res.user.role}`);
      }
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await apiPost<LoginResponse>("/auth/login", { email, password });
      if (!res.success || !res.role) {
        setError(res.message || "Invalid email or password.");
        return;
      }
      markSessionActive();
      router.push(`/${res.role}`);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative">
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center">
          <span className="brand-glow inline-flex transition-transform duration-200 hover:scale-105">
            <img src="/brand/logo-icon.png" alt="EduNexus" className="w-20 h-20 object-contain" />
          </span>
          <p className="font-serif text-3xl text-ink tracking-tight mt-2">EduNexus</p>
          <p className="text-sm text-ink-soft mt-1">Sign in to your school account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          onMouseMove={(e) => setCardStyle(tiltStyle(e, 4))}
          onMouseLeave={() => setCardStyle(resetTiltStyle())}
          style={{ transition: "transform 150ms ease-out", willChange: "transform", ...cardStyle }}
          className="group/login relative overflow-hidden bg-paper-raised border border-line rounded-xl p-6 space-y-4 shadow-raised"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 group-hover/login:opacity-100 transition-opacity duration-300"
            style={{
              background:
                "radial-gradient(360px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)",
            }}
          />
          <div className="relative">
            <label className="block text-xs uppercase tracking-wide text-ink-soft mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="focus-ring w-full border border-line rounded-lg px-3 py-2 bg-paper text-ink transition-shadow focus:shadow-card"
            />
          </div>
          <div className="relative">
            <label className="block text-xs uppercase tracking-wide text-ink-soft mb-1">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="focus-ring w-full border border-line rounded-lg px-3 py-2 bg-paper text-ink transition-shadow focus:shadow-card"
            />
          </div>

          {error && <p className="relative text-sm text-brick">{error}</p>}

          <div className="relative">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>

        <div className="mt-6 bg-paper-raised border border-line rounded-xl p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-ink-soft mb-2">
            Demo accounts — click to autofill
          </p>
          <div className="space-y-1">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => {
                  setEmail(acc.email);
                  setPassword(acc.password);
                }}
                className="focus-ring w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-lg hover:bg-paper hover:translate-x-0.5 transition-all duration-150"
              >
                <span className="text-sm font-medium text-ink">{acc.role}</span>
                <span className="text-xs font-mono text-ink-soft">{acc.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}