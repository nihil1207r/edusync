"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "./api";
import { hasActiveTabSession, clearSessionActive } from "./session";
import type { MeResponse, SessionUser } from "./types";

/**
 * Confirms the visitor is logged in (and, if a role is given, holds that
 * role or is an admin) by calling GET /auth/me. Redirects to /login
 * otherwise. Mirrors the server-side requireAuth() checks on the client.
 *
 * Also enforces tab-scoped login (see session.ts): if this tab never saw a
 * successful login itself — e.g. it's a freshly opened/reopened tab and the
 * only reason the session cookie still exists is browser tab-restore — we
 * treat that as logged out, clear the stale cookie server-side, and send
 * the visitor back to /login instead of trusting /auth/me.
 */
export function useAuthGuard(requiredRole?: SessionUser["role"]) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!hasActiveTabSession()) {
      // This tab never logged in itself. Purge any leftover session cookie
      // (fire-and-forget) so it can't be reused by another tab restore
      // either, then bounce to login.
      apiPost("/auth/logout", {}).catch(() => {});
      router.replace("/login");
      return;
    }

    apiGet<MeResponse>("/auth/me")
      .then((res) => {
        if (cancelled) return;
        const ok =
          res.loggedIn &&
          res.user &&
          (!requiredRole || res.user.role === requiredRole || res.user.role === "admin");
        if (!ok) {
          clearSessionActive();
          router.replace("/login");
          return;
        }
        setUser(res.user!);
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) {
          clearSessionActive();
          router.replace("/login");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requiredRole, router]);

  return { user, checking };
}
