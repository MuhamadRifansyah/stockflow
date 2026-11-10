export type Stat = {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn" | "danger";
};

/** KPI hairline band — no bordered cards, per the design tokens. */
export function StatBand({ stats }: { stats: Stat[] }) {
  return (
    <div className="stat-band">
      {stats.map((s) => (
        <div key={s.label} className="px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{s.label}</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              s.tone === "warn" ? "text-amber" : s.tone === "danger" ? "text-danger" : ""
            }`}
          >
            {s.value}
          </p>
          {s.sub && <p className="mt-0.5 text-xs text-muted">{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}
