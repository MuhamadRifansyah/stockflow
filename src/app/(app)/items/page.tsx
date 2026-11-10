import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { StatusDot, itemStatusTone } from "@/components/StatusDot";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createItem, deleteItem } from "@/lib/actions/items";
import { timeAgo } from "@/lib/format";

const PAGE_SIZE = 10;

type SearchParams = {
  q?: string;
  category?: string;
  location?: string;
  status?: string;
  page?: string;
};

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requirePermission("items.view");
  const canCreate = hasPermission(user, "items.create");
  const canDelete = hasPermission(user, "items.delete");

  const q = (searchParams.q ?? "").trim();
  const categoryId = searchParams.category || "";
  const locationId = searchParams.location || "";
  const status = searchParams.status || "";
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);

  const [categories, locations] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  const where = {
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] }
      : {}),
    ...(categoryId ? { categoryId } : {}),
  };

  const all = await prisma.item.findMany({
    where,
    include: { category: true, supplier: true, balances: { include: { location: true } } },
    orderBy: { name: "asc" },
  });

  let rows = all.map((it) => {
    const balances = locationId
      ? it.balances.filter((b) => b.locationId === locationId)
      : it.balances;
    return {
      ...it,
      totalQty: balances.reduce((s, b) => s + b.quantity, 0),
      locationNames: [...new Set(it.balances.map((b) => b.location.name))].join(", "),
    };
  });
  if (status === "menipis") rows = rows.filter((r) => r.totalQty > 0 && r.totalQty <= r.minStock);
  if (status === "habis") rows = rows.filter((r) => r.totalQty <= 0);
  if (status === "tersedia") rows = rows.filter((r) => r.totalQty > r.minStock);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filterHref = (patch: Partial<SearchParams>) => {
    const params = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(categoryId ? { category: categoryId } : {}),
      ...(locationId ? { location: locationId } : {}),
      ...(status ? { status } : {}),
      ...patch,
    });
    return `/items?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Semua Item</h1>
          <p className="text-sm text-muted">
            {total} item terdaftar · stok dihitung dari data item dan riwayat pergerakan.
          </p>
        </div>
        {canCreate && (
          <details className="shrink-0 rounded-md border border-line bg-white">
            <summary className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
              + Tambah Item
            </summary>
            <form action={createItem} className="space-y-3 border-t border-line p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="sku" required placeholder="SKU, mis. ATK-BAT-AA" aria-label="SKU" className="rounded-md border border-line px-3 py-2 text-sm" />
                <input name="name" required placeholder="Nama item" aria-label="Nama item" className="rounded-md border border-line px-3 py-2 text-sm" />
                <select name="categoryId" required aria-label="Kategori" className="rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Pilih kategori…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select name="supplierId" aria-label="Pemasok" className="rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Pemasok (opsional)…</option>
                  {(await prisma.supplier.findMany({ orderBy: { name: "asc" } })).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <input name="unit" required defaultValue="pcs" placeholder="Satuan" aria-label="Satuan" className="rounded-md border border-line px-3 py-2 text-sm" />
                <input name="price" type="number" min={0} defaultValue={0} placeholder="Harga satuan (IDR)" aria-label="Harga satuan" className="rounded-md border border-line px-3 py-2 text-sm" />
                <input name="minStock" type="number" min={0} defaultValue={0} placeholder="Stok minimum" aria-label="Stok minimum" className="rounded-md border border-line px-3 py-2 text-sm" />
                <input name="description" placeholder="Deskripsi (opsional)" aria-label="Deskripsi" className="rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                Simpan Item
              </button>
            </form>
          </details>
        )}
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Cari nama atau SKU…"
          aria-label="Cari nama atau SKU"
          className="min-w-52 flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm"
        />
        <select name="category" defaultValue={categoryId} aria-label="Filter kategori" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="">Semua Kategori</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="location" defaultValue={locationId} aria-label="Filter lokasi" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="">Semua Lokasi</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select name="status" defaultValue={status} aria-label="Filter status" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
          <option value="">Semua Status</option>
          <option value="tersedia">Tersedia</option>
          <option value="menipis">Menipis</option>
          <option value="habis">Habis</option>
        </select>
        <button type="submit" className="rounded-md border border-line bg-white px-4 py-2 text-sm hover:border-accent">
          Cari
        </button>
      </form>

      {pageRows.length === 0 ? (
        <EmptyState title="Tidak ada item yang cocok" description="Ubah filter atau tambah item baru." />
      ) : (
        <>
          <DataTable
            columns={[
              { key: "sku", header: "SKU", render: (r) => <span className="font-medium">{r.sku}</span> },
              {
                key: "name", header: "Nama Item",
                render: (r) => (
                  <Link href={`/items/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                    <span className="block text-xs font-normal text-muted">{r.supplier?.name ?? "—"}</span>
                  </Link>
                ),
              },
              { key: "category", header: "Kategori", render: (r) => r.category.name },
              { key: "location", header: "Lokasi", render: (r) => r.locationNames || "—" },
              { key: "stock", header: "Stok", align: "right", render: (r) => <strong>{r.totalQty}</strong> },
              { key: "min", header: "Min.", align: "right", render: (r) => String(r.minStock) },
              { key: "unit", header: "Satuan", render: (r) => r.unit },
              {
                key: "status", header: "Status",
                render: (r) => (
                  <StatusDot tone={itemStatusTone(r.totalQty, r.minStock)}>
                    {r.totalQty <= 0 ? "Habis" : r.totalQty <= r.minStock ? "Menipis" : "Tersedia"}
                  </StatusDot>
                ),
              },
              { key: "updated", header: "Diperbarui", render: (r) => timeAgo(r.updatedAt) },
              {
                key: "actions", header: "Aksi", align: "right",
                render: (r) =>
                  canDelete ? (
                    <ConfirmDialog
                      triggerLabel="Hapus"
                      title="Hapus item?"
                      description={`${r.name} (${r.sku}) akan dihapus permanen. Item dengan riwayat pergerakan tidak bisa dihapus.`}
                      confirmLabel="Ya, hapus"
                      danger
                      action={deleteItem}
                      actionId={r.id}
                    />
                  ) : (
                    <Link href={`/items/${r.id}`} className="text-sm text-accent hover:underline">Detail</Link>
                  ),
              },
            ]}
            rows={pageRows}
          />
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Halaman {page} dari {pages} · {total} item</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={filterHref({ page: String(page - 1) })} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-accent">← Sebelumnya</Link>}
              {page < pages && <Link href={filterHref({ page: String(page + 1) })} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-accent">Berikutnya →</Link>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
