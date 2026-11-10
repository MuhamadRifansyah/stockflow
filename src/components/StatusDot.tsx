const TONES = {
  green: "bg-accent",
  amber: "bg-amber",
  red: "bg-danger",
  gray: "bg-muted",
  black: "bg-ink",
} as const;

export type StatusTone = keyof typeof TONES;

/** Dot + word, palette colors only — no off-palette blues/purples. */
export function StatusDot({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-2 w-2 rounded-full ${TONES[tone]}`} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/** Map domain statuses to dot tones. */
export function itemStatusTone(totalQty: number, minStock: number): StatusTone {
  if (totalQty <= 0) return "red";
  if (totalQty <= minStock) return "amber";
  return "green";
}

export function requestStatusTone(status: string): StatusTone {
  switch (status) {
    case "MENUNGGU":
      return "amber";
    case "DISETUJUI":
      return "green";
    case "DITOLAK":
      return "red";
    case "DIPROSES":
      return "black";
    case "SELESAI":
      return "green";
    default:
      return "gray";
  }
}

export function assetStatusTone(status: string): StatusTone {
  switch (status) {
    case "AKTIF":
      return "green";
    case "DIPINJAMKAN":
      return "black";
    case "PERAWATAN":
      return "amber";
    case "RUSAK":
      return "red";
    default:
      return "gray";
  }
}
