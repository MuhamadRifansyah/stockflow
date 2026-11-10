import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { StatBand } from "@/components/StatBand";
import { DataTable } from "@/components/DataTable";
import { StatusDot, itemStatusTone } from "@/components/StatusDot";
import { formatDateLong, formatIDRCompact, formatNumber, timeAgo } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  void user;

  const [items, balances, movements, assets, locations, requests] = await Promise.all([
    prisma.item.findMany({ include: { balances: true, category: true } }),
    prisma.stockBalance.findMany(),
    prisma.stockMovement.findMany({
      include: { item: true, createdBy: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.asset.findMany(),
    prisma.location.findMany(),
    prisma.stockRequest.findMany({ where: { status: "MENUNGGU" } }),
  ]);

  const totalQty = balances.reduce((s, b) => s + b.quantity, 0);
  const inventoryValue = items.reduce(
    (s, it) => s + it.price * it.balances.reduce((q, b) => q + b.quantity, 0),
    0,
  );
  const assetValue = assets.reduce((s, a) => s + a.purchasePrice, 0);
  const withQty = items.map((it) => ({
    ...it,
    totalQty: it.balances.reduce((q, b) => q + b.quantity, 0),
  }));
  const lowStock = withQty.filter((it) => it.totalQty <= it.minStock);
  const activeAssets = assets.filter((a) => a.status === "AKTIF" || a.status === "DIPINJAMKAN").length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthMovements = await prisma.stockMovement.count({
    where: { createdAt: { gte: monthStart } },
  });

  // 6-month trend (in/out units per month) — rendered as CSS bars.
  const trend: { label: string; masuk: number; keluar: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const rows = await prisma.stockMovement.findMany({
      where: { createdAt: { gte: d, lt: next } },
      select: { type: true, quantity: true },
    });
    trend.push({
      label: d.toLocaleDateString("id-ID", { month: "short" }),
      masuk: rows.filter((r) => r.type === "MASUK").reduce((s, r) => s + r.quantity, 0),
      keluar: rows.filter((r) => r.type === "KELUAR").reduce((s, r) => s + Math.abs(r.quantity), 0),
    });
  }
  const maxTrend = Math.max(1, ...trend.flatMap((t) => [t.masuk, t.keluar]));

  const byCategory = items.reduce<Record<string, { qty: number; value: number }>>((acc, it) => {
    const qty = it.balances.reduce((q, b) => q + b.quantity, 0);
    const prev = acc[it.category.name] ?? { qty: 0, value: 0 };
    acc[it.category.name] = { qty: prev.qty + qty, value: prev.value + it.price * qty };
    return acc;
  }, {});
  const categoryRows = Object.entries(byCategory)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty);
  const maxCatQty = Math.max(1, ...categoryRows.map((c) => c.qty));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">
          {formatDateLong(now)} · {locations.length} lokasi aktif
        </p>
      </div>

      <StatBand
        stats={[
          { label: "Total item tersedia", value: formatNumber(totalQty), sub: `${items.length} SKU terdaftar` },
          { label: "Nilai inventaris", value: formatIDRCompact(inventoryValue), sub: `Nilai aset ${formatIDRCompact(assetValue)}` },
          { label: "Stok menipis", value: String(lowStock.length), sub: `${withQty.filter((i) => i.totalQty <= 0).length} item habis total`, tone: lowStock.length > 0 ? "warn" : "default" },
          { label: "Aset aktif", value: String(activeAssets), sub: `dari ${assets.length} aset terdaftar` },
          { label: "Pergerakan bulan ini", value: String(monthMovements), sub: "transaksi tercatat" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="rounded-md border border-line bg-white p-5 lg:col-span-3">
          <h2 className="font-semibold">Tren Pergerakan Stok</h2>
          <p className="text-sm text-muted">Unit masuk dan keluar per bulan, 6 bulan terakhir</p>
          <div className="mt-6 space-y-4">
            {trend.map((t) => (
              <div key={t.label}>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>{t.label}</span>
                  <span>Masuk {t.masuk} · Keluar {t.keluar}</span>
                </div>
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-canvas">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${(t.masuk / maxTrend) * 100}%` }} />
                  </div>
                  <div className="h-2 rounded-full bg-canvas">
                    <div className="h-2 rounded-full bg-amber" style={{ width: `${(t.keluar / maxTrend) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold">Distribusi per Kategori</h2>
          <p className="text-sm text-muted">Unit tersedia per kategori, terbesar lebih dulu</p>
          <div className="mt-6 space-y-4">
            {categoryRows.map((c) => (
              <div key={c.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="text-muted">{formatIDRCompact(c.value)} · <strong className="text-ink">{c.qty}</strong></span>
                </div>
                <div className="h-2 rounded-full bg-canvas">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${(c.qty / maxCatQty) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Perlu Perhatian</h2>
            <Link href="/items" className="text-sm text-accent hover:underline">Lihat semua item</Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Semua item di atas stok minimum.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {lowStock.map((it) => (
                <li key={it.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/items/${it.id}`} className="font-medium hover:underline">
                    {it.name}
                    <span className="block text-xs font-normal text-muted">{it.sku}</span>
                  </Link>
                  <StatusDot tone={itemStatusTone(it.totalQty, it.minStock)}>
                    {it.totalQty <= 0 ? "Habis" : `Menipis · ${it.totalQty} ${it.unit}`}
                  </StatusDot>
                </li>
              ))}
            </ul>
          )}
          {requests.length > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-sm">
              <Link href="/approvals" className="text-accent hover:underline">
                {requests.length} permintaan menunggu persetujuan
              </Link>
            </p>
          )}
        </section>

        <section className="rounded-md border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Pergerakan Terbaru</h2>
            <Link href="/movements" className="text-sm text-accent hover:underline">Lihat riwayat</Link>
          </div>
          <DataTable
            columns={[
              { key: "code", header: "Transaksi", render: (m) => <span className="font-medium">{m.code}</span> },
              { key: "item", header: "Item", render: (m) => m.item.name },
              {
                key: "qty", header: "Jumlah", align: "right",
                render: (m) => (
                  <span className={m.quantity > 0 ? "text-accent" : "text-danger"}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </span>
                ),
              },
              { key: "by", header: "Dibuat oleh", render: (m) => m.createdBy.name },
              { key: "when", header: "Waktu", render: (m) => timeAgo(m.createdAt) },
            ]}
            rows={movements}
            emptyText="Belum ada pergerakan."
          />
        </section>
      </div>
    </div>
  );
}
