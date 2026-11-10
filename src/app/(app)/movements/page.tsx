import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { StatBand } from "@/components/StatBand";
import { DataTable } from "@/components/DataTable";
import { MovementForm } from "@/components/MovementForm";
import { formatDateTime, formatNumber } from "@/lib/format";

const PAGE_SIZE = 15;

type SearchParams = {
  type?: string;
  item?: string;
  location?: string;
  page?: string;
  new?: string;
};

const TYPE_LABEL: Record<string, string> = {
  MASUK: "Masuk",
  KELUAR: "Keluar",
  TRANSFER: "Transfer",
  PENYESUAIAN: "Penyesuaian",
};

export default async function MovementsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("movements.view");
  const canCreate = hasPermission(user, "movements.create");
  const type = searchParams.type || "";
  const itemId = searchParams.item || "";
  const locationId = searchParams.location || "";
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);

  const [items, locations] = await Promise.all([
    prisma.item.findMany({ orderBy: { name: "asc" }, select: { id: true, sku: true, name: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const where = {
    ...(type ? { type: type as "MASUK" | "KELUAR" | "TRANSFER" | "PENYESUAIAN" } : {}),
    ...(itemId ? { itemId } : {}),
    ...(locationId
      ? { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] }
      : {}),
  };

  const [total, movements, aggregates] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      include: { item: true, createdBy: true, fromLocation: true, toLocation: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.stockMovement.findMany({ where, select: { type: true, quantity: true } }),
  ]);

  const masuk = aggregates.filter((m) => m.type === "MASUK").reduce((s, m) => s + m.quantity, 0);
  const keluar = aggregates.filter((m) => m.type === "KELUAR").reduce((s, m) => s + Math.abs(m.quantity), 0);
  const transfer = aggregates.filter((m) => m.type === "TRANSFER").reduce((s, m) => s + m.quantity, 0);
  const penyesuaian = aggregates.filter((m) => m.type === "PENYESUAIAN").reduce((s, m) => s + m.quantity, 0);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterHref = (patch: Partial<SearchParams>) => {
    const params = new URLSearchParams({
      ...(type ? { type } : {}),
      ...(itemId ? { item: itemId } : {}),
      ...(locationId ? { location: locationId } : {}),
      ...patch,
    });
    return `/movements?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Pergerakan Stok</h1>
          <p className="text-sm text-muted">
            Stok masuk, keluar, transfer antar lokasi, dan penyesuaian — setiap transaksi
            memperbarui saldo dan tercatat permanen di riwayat.
          </p>
        </div>
        {canCreate && (
          <Link href="/movements?new=1" className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
            + Catat Transaksi
          </Link>
        )}
      </div>

      {searchParams.new === "1" && canCreate && (
        <MovementForm
          items={items.map((i) => ({ id: i.id, label: `${i.name} (${i.sku})` }))}
          locations={locations.map((l) => ({ id: l.id, label: l.name }))}
        />
      )}

      <StatBand
        stats={[
          { label: "Total Transaksi", value: formatNumber(total), sub: "sesuai filter" },
          { label: "Unit Masuk", value: `+${formatNumber(masuk)}`, sub: "stok masuk tercatat" },
          { label: "Unit Keluar", value: `−${formatNumber(keluar)}`, sub: "stok keluar tercatat" },
          { label: "Unit Ditransfer", value: formatNumber(transfer), sub: "antar lokasi" },
          { label: "Penyesuaian Neto", value: penyesuaian > 0 ? `+${penyesuaian}` : String(penyesuaian), sub: "selisih penyesuaian" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">Riwayat Transaksi</h2>
          <form method="get" className="mb-3 flex flex-wrap gap-2">
            <select name="type" defaultValue={type} aria-label="Filter jenis" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
              <option value="">Semua Jenis</option>
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select name="item" defaultValue={itemId} aria-label="Filter item" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
              <option value="">Semua Item</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <select name="location" defaultValue={locationId} aria-label="Filter lokasi" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
              <option value="">Semua Lokasi</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="submit" className="rounded-md border border-line bg-white px-4 py-2 text-sm hover:border-accent">Filter</button>
            <Link href="/movements" className="rounded-md border border-line bg-white px-4 py-2 text-sm hover:border-accent">Atur Ulang</Link>
          </form>
          <DataTable
            columns={[
              { key: "code", header: "Transaksi", render: (m) => <span className="font-medium">{m.code}<span className="block text-xs font-normal text-muted">{formatDateTime(m.createdAt)}</span></span> },
              { key: "item", header: "Item", render: (m) => <span>{m.item.name}<span className="block text-xs text-muted">{m.item.sku}</span></span> },
              { key: "type", header: "Jenis", render: (m) => <span className="rounded-md bg-canvas px-2 py-0.5 text-xs">{TYPE_LABEL[m.type]}</span> },
              {
                key: "qty", header: "Jumlah", align: "right",
                render: (m) => <span className={m.quantity > 0 ? "text-accent" : "text-danger"}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity} {m.item.unit}</span>,
              },
              {
                key: "route", header: "Rute Lokasi",
                render: (m) => (
                  <span className="text-xs">
                    {m.type === "TRANSFER"
                      ? `${m.fromLocation?.name ?? "—"} → ${m.toLocation?.name ?? "—"}`
                      : m.type === "KELUAR" ? m.fromLocation?.name ?? "—" : `→ ${m.toLocation?.name ?? "—"}`}
                    {m.note && <span className="block text-muted">{m.note}</span>}
                  </span>
                ),
              },
              { key: "by", header: "Dibuat oleh", render: (m) => m.createdBy.name },
            ]}
            rows={movements}
            emptyText="Belum ada transaksi."
          />
          <div className="mt-3 flex items-center justify-between text-sm text-muted">
            <span>Halaman {page} dari {pages} · {total} transaksi</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={filterHref({ page: String(page - 1) })} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-accent">← Sebelumnya</Link>}
              {page < pages && <Link href={filterHref({ page: String(page + 1) })} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-accent">Berikutnya →</Link>}
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Saldo Stok per Lokasi</h2>
          <BalanceTable locationId={locationId} />
        </section>
      </div>
    </div>
  );
}

async function BalanceTable({ locationId }: { locationId: string }) {
  const balances = await prisma.stockBalance.findMany({
    where: { ...(locationId ? { locationId } : {}), quantity: { gt: 0 } },
    include: { item: true, location: true },
    orderBy: [{ location: { name: "asc" } }, { item: { name: "asc" } }],
    take: 50,
  });
  return (
    <DataTable
      columns={[
        { key: "item", header: "Item", render: (b) => <span>{b.item.name}<span className="block text-xs text-muted">{b.item.sku}</span></span> },
        { key: "loc", header: "Lokasi", render: (b) => b.location.name },
        { key: "qty", header: "Saldo", align: "right", render: (b) => <strong>{b.quantity} {b.item.unit}</strong> },
      ]}
      rows={balances}
      emptyText="Belum ada saldo di lokasi ini."
    />
  );
}
