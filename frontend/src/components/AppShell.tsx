"use client";

import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import { clearSessionActive } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
  admin: "Admin",
  driver: "Driver",
};

export default function AppShell({
  user,
  title,
  children,
}: {
  user: SessionUser;
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function handleLogout() {
    await apiPost("/auth/logout", {});
    clearSessionActive();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-paper-raised">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="font-serif text-xl tracking-tight text-ink">EduNexus</p>
            <p className="text-xs text-ink-soft">{title}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-ink">{user.name}</p>
              <p className="text-xs text-ink-soft">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 border border-line rounded hover:bg-paper transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
        <div className="ledger-rule" />
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
