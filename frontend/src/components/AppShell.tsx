"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import { clearSessionActive } from "@/lib/session";
import type { SessionUser } from "@/lib/types";
import ThemeToggle from "@/components/ThemeToggle";
import { Icon, MenuIcon, LogOutIcon, type IconName } from "@/components/Icons";

const ROLE_LABEL: Record<string, string> = {
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
  admin: "Admin",
  driver: "Driver",
};

export interface ShellTab {
  id: string;
  label: string;
  icon?: IconName;
}

const SIDEBAR_KEY = "edusync:sidebar";

export default function AppShell({
  user,
  title,
  children,
  tabs,
  activeTab,
  onTabChange,
}: {
  user: SessionUser;
  title: string;
  children: React.ReactNode;
  tabs?: ShellTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasNav = !!tabs && tabs.length > 0;

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored === "collapsed") setExpanded(false);
  }, []);

  async function handleLogout() {
    await apiPost("/auth/logout", {});
    clearSessionActive();
    router.replace("/login");
  }

  function toggleNav() {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileOpen((o) => !o);
      return;
    }
    setExpanded((e) => {
      const next = !e;
      window.localStorage.setItem(SIDEBAR_KEY, next ? "expanded" : "collapsed");
      return next;
    });
  }

  function selectTab(id: string) {
    onTabChange?.(id);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen flex bg-paper">
      {hasNav && mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {hasNav && (
        <aside
          className={`fixed md:sticky top-0 left-0 z-40 h-screen shrink-0 flex flex-col border-r border-line bg-paper-raised transition-transform duration-200 ease-out md:transition-[width] w-72 ${
            expanded ? "md:w-64" : "md:w-[76px]"
          } ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        >
          <div className="flex items-center gap-3 px-4 h-[68px] shrink-0 border-b border-line">
            <span className="stamp shrink-0 !w-9 !h-9 !text-[13px] text-accent border-accent/70">EN</span>
            <div className={`overflow-hidden whitespace-nowrap transition-all duration-150 ${expanded ? "opacity-100 max-w-[160px]" : "opacity-100 max-w-[160px] md:opacity-0 md:max-w-0"}`}>
              <p className="font-serif text-lg leading-none text-ink">EduNexus</p>
              <p className="text-[11px] text-ink-soft mt-0.5">Ledger edition</p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
            {tabs!.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  title={tab.label}
                  aria-current={isActive ? "page" : undefined}
                  className={`focus-ring group w-full flex items-center rounded-lg pl-3 pr-2.5 py-2.5 text-left transition-colors ${
                    isActive
                      ? "bg-paper text-ink shadow-card border-l-[3px] border-accent -ml-px pl-[11px]"
                      : "text-ink-soft hover:bg-paper/60 hover:text-ink border-l-[3px] border-transparent"
                  }`}
                >
                  <Icon name={tab.icon ?? "generic"} className={`w-[18px] h-[18px] shrink-0 ${isActive ? "text-accent" : ""}`} />
                  <span
                    className={`overflow-hidden whitespace-nowrap transition-all duration-150 text-sm ml-3 ${
                      expanded ? "opacity-100 max-w-[160px]" : "opacity-100 max-w-[160px] md:opacity-0 md:max-w-0 md:ml-0"
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="ledger-rule mx-4" />
          <p className={`px-4 py-3 text-[11px] text-ink-soft/70 overflow-hidden whitespace-nowrap transition-all ${expanded ? "opacity-100" : "opacity-100 md:opacity-0"}`}>
            Class register, always open.
          </p>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-paper-raised/90 backdrop-blur supports-[backdrop-filter]:bg-paper-raised/75">
          <div className="px-3 sm:px-6 py-3 flex items-center gap-3">
            {hasNav && (
              <button
                onClick={toggleNav}
                aria-label={expanded || mobileOpen ? "Collapse navigation" : "Expand navigation"}
                title={expanded || mobileOpen ? "Collapse navigation" : "Expand navigation"}
                className="focus-ring flex items-center justify-center w-9 h-9 rounded-full text-ink-soft hover:text-ink hover:bg-paper transition-colors shrink-0"
              >
                <MenuIcon open={mobileOpen} />
              </button>
            )}
            <div className="min-w-0">
              {!hasNav && <p className="font-serif text-lg leading-none text-ink">EduNexus</p>}
              <p className="text-sm sm:text-[15px] font-medium text-ink truncate mt-0.5">{title}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
              <ThemeToggle />
              <div className="hidden sm:block text-right leading-tight pl-1">
                <p className="text-sm font-medium text-ink">{user.name}</p>
                <p className="text-[11px] text-ink-soft">{ROLE_LABEL[user.role] ?? user.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="focus-ring flex items-center gap-1.5 text-sm px-3 py-1.5 border border-line rounded-full hover:bg-paper hover:border-accent/40 transition-colors text-ink-soft hover:text-ink"
              >
                <LogOutIcon />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 w-full px-4 sm:px-6 py-6 sm:py-8 max-w-[1400px] mx-auto">{children}</main>
      </div>
    </div>
  );
}
