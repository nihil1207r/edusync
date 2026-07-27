export interface Tab {
  id: string;
  label: string;
}

export function TabNav({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-1 mb-6 border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === tab.id
              ? "border-accent text-ink"
              : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
