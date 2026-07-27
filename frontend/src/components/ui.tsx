export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-paper-raised border border-line rounded-lg p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-lg text-ink mb-3">{children}</h2>
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
    accent: "text-accent-ink",
  };
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-ink-soft mb-1">{label}</p>
      <p className={`font-serif text-3xl ${toneColor[tone]}`}>{value}</p>
    </Card>
  );
}

export function Stamp({ grade }: { grade: string }) {
  const color = grade.startsWith("A")
    ? "text-leaf"
    : grade.startsWith("B")
      ? "text-accent-ink"
      : "text-brick";
  return <span className={`stamp ${color}`}>{grade}</span>;
}

export function Pill({
  children,
  tone = "ink",
}: {
  children: React.ReactNode;
  tone?: "ink" | "leaf" | "brick" | "accent";
}) {
  const toneClass: Record<string, string> = {
    ink: "bg-ink/10 text-ink",
    leaf: "bg-leaf/15 text-leaf",
    brick: "bg-brick/15 text-brick",
    accent: "bg-accent/20 text-accent-ink",
  };
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${toneClass[tone]}`}>
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
    primary: "bg-ink text-paper hover:bg-ink/90",
    secondary: "border border-line text-ink hover:bg-paper",
    danger: "bg-brick text-paper hover:bg-brick/90",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`text-sm px-4 py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]}`}
    >
      {children}
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
  return (
    <div className="mb-6 rounded-lg border border-accent/40 bg-accent/10 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-accent-ink mb-1">{eyebrow}</p>
        <p className="font-serif text-lg text-ink">{title}</p>
        <p className="text-sm text-ink-soft mt-1">{description}</p>
      </div>
      <button
        onClick={onClick}
        className="shrink-0 text-sm px-4 py-2 rounded bg-ink text-paper hover:bg-ink/90 transition-colors"
      >
        {ctaLabel} →
      </button>
    </div>
  );
}

export function LoadingState() {
  return <p className="text-ink-soft text-sm py-12 text-center">Loading…</p>;
}

export function ErrorState({ message }: { message: string }) {
  return <p className="text-brick text-sm py-12 text-center">{message}</p>;
}
