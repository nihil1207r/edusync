/**
 * A small, hand-picked line-icon set for EduNexus nav items.
 * No icon package is installed in this project, so these are drawn by hand
 * at a consistent 22x22 grid / 1.6 stroke weight, in the same spirit as the
 * ledger marks used elsewhere (ticks, rules, stamps).
 */
export type IconName =
  | "dashboard"
  | "sparkles"
  | "pulse"
  | "notes"
  | "archive"
  | "flag"
  | "inbox"
  | "users"
  | "calendarCheck"
  | "bookOpen"
  | "megaphone"
  | "doorOpen"
  | "fileCheck"
  | "heart"
  | "chat"
  | "examPaper"
  | "clock"
  | "folder"
  | "busAlert"
  | "wand"
  | "bell"
  | "bus"
  | "wallet"
  | "trophy"
  | "tree"
  | "target"
  | "chart"
  | "grade"
  | "steering"
  | "generic";

const paths: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.4" />
      <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.4" />
      <rect x="13.5" y="10" width="7.5" height="11" rx="1.4" />
      <rect x="3" y="13" width="7.5" height="8" rx="1.4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 3l1.4 4.2L16.6 8.6 12.4 10 11 14.2 9.6 10 5.4 8.6 9.6 7.2 11 3z" />
      <path d="M18 13l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3z" />
    </>
  ),
  pulse: (
    <path d="M2 12h4.2l2-6 3.6 13 2.4-9.5 1.6 2.5H22" />
  ),
  notes: (
    <>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M16 3v3h3" />
      <path d="M8 11h8M8 14.5h8M8 18h5" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4.2" rx="1" />
      <path d="M4.5 8.2V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V8.2" />
      <path d="M9.5 12.5h5" />
    </>
  ),
  flag: (
    <>
      <path d="M5 3v18" />
      <path d="M5 4.2h13l-2.6 3.6L18 11.4H5" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 12.5h5l1.8 3h4.4l1.8-3h5" />
      <path d="M5.2 5h13.6L21 12.5v6a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 18.5v-6L5.2 5z" />
    </>
  ),
  users: (
    <>
      <circle cx="8.5" cy="8" r="3" />
      <path d="M2.8 20c.6-3.4 3-5.4 5.7-5.4S14 16.6 14.6 20" />
      <circle cx="17" cy="8.6" r="2.4" />
      <path d="M15.6 14.8c2.2.2 4 1.9 4.5 5.2" />
    </>
  ),
  calendarCheck: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="1.6" />
      <path d="M3 9.5h18" />
      <path d="M7.5 3v3M16.5 3v3" />
      <path d="M8 14.2l2.2 2.2L16 11" />
    </>
  ),
  bookOpen: (
    <>
      <path d="M12 6.2c-1.8-1.4-4.3-2-7.5-2v13.6c3.2 0 5.7.6 7.5 2 1.8-1.4 4.3-2 7.5-2V4.2c-3.2 0-5.7.6-7.5 2z" />
      <path d="M12 6.2v13.6" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 10v4a1.4 1.4 0 0 0 1.4 1.4H6l1.4 4.4h2.2L8 15.4h1.4L20 19V5L9.4 8.6H4.4A1.4 1.4 0 0 0 3 10z" />
    </>
  ),
  doorOpen: (
    <>
      <path d="M13 3.5 20 5v15l-7 1.5z" />
      <path d="M13 3.5v18M4 20.5h9" />
      <circle cx="16.6" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  fileCheck: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 14l2 2 4-4.4" />
    </>
  ),
  heart: (
    <path d="M12 20.2s-7.6-4.6-9.8-9C.6 7.6 3 4 6.6 4c2 0 3.6 1 5.4 3 1.8-2 3.4-3 5.4-3 3.6 0 6 3.6 4.4 7.2-2.2 4.4-9.8 9-9.8 9z" />
  ),
  chat: (
    <path d="M4 4.5h16v11.5H9.2L5 20v-4H4z" />
  ),
  examPaper: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 12.5l1.6 1.6L14.5 10" />
      <path d="M9 17h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.4l3.6 2" />
    </>
  ),
  folder: (
    <path d="M3 6.2h6.4L11 8.4h9.6a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.2a1 1 0 0 1 1-1z" />
  ),
  busAlert: (
    <>
      <rect x="3" y="6" width="14" height="10.4" rx="1.6" />
      <circle cx="7" cy="18.6" r="1.4" />
      <circle cx="13" cy="18.6" r="1.4" />
      <path d="M3 11h14" />
      <path d="M20 8v4.6" />
      <circle cx="20" cy="15.4" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  wand: (
    <>
      <path d="M4 20 15.5 8.5" />
      <path d="M14 3l.9 2.1L17 6l-2.1.9L14 9l-.9-2.1L11 6l2.1-.9L14 3z" />
      <path d="M19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6L19 12z" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V10a6 6 0 0 1 12 0v6l1.6 2.4H4.4z" />
      <path d="M9.6 20.8a2.4 2.4 0 0 0 4.8 0" />
    </>
  ),
  bus: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
      <path d="M3 12h18" />
      <path d="M6.5 16.5v2.2M17.5 16.5v2.2" />
      <circle cx="7.2" cy="20" r="1.1" />
      <circle cx="16.8" cy="20" r="1.1" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7.2A1.6 1.6 0 0 1 4.6 5.6h13.8A1.6 1.6 0 0 1 20 7.2V18a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 18z" />
      <path d="M14.5 12.6h4.5v3.4h-4.5a1.7 1.7 0 0 1 0-3.4z" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 5.5H4a3 3 0 0 0 3.8 2.9M17 5.5h3a3 3 0 0 1-3.8 2.9" />
      <path d="M12 14v3M8.5 20.5h7l-.8-2.6a5.6 5.6 0 0 0-5.4 0z" />
    </>
  ),
  tree: (
    <>
      <path d="M12 2.5 6.5 10h2.3L4.5 15.5h4.9V21h5.2v-5.5h4.9L15.2 10h2.3z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  chart: (
    <path d="M4 20V4M4 20h16M8 16v-4.5M12.5 16V8M17 16v-7" />
  ),
  grade: (
    <>
      <path d="M12 3l2.4 5 5.4.6-4 3.8 1 5.4L12 15l-4.8 2.8 1-5.4-4-3.8 5.4-.6z" />
    </>
  ),
  steering: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.1" />
      <path d="M12 5.5v4.4M6.2 15.6l3.9-2.3M17.8 15.6l-3.9-2.3" />
    </>
  ),
  generic: <rect x="4" y="4" width="16" height="16" rx="3" />,
};

export function Icon({
  name,
  className = "w-[18px] h-[18px]",
  strokeWidth = 1.6,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name] ?? paths.generic}
    </svg>
  );
}

export function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
      <path
        d="M4 6.5h16"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        style={{ transition: "transform 0.2s ease", transformOrigin: "center", transform: open ? "translateY(0) rotate(0deg)" : "none" }}
      />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity={open ? 0 : 1} style={{ transition: "opacity 0.15s ease" }} />
      <path d="M4 17.5h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-[18px] h-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden="true">
      <path d="M20 13.4A8.4 8.4 0 1 1 10.6 4a6.6 6.6 0 0 0 9.4 9.4z" />
    </svg>
  );
}

export function ChevronIcon({ direction = "right" }: { direction?: "right" | "left" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d={direction === "right" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} />
    </svg>
  );
}

export function LogOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]" aria-hidden="true">
      <path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9" />
      <path d="M14 15.5 18.5 12 14 8.5" />
      <path d="M18.3 12H9" />
    </svg>
  );
}
