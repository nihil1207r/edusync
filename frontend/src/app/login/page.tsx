"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui";
import { hasActiveTabSession, markSessionActive } from "@/lib/session";
import type { MeResponse } from "@/lib/types";

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="font-serif text-3xl text-ink">EduNexus</p>
          <p className="text-sm text-ink-soft mt-1">Sign in to your school account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-paper-raised border border-line rounded-lg p-6 space-y-4">
          <div>
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
              className="w-full border border-line rounded px-3 py-2 bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
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
              className="w-full border border-line rounded px-3 py-2 bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {error && <p className="text-sm text-brick">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 bg-paper-raised border border-line rounded-lg p-4">
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
                className="w-full flex items-center justify-between text-left px-2 py-1.5 rounded hover:bg-paper transition-colors"
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