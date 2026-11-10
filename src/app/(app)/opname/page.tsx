import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { StatusDot } from "@/components/StatusDot";
import { OpnameForm } from "@/components/OpnameForm";
import { createOpnameSession, submitOpname, decideOpname } from "@/lib/actions/opname";
import { formatDateTime } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  BERLANGSUNG: "Berlangsung",
  DIAJUKAN: "Diajukan",
  DISETUJUI: "Disetujui",
  DITOLAK: "Ditolak",
};
const STATUS_TONE: Record<string, "green" | "amber" | "red" | "gray" | "black"> = {
  BERLANGSUNG: "black",
  DIAJUKAN: "amber",
  DISETUJUI: "green",
  DITOLAK: "red",
};

type SearchParams = { session?: string };

export default async function OpnamePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("opname.view");
  const canManage = hasPermission(user, "opname.manage");
  const canApprove = hasPermission(user, "opname.approve");

  const [sessions, locations] = await Promise.all([
    prisma.stockOpname.findMany({
      include: { location: true, createdBy: true, details: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  const active = searchParams.session
    ? sessions.find((s) => s.id === searchParams.session) ?? null
    : null;

  const activeDetail = active
    ? await prisma.stockOpname.findUnique({
        where: { id: active.id },
        include: {
          location: true,
          details: { include: { item: true }, orderBy: { item: { name: "asc" } } },
        },
      })
    : null;

  const counts = {
    semua: sessions.length,
    berlangsung: sessions.filter((s) => s.status === "BERLANGSUNG").length,
    diajukan: sessions.filter((s) => s.status === "DIAJUKAN").length,
    disetujui: sessions.filter((s) => s.status === "DISETUJUI").length,
    ditolak: sessions.filter((s) => s.status === "DITOLAK").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Stok Opname</h1>
          <p className="text-sm text-muted">
            Hitung fisik stok per lokasi, bandingkan dengan stok sistem, dan terapkan penyesuaian
            hanya setelah disetujui manajer.
          </p>
        </div>
        {canManage && (
          <details className="shrink-0 rounded-md border border-line bg-white">
            <summary className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
              + Buat Sesi Opname
            </summary>
            <form action={createOpnameSession} className="w-80 space-y-3 border-t border-line p-4">
              <div>
                <label htmlFor="locationId" className="block text-sm font-medium mb-1">Lokasi / Gudang</label>
                <select id="locationId" name="locationId" required className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Pilih lokasi…</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted">
                  Sistem mengambil snapshot saldo semua item di lokasi ini sebagai stok sistem.
                  Satu lokasi hanya boleh memiliki satu sesi aktif.
                </p>
              </div>
              <input name="note" placeholder="Catatan, mis. opname rutin akhir bulan" aria-label="Catatan" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <button type="submit" className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                Buat Sesi
              </button>
            </form>
          </details>
        )}
      </div>

      <p className="text-sm text-muted">
        Semua · <strong className="text-ink">{counts.semua}</strong> · Berlangsung{" "}
        <strong className="text-ink">{counts.berlangsung}</strong> · Diajukan{" "}
        <strong className="text-ink">{counts.diajukan}</strong> · Disetujui{" "}
        <strong className="text-ink">{counts.disetujui}</strong> · Ditolak{" "}
        <strong className="text-ink">{counts.ditolak}</strong>
      </p>

      {activeDetail && (
        <section className="space-y-4 rounded-md border border-line bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                Sesi Opname — {activeDetail.location.name}
              </h2>
              <p className="text-sm text-muted">
                Dibuat {formatDateTime(activeDetail.createdAt)} · Status: {STATUS_LABEL[activeDetail.status]}
                {activeDetail.note ? ` · ${activeDetail.note}` : ""}
              </p>
            </div>
            <Link href="/opname" className="text-sm text-accent hover:underline">Tutup detail</Link>
          </div>

          {activeDetail.status === "BERLANGSUNG" && canManage && (
            <OpnameForm
              details={activeDetail.details.map((d) => ({
                id: d.id,
                itemName: d.item.name,
                sku: d.item.sku,
                systemQty: d.systemQty,
                physicalQty: d.physicalQty,
                difference: d.difference,
              }))}
            />
          )}
          {activeDetail.status !== "BERLANGSUNG" && (
            <DataTable
              columns={[
                { key: "item", header: "Item", render: (d) => <span>{d.item.name}<span className="block text-xs text-muted">{d.item.sku}</span></span> },
                { key: "system", header: "Stok Sistem", align: "right", render: (d) => String(d.systemQty) },
                { key: "physical", header: "Hitung Fisik", align: "right", render: (d) => (d.physicalQty ?? "—").toString() },
                {
                  key: "diff", header: "Selisih", align: "right",
                  render: (d) => <span className={d.difference === 0 ? "" : d.difference > 0 ? "text-accent" : "text-danger"}>{d.difference > 0 ? `+${d.difference}` : d.difference}</span>,
                },
              ]}
              rows={activeDetail.details}
              emptyText="Tidak ada item dalam sesi ini."
            />
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {activeDetail.status === "BERLANGSUNG" && canManage && (
              <form action={submitOpname.bind(null, activeDetail.id)}>
                <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                  Ajukan untuk Persetujuan
                </button>
              </form>
            )}
            {activeDetail.status === "DIAJUKAN" && canApprove && (
              <>
                <form action={decideOpname.bind(null, activeDetail.id, "approve", undefined)}>
                  <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                    ✓ Setujui &amp; Terapkan Penyesuaian
                  </button>
                </form>
                <form action={decideOpname.bind(null, activeDetail.id, "reject", undefined)}>
                  <button type="submit" className="rounded-md border border-danger/40 px-4 py-2 text-sm text-danger hover:bg-red-50">
                    ✕ Tolak (kembalikan untuk hitung ulang)
                  </button>
                </form>
              </>
            )}
            {activeDetail.status === "DIAJUKAN" && !canApprove && (
              <p className="text-sm text-muted">Menunggu keputusan manajer.</p>
            )}
          </div>
        </section>
      )}

      <DataTable
        columns={[
          { key: "location", header: "Lokasi", render: (s) => <span className="font-medium">{s.location.name}</span> },
          { key: "created", header: "Dibuat", render: (s) => formatDateTime(s.createdAt) },
          { key: "by", header: "Dibuat oleh", render: (s) => s.createdBy.name },
          { key: "items", header: "Item", align: "right", render: (s) => String(s.details.length) },
          {
            key: "diff", header: "Selisih", align: "right",
            render: (s) => {
              const total = s.details.reduce((sum, d) => sum + Math.abs(d.difference), 0);
              return <span className={total > 0 ? "text-amber" : ""}>{total} unit</span>;
            },
          },
          { key: "status", header: "Status", render: (s) => <StatusDot tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</StatusDot> },
          {
            key: "actions", header: "Aksi", align: "right",
            render: (s) => <Link href={`/opname?session=${s.id}`} className="text-sm text-accent hover:underline">Detail</Link>,
          },
        ]}
        rows={sessions}
        emptyText="Belum ada sesi opname."
      />
    </div>
  );
}
