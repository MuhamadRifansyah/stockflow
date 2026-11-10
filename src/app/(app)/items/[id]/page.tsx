import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { StatusDot, itemStatusTone } from "@/components/StatusDot";
import { updateItem, uploadItemImage } from "@/lib/actions/items";
import { formatDate, formatIDR, formatNumber } from "@/lib/format";

export default async function ItemDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("items.view");
  const canEdit = hasPermission(user, "items.edit");

  const item = await prisma.item.findUnique({
    where: { id: params.id },
    include: {
      category: true,
      supplier: true,
      balances: { include: { location: true }, orderBy: { location: { name: "asc" } } },
    },
  });
  if (!item) notFound();

  const movements = await prisma.stockMovement.findMany({
    where: { itemId: item.id },
    include: { createdBy: true, fromLocation: true, toLocation: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const totalQty = item.balances.reduce((s, b) => s + b.quantity, 0);
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/items" className="text-sm text-accent hover:underline">← Semua Item</Link>
        <h1 className="mt-2 text-[22px] font-semibold">{item.name}</h1>
        <p className="text-sm text-muted">
          {item.sku} · {item.category.name} · {item.supplier?.name ?? "Tanpa pemasok"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-md border border-line bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold">Ringkasan</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">Total stok</dt>
              <dd className="mt-1 text-xl font-semibold">{formatNumber(totalQty)} {item.unit}</dd>
            </div>
            <div>
              <dt className="text-muted">Stok minimum</dt>
              <dd className="mt-1 text-xl font-semibold">{item.minStock} {item.unit}</dd>
            </div>
            <div>
              <dt className="text-muted">Harga satuan</dt>
              <dd className="mt-1 text-xl font-semibold">{formatIDR(item.price)}</dd>
            </div>
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="mt-1">
                <StatusDot tone={itemStatusTone(totalQty, item.minStock)}>
                  {totalQty <= 0 ? "Habis" : totalQty <= item.minStock ? "Menipis" : "Tersedia"}
                </StatusDot>
              </dd>
            </div>
          </dl>
          {item.description && <p className="mt-4 text-sm text-muted">{item.description}</p>}
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.name} className="mt-4 max-h-48 rounded-md border border-line" />
          )}

          <h3 className="mt-6 font-semibold">Saldo per Lokasi</h3>
          <DataTable
            columns={[
              { key: "loc", header: "Lokasi", render: (b) => b.location.name },
              { key: "type", header: "Tipe", render: (b) => b.location.type },
              { key: "qty", header: "Jumlah", align: "right", render: (b) => <strong>{b.quantity} {item.unit}</strong> },
            ]}
            rows={item.balances}
            emptyText="Belum ada stok di lokasi mana pun."
          />
        </section>

        {canEdit && (
          <section className="rounded-md border border-line bg-white p-5">
            <h2 className="font-semibold">Ubah Item</h2>
            <p className="mt-1 text-xs text-muted">
              Stok tidak bisa diubah di sini — gunakan Pergerakan Stok atau opname yang disetujui.
            </p>
            <form action={updateItem.bind(null, item.id)} className="mt-4 space-y-3">
              <input name="sku" required defaultValue={item.sku} aria-label="SKU" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <input name="name" required defaultValue={item.name} aria-label="Nama item" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <select name="categoryId" required defaultValue={item.categoryId} aria-label="Kategori" className="w-full rounded-md border border-line px-3 py-2 text-sm">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select name="supplierId" defaultValue={item.supplierId ?? ""} aria-label="Pemasok" className="w-full rounded-md border border-line px-3 py-2 text-sm">
                <option value="">Tanpa pemasok</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <input name="unit" required defaultValue={item.unit} aria-label="Satuan" className="rounded-md border border-line px-3 py-2 text-sm" />
                <input name="price" type="number" min={0} defaultValue={item.price} aria-label="Harga" className="rounded-md border border-line px-3 py-2 text-sm" />
                <input name="minStock" type="number" min={0} defaultValue={item.minStock} aria-label="Stok minimum" className="rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <textarea name="description" defaultValue={item.description ?? ""} placeholder="Deskripsi" aria-label="Deskripsi" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <button type="submit" className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                Simpan Perubahan
              </button>
            </form>

            <form action={uploadItemImage.bind(null, item.id)} className="mt-5 border-t border-line pt-4">
              <label htmlFor="image" className="block text-sm font-medium">Gambar produk (maks. 2 MB, PNG/JPEG/WebP/GIF)</label>
              <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-2 w-full text-sm" />
              <button type="submit" className="mt-2 rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent">
                Unggah Gambar
              </button>
            </form>
          </section>
        )}
      </div>

      <section className="rounded-md border border-line bg-white p-5">
        <h2 className="font-semibold">Riwayat Pergerakan</h2>
        <div className="mt-4">
          <DataTable
            columns={[
              { key: "code", header: "Transaksi", render: (m) => <span className="font-medium">{m.code}</span> },
              { key: "type", header: "Jenis", render: (m) => ({ MASUK: "Masuk", KELUAR: "Keluar", TRANSFER: "Transfer", PENYESUAIAN: "Penyesuaian" } as Record<string, string>)[m.type] },
              {
                key: "qty", header: "Jumlah", align: "right",
                render: (m) => <span className={m.quantity > 0 ? "text-accent" : "text-danger"}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>,
              },
              {
                key: "route", header: "Rute Lokasi",
                render: (m) => m.type === "TRANSFER"
                  ? `${m.fromLocation?.name ?? "—"} → ${m.toLocation?.name ?? "—"}`
                  : m.type === "KELUAR" ? m.fromLocation?.name ?? "—" : m.toLocation?.name ?? "—",
              },
              { key: "after", header: "Saldo Sesudah", align: "right", render: (m) => (m.balanceAfter ?? "—").toString() },
              { key: "by", header: "Dibuat oleh", render: (m) => m.createdBy.name },
              { key: "date", header: "Tanggal", render: (m) => formatDate(m.createdAt) },
            ]}
            rows={movements}
            emptyText="Belum ada pergerakan untuk item ini."
          />
        </div>
      </section>
    </div>
  );
}
