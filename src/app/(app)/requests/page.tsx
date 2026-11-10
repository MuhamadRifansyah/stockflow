import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { StatusDot, requestStatusTone } from "@/components/StatusDot";
import { RequestForm } from "@/components/RequestForm";
import { startProcessing, completeRequest } from "@/lib/actions/requests";
import { formatDateTime } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  MENUNGGU: "Menunggu",
  DISETUJUI: "Disetujui",
  DITOLAK: "Ditolak",
  DIPROSES: "Diproses",
  SELESAI: "Selesai",
};

type SearchParams = { status?: string; new?: string };

export default async function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("requests.view");
  const canCreate = hasPermission(user, "requests.create");
  const canProcess = hasPermission(user, "requests.process");
  const status = searchParams.status || "";

  const [requests, items, locations] = await Promise.all([
    prisma.stockRequest.findMany({
      where: status ? { status: status as "MENUNGGU" | "DISETUJUI" | "DITOLAK" | "DIPROSES" | "SELESAI" } : {},
      include: { requester: true, items: { include: { item: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.item.findMany({ orderBy: { name: "asc" }, select: { id: true, sku: true, name: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const counts = {
    semua: await prisma.stockRequest.count(),
    menunggu: await prisma.stockRequest.count({ where: { status: "MENUNGGU" } }),
    disetujui: await prisma.stockRequest.count({ where: { status: "DISETUJUI" } }),
    diproses: await prisma.stockRequest.count({ where: { status: "DIPROSES" } }),
    selesai: await prisma.stockRequest.count({ where: { status: "SELESAI" } }),
    ditolak: await prisma.stockRequest.count({ where: { status: "DITOLAK" } }),
  };

  const tabs = [
    { key: "", label: `Semua · ${counts.semua}` },
    { key: "MENUNGGU", label: `Menunggu · ${counts.menunggu}` },
    { key: "DISETUJUI", label: `Disetujui · ${counts.disetujui}` },
    { key: "DIPROSES", label: `Diproses · ${counts.diproses}` },
    { key: "SELESAI", label: `Selesai · ${counts.selesai}` },
    { key: "DITOLAK", label: `Ditolak · ${counts.ditolak}` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Permintaan Stok</h1>
          <p className="text-sm text-muted">
            Seluruh permintaan stok: pengajuan, persetujuan, pemrosesan gudang, dan penyelesaian.
          </p>
        </div>
        {canCreate && (
          <Link href="/requests?new=1" className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
            + Buat Permintaan
          </Link>
        )}
      </div>

      {searchParams.new === "1" && canCreate && (
        <RequestForm items={items.map((i) => ({ id: i.id, label: `${i.name} (${i.sku})` }))} />
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/requests?status=${t.key}` : "/requests"}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              status === t.key ? "border-accent bg-accent/10 font-medium text-accent" : "border-line bg-white hover:border-accent"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <DataTable
        columns={[
          { key: "code", header: "Kode", render: (r) => <span className="font-medium">{r.code}</span> },
          { key: "requester", header: "Peminta", render: (r) => r.requester.name },
          {
            key: "purpose", header: "Tujuan",
            render: (r) => <span title={r.purpose}>{r.purpose.length > 40 ? `${r.purpose.slice(0, 40)}…` : r.purpose}</span>,
          },
          {
            key: "items", header: "Item", align: "right",
            render: (r) => `${r.items.length} jenis · ${r.items.reduce((s, i) => s + i.quantity, 0)} unit`,
          },
          { key: "created", header: "Dibuat", render: (r) => formatDateTime(r.createdAt) },
          {
            key: "status", header: "Status",
            render: (r) => <StatusDot tone={requestStatusTone(r.status)}>{STATUS_LABEL[r.status]}</StatusDot>,
          },
          {
            key: "actions", header: "Aksi", align: "right",
            render: (r) => {
              if (canProcess && r.status === "DISETUJUI") {
                return (
                  <form action={async (fd) => { await startProcessing(r.id, fd); }} className="flex items-center justify-end gap-2">
                    <select name="sourceLocationId" required aria-label="Lokasi sumber" className="rounded-md border border-line px-2 py-1.5 text-sm">
                      <option value="">Pilih lokasi sumber…</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark">
                      Proses
                    </button>
                  </form>
                );
              }
              if (canProcess && r.status === "DIPROSES") {
                return (
                  <form action={async () => { await completeRequest(r.id); }}>
                    <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark">
                      Selesaikan
                    </button>
                  </form>
                );
              }
              return <span className="text-muted">—</span>;
            },
          },
        ]}
        rows={requests}
        emptyText="Belum ada permintaan stok."
      />
      <p className="text-xs text-muted">
        Penyelesaian mem-posting pergerakan keluar asli per baris dari lokasi sumber — stok yang
        tidak mencukupi membatalkan seluruh penyelesaian.
      </p>
    </div>
  );
}
