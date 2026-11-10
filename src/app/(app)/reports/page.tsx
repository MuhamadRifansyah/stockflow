import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { StatBand } from "@/components/StatBand";
import { DataTable } from "@/components/DataTable";
import { getReports, exportReportExcel, exportReportPdf, type ReportKind } from "@/lib/actions/reports";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/format";

const REPORTS: { kind: ReportKind; label: string; description: string }[] = [
  { kind: "inventaris", label: "Inventaris Saat Ini", description: "Stok, harga, dan nilai per item." },
  { kind: "stok-menipis", label: "Stok Menipis", description: "Item pada atau di bawah stok minimum." },
  { kind: "pergerakan", label: "Pergerakan Stok", description: "Riwayat transaksi masuk/keluar/transfer." },
  { kind: "aset", label: "Registri Aset", description: "Seluruh aset beserta nilai dan status." },
  { kind: "penugasan-aset", label: "Penugasan Aset", description: "Siapa meminjam apa, dan kapan kembali." },
  { kind: "valuasi", label: "Valuasi Inventaris", description: "Nilai persediaan per kategori." },
  { kind: "selisih-opname", label: "Selisih Opname", description: "Perbedaan hitung fisik vs stok sistem." },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { report?: string; from?: string; to?: string; category?: string; location?: string };
}) {
  const user = await requirePermission("reports.view");
  const canExport = hasPermission(user, "reports.export");
  const kind = (searchParams.report as ReportKind) || "inventaris";

  const [data, categories, locations] = await Promise.all([
    getReports({
      from: searchParams.from ? new Date(searchParams.from) : undefined,
      to: searchParams.to ? new Date(searchParams.to) : undefined,
      categoryId: searchParams.category || undefined,
      locationId: searchParams.location || undefined,
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  const filterQuery = new URLSearchParams({
    ...(searchParams.from ? { from: searchParams.from } : {}),
    ...(searchParams.to ? { to: searchParams.to } : {}),
    ...(searchParams.category ? { category: searchParams.category } : {}),
    ...(searchParams.location ? { location: searchParams.location } : {}),
  }).toString();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold">Laporan &amp; Analitik</h1>
        <p className="text-sm text-muted">
          Laporan dihitung langsung dari data tersimpan. Ekspor Excel dan PDF memerlukan izin
          ekspor dan tercatat di log audit.
        </p>
      </div>

      <StatBand
        stats={[
          { label: "Nilai Inventaris", value: formatIDRCompact(data.valuation.inventoryValue) },
          { label: "Nilai Aset", value: formatIDRCompact(data.valuation.assetValue) },
          { label: "Stok Menipis / Habis", value: `${data.lowStock.filter((i) => i.totalQty > 0).length} / ${data.lowStock.filter((i) => i.totalQty <= 0).length}`, tone: data.lowStock.length > 0 ? "warn" : "default" },
          { label: "Permintaan Menunggu", value: String(data.requestSummary.menunggu) },
          { label: "Selisih Opname", value: `${data.opnameDiscrepancies.reduce((s, d) => s + Math.abs(d.difference), 0)} unit · ${data.opnameDiscrepancies.length} baris` },
        ]}
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="report" value={kind} />
        <div>
          <label htmlFor="from" className="block text-xs text-muted">Dari tanggal</label>
          <input id="from" name="from" type="date" defaultValue={searchParams.from ?? ""} className="rounded-md border border-line bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="to" className="block text-xs text-muted">Sampai tanggal</label>
          <input id="to" name="to" type="date" defaultValue={searchParams.to ?? ""} className="rounded-md border border-line bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="category" className="block text-xs text-muted">Kategori</label>
          <select id="category" name="category" defaultValue={searchParams.category ?? ""} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
            <option value="">Semua</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="location" className="block text-xs text-muted">Lokasi</label>
          <select id="location" name="location" defaultValue={searchParams.location ?? ""} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
            <option value="">Semua</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-md border border-line bg-white px-4 py-2 text-sm hover:border-accent">Terapkan Filter</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <a
            key={r.kind}
            href={`/reports?report=${r.kind}${filterQuery ? `&${filterQuery}` : ""}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              kind === r.kind ? "border-accent bg-accent/10 font-medium text-accent" : "border-line bg-white hover:border-accent"
            }`}
          >
            {r.label}
          </a>
        ))}
      </div>

      {canExport && (
        <div className="flex gap-2">
          <ExportButton kind={kind} format="excel" />
          <ExportButton kind={kind} format="pdf" />
          <span className="self-center text-xs text-muted">Maks. 5.000 baris per ekspor.</span>
        </div>
      )}

      <ReportTable kind={kind} data={data} />
    </div>
  );
}

function ExportButton({ kind, format }: { kind: ReportKind; format: "excel" | "pdf" }) {
  async function handleExport() {
    "use server";
    const res = format === "excel" ? await exportReportExcel(kind) : await exportReportPdf(kind);
    if (!res.ok) throw new Error(res.error);
    // In this scaffold the file content is returned to the caller; wire it to
    // a download route (src/app/api/reports/export) in production use.
    return res;
  }
  return (
    <form action={handleExport}>
      <button type="submit" className="rounded-md border border-line bg-white px-4 py-2 text-sm hover:border-accent">
        Ekspor {format === "excel" ? "Excel (.xls)" : "PDF"}
      </button>
    </form>
  );
}

async function ReportTable({ kind, data }: { kind: ReportKind; data: Awaited<ReturnType<typeof getReports>> }) {
  if (kind === "inventaris") {
    return (
      <DataTable
        columns={[
          { key: "sku", header: "SKU", render: (r) => <span className="font-medium">{r.sku}</span> },
          { key: "name", header: "Item", render: (r) => r.name },
          { key: "cat", header: "Kategori", render: (r) => r.category.name },
          { key: "qty", header: "Stok", align: "right", render: (r) => String(r.totalQty) },
          { key: "price", header: "Harga", align: "right", render: (r) => formatIDR(r.price) },
          { key: "value", header: "Nilai", align: "right", render: (r) => <strong>{formatIDR(r.price * r.totalQty)}</strong> },
        ]}
        rows={data.currentInventory}
        emptyText="Tidak ada item."
      />
    );
  }
  if (kind === "stok-menipis") {
    return (
      <DataTable
        columns={[
          { key: "sku", header: "SKU", render: (r) => <span className="font-medium">{r.sku}</span> },
          { key: "name", header: "Item", render: (r) => r.name },
          { key: "qty", header: "Stok", align: "right", render: (r) => String(r.totalQty) },
          { key: "min", header: "Min.", align: "right", render: (r) => String(r.minStock) },
          { key: "unit", header: "Satuan", render: (r) => r.unit },
        ]}
        rows={data.lowStock}
        emptyText="Tidak ada item menipis."
      />
    );
  }
  if (kind === "pergerakan") {
    return (
      <DataTable
        columns={[
          { key: "code", header: "Kode", render: (r) => <span className="font-medium">{r.code}</span> },
          { key: "item", header: "Item", render: (r) => r.item.name },
          { key: "type", header: "Jenis", render: (r) => r.type },
          { key: "qty", header: "Jumlah", align: "right", render: (r) => String(r.quantity) },
          { key: "by", header: "Dibuat oleh", render: (r) => r.createdBy.name },
        ]}
        rows={data.movements}
        emptyText="Tidak ada pergerakan pada filter ini."
      />
    );
  }
  if (kind === "aset") {
    return (
      <DataTable
        columns={[
          { key: "code", header: "Kode", render: (r) => <span className="font-medium">{r.code}</span> },
          { key: "name", header: "Aset", render: (r) => r.name },
          { key: "cat", header: "Kategori", render: (r) => r.category.name },
          { key: "loc", header: "Lokasi", render: (r) => r.location.name },
          { key: "status", header: "Status", render: (r) => r.status },
          { key: "price", header: "Harga Beli", align: "right", render: (r) => formatIDR(r.purchasePrice) },
        ]}
        rows={data.assetRegister}
        emptyText="Tidak ada aset."
      />
    );
  }
  if (kind === "penugasan-aset") {
    return (
      <DataTable
        columns={[
          { key: "asset", header: "Aset", render: (r) => r.asset.name },
          { key: "emp", header: "Karyawan", render: (r) => r.employeeName },
          { key: "at", header: "Ditugaskan", render: (r) => r.assignedAt.toLocaleDateString("id-ID") },
          { key: "back", header: "Dikembalikan", render: (r) => (r.returnedAt ? r.returnedAt.toLocaleDateString("id-ID") : "—") },
          { key: "status", header: "Status", render: (r) => r.status },
        ]}
        rows={data.assetAssignments}
        emptyText="Tidak ada penugasan aset."
      />
    );
  }
  if (kind === "valuasi") {
    const rows = Object.entries(data.valuation.byCategory).map(([name, value], i) => ({
      id: String(i),
      name,
      value,
    }));
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Total nilai inventaris: <strong>{formatIDR(data.valuation.inventoryValue)}</strong> · Total unit:{" "}
          <strong>{formatNumber(data.valuation.totalQty)}</strong>
        </p>
        <DataTable
          columns={[
            { key: "name", header: "Kategori", render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "value", header: "Nilai Persediaan", align: "right", render: (r) => <strong>{formatIDR(r.value)}</strong> },
          ]}
          rows={rows}
          emptyText="Tidak ada data valuasi."
        />
      </div>
    );
  }
  return (
    <DataTable
      columns={[
        { key: "loc", header: "Lokasi", render: (r) => r.location },
        { key: "item", header: "Item", render: (r) => r.item.name },
        { key: "sys", header: "Stok Sistem", align: "right", render: (r) => String(r.systemQty) },
        { key: "phys", header: "Hitung Fisik", align: "right", render: (r) => String(r.physicalQty ?? "—") },
        { key: "diff", header: "Selisih", align: "right", render: (r) => <strong>{r.difference > 0 ? `+${r.difference}` : r.difference}</strong> },
      ]}
      rows={data.opnameDiscrepancies.map((d) => ({ ...d, id: `${d.opnameId}-${d.itemId}` }))}
      emptyText="Tidak ada selisih opname."
    />
  );
}
