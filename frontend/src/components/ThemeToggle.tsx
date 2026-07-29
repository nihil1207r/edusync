"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/Icons";

const STORAGE_KEY = "edusync:theme";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: "light" | "dark" =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    setMounted(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={mounted ? `Switch to ${theme === "dark" ? "day" : "night"} edition` : "Toggle theme"}
      title={mounted ? `Switch to ${theme === "dark" ? "day" : "night"} edition` : "Toggle theme"}
      className="focus-ring relative flex items-center justify-center w-9 h-9 rounded-full border border-line bg-paper text-ink-soft hover:text-accent hover:border-accent/50 hover:scale-105 active:scale-90 transition-all duration-150"
    >
      {mounted && theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
