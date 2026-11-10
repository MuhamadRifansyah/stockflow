import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { StatusDot, assetStatusTone } from "@/components/StatusDot";
import { createAsset, setAssetMaintenance } from "@/lib/actions/assets";
import { formatDate, formatIDR } from "@/lib/format";

type SearchParams = { q?: string; category?: string; location?: string; status?: string; kondisi?: string };

const CONDITION_LABEL: Record<string, string> = {
  BAIK: "Baik",
  RUSAK_RINGAN: "Rusak ringan",
  RUSAK_BERAT: "Rusak berat",
};
const STATUS_LABEL: Record<string, string> = {
  AKTIF: "Aktif",
  DIPINJAMKAN: "Dipinjamkan",
  PERAWATAN: "Perawatan",
  RUSAK: "Rusak",
  NONAKTIF: "Nonaktif",
};

export default async function AssetsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("assets.view");
  const canManage = hasPermission(user, "assets.manage");
  const q = (searchParams.q ?? "").trim();
  const categoryId = searchParams.category || "";
  const locationId = searchParams.location || "";
  const status = searchParams.status || "";
  const kondisi = searchParams.kondisi || "";

  const [categories, locations] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  const assets = await prisma.asset.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { code: { contains: q, mode: "insensitive" as const } },
              { serialNumber: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(locationId ? { locationId } : {}),
      ...(status ? { status: status as "AKTIF" | "DIPINJAMKAN" | "PERAWATAN" | "RUSAK" | "NONAKTIF" } : {}),
      ...(kondisi ? { condition: kondisi as "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" } : {}),
    },
    include: {
      category: true,
      location: true,
      assignments: { where: { status: "DIPINJAM" }, select: { employeeName: true } },
    },
    orderBy: { code: "asc" },
  });

  const total = assets.length;
  const aktif = assets.filter((a) => a.status === "AKTIF").length;
  const dipinjamkan = assets.filter((a) => a.status === "DIPINJAMKAN").length;
  const perawatan = assets.filter((a) => a.status === "PERAWATAN").length;
  const nilai = assets.reduce((s, a) => s + a.purchasePrice, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Registri Aset</h1>
          <p className="text-sm text-muted">
            Aset perusahaan: laptop, monitor, printer, furnitur, dan peralatan jaringan.
          </p>
        </div>
        {canManage && (
          <details className="shrink-0 rounded-md border border-line bg-white">
            <summary className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
              + Daftarkan Aset
            </summary>
            <form action={async (fd) => { await createAsset(fd); }} className="w-80 space-y-3 border-t border-line p-4">
              <input name="name" required placeholder="Nama aset" aria-label="Nama aset" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <input name="serialNumber" placeholder="Nomor seri" aria-label="Nomor seri" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <select name="categoryId" required aria-label="Kategori" className="w-full rounded-md border border-line px-3 py-2 text-sm">
                <option value="">Pilih kategori…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select name="locationId" required aria-label="Lokasi" className="w-full rounded-md border border-line px-3 py-2 text-sm">
                <option value="">Pilih lokasi…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select name="condition" aria-label="Kondisi" className="rounded-md border border-line px-3 py-2 text-sm">
                  <option value="BAIK">Baik</option>
                  <option value="RUSAK_RINGAN">Rusak ringan</option>
                  <option value="RUSAK_BERAT">Rusak berat</option>
                </select>
                <input name="purchasePrice" type="number" min={0} defaultValue={0} placeholder="Harga beli (IDR)" aria-label="Harga beli" className="rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <input name="purchaseDate" type="date" aria-label="Tanggal beli" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <button type="submit" className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                Simpan Aset
              </button>
            </form>
          </details>
        )}
      </div>

      <p className="text-sm text-muted">
        Total aset <strong className="text-ink">{total}</strong> · Aktif <strong className="text-ink">{aktif}</strong> · Dipinjamkan <strong className="text-ink">{dipinjamkan}</strong> · Perawatan <strong className="text-ink">{perawatan}</strong> · Nilai aset <strong className="text-ink">{formatIDR(nilai)}</strong>
      </p>

      <form method="get" className="flex flex-wrap gap-2">
        <input type="search" name="q" defaultValue={q} placeholder="Cari kode, nama, nomor seri, atau peminjam…" aria-label="Cari aset" className="min-w-64 flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm" />
        <select name="category" defaultValue={categoryId} aria-label="Filter kategori" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="">Semua kategori</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="location" defaultValue={locationId} aria-label="Filter lokasi" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="">Semua lokasi</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select name="status" defaultValue={status} aria-label="Filter status" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="kondisi" defaultValue={kondisi} aria-label="Filter kondisi" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="">Semua kondisi</option>
          {Object.entries(CONDITION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="submit" className="rounded-md border border-line bg-white px-4 py-2 text-sm hover:border-accent">Cari</button>
      </form>

      <DataTable
        columns={[
          { key: "code", header: "Kode", render: (a) => <span className="font-medium">{a.code}</span> },
          {
            key: "name", header: "Aset",
            render: (a) => (
              <span>{a.name}<span className="block text-xs text-muted">{a.serialNumber ?? "—"}</span></span>
            ),
          },
          { key: "category", header: "Kategori", render: (a) => a.category.name },
          { key: "location", header: "Lokasi", render: (a) => a.location.name },
          { key: "condition", header: "Kondisi", render: (a) => CONDITION_LABEL[a.condition] },
          { key: "assigned", header: "Ditugaskan ke", render: (a) => a.assignments[0]?.employeeName ?? "—" },
          { key: "status", header: "Status", render: (a) => <StatusDot tone={assetStatusTone(a.status)}>{STATUS_LABEL[a.status]}</StatusDot> },
          { key: "price", header: "Harga Beli", align: "right", render: (a) => formatIDR(a.purchasePrice) },
          { key: "date", header: "Tgl. Beli", render: (a) => (a.purchaseDate ? formatDate(a.purchaseDate) : "—") },
          {
            key: "actions", header: "Aksi", align: "right",
            render: (a) =>
              canManage && a.status === "AKTIF" ? (
                <form action={async () => { await setAssetMaintenance(a.id, true); }}>
                  <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent">
                    Perawatan
                  </button>
                </form>
              ) : canManage && a.status === "PERAWATAN" ? (
                <form action={async () => { await setAssetMaintenance(a.id, false); }}>
                  <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent">
                    Selesai Rawat
                  </button>
                </form>
              ) : (
                <Link href="/assignments" className="text-sm text-accent hover:underline">Penugasan</Link>
              ),
          },
        ]}
        rows={assets}
        emptyText="Belum ada aset."
      />
    </div>
  );
}
