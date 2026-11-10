import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { DataTable } from "@/components/DataTable";
import { StatusDot, requestStatusTone } from "@/components/StatusDot";
import { ApprovalDialog } from "@/app/(app)/approvals/ApprovalDialog";
import { formatDateTime } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  MENUNGGU: "Menunggu",
  DISETUJUI: "Disetujui",
  DITOLAK: "Ditolak",
  DIPROSES: "Diproses",
  SELESAI: "Selesai",
};

type SearchParams = { status?: string };

export default async function ApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("requests.approve");
  void user;
  const status = searchParams.status || "MENUNGGU";

  const requests = await prisma.stockRequest.findMany({
    where: status ? { status: status as "MENUNGGU" | "DISETUJUI" | "DITOLAK" | "DIPROSES" | "SELESAI" } : {},
    include: {
      requester: true,
      items: { include: { item: { include: { balances: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

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
          <h1 className="text-[22px] font-semibold">Persetujuan Permintaan</h1>
          <p className="text-sm text-muted">
            Permintaan yang menunggu keputusan manajer, beserta riwayat keputusannya.
          </p>
        </div>
        <Link href="/requests?new=1" className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
          + Buat Permintaan
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/approvals?status=${t.key}` : "/approvals"}
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
            render: (r) =>
              r.status === "MENUNGGU" ? (
                <ApprovalDialog
                  requestId={r.id}
                  code={r.code}
                  requester={r.requester.name}
                  purpose={r.purpose}
                  createdAt={formatDateTime(r.createdAt)}
                  items={r.items.map((i) => ({
                    name: i.item.name,
                    sku: i.item.sku,
                    qty: i.quantity,
                    stock: i.item.balances.reduce((s, b) => s + b.quantity, 0),
                    unit: i.item.unit,
                  }))}
                />
              ) : (
                <span className="text-muted">—</span>
              ),
          },
        ]}
        rows={requests}
        emptyText="Tidak ada permintaan pada filter ini."
      />
    </div>
  );
}
