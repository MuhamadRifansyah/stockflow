import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createSupplier, deleteSupplier, recordPurchase } from "@/lib/actions/suppliers";
import { formatDate, formatIDR } from "@/lib/format";

export default async function SuppliersPage() {
  const user = await requirePermission("suppliers.view");
  const canManage = hasPermission(user, "suppliers.manage");

  const [suppliers, items, locations] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { items: true, purchases: true } },
        purchases: { select: { total: true } },
      },
    }),
    prisma.item.findMany({ orderBy: { name: "asc" }, select: { id: true, sku: true, name: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows = suppliers.map((s) => ({
    ...s,
    totalPembelian: s.purchases.reduce((sum, p) => sum + p.total, 0),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Pemasok</h1>
          <p className="text-sm text-muted">Profil pemasok, item terkait, dan riwayat pembelian.</p>
        </div>
        {canManage && (
          <details className="shrink-0 rounded-md border border-line bg-white">
            <summary className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
              + Tambah Pemasok
            </summary>
            <form action={async (fd) => { await createSupplier(fd); }} className="w-80 space-y-3 border-t border-line p-4">
              <input name="name" required placeholder="Nama pemasok" aria-label="Nama pemasok" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <input name="contact" placeholder="Nama kontak" aria-label="Nama kontak" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <input name="email" type="email" placeholder="Email" aria-label="Email" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <input name="phone" placeholder="Telepon" aria-label="Telepon" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              <button type="submit" className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                Simpan Pemasok
              </button>
            </form>
          </details>
        )}
      </div>

      <DataTable
        columns={[
          { key: "name", header: "Nama Pemasok", render: (s) => <span className="font-medium">{s.name}</span> },
          {
            key: "contact", header: "Kontak",
            render: (s) => (
              <span>{s.contact ?? "—"}<span className="block text-xs text-muted">{s.email ?? ""}</span></span>
            ),
          },
          { key: "items", header: "Item", align: "right", render: (s) => String(s._count.items) },
          { key: "purchases", header: "Pembelian", align: "right", render: (s) => String(s._count.purchases) },
          { key: "total", header: "Total Pembelian", align: "right", render: (s) => formatIDR(s.totalPembelian) },
          {
            key: "actions", header: "Aksi", align: "right",
            render: (s) =>
              canManage ? (
                <ConfirmDialog
                  triggerLabel="Hapus"
                  title="Hapus pemasok?"
                  description={`Pemasok "${s.name}" akan dihapus. Pemasok dengan riwayat pembelian tidak bisa dihapus.`}
                  confirmLabel="Ya, hapus"
                  danger
                  action={deleteSupplier}
                  actionId={s.id}
                />
              ) : (
                <span className="text-muted">—</span>
              ),
          },
        ]}
        rows={rows}
        emptyText="Belum ada pemasok."
      />

      {canManage && (
        <section className="rounded-md border border-line bg-white p-5">
          <h2 className="font-semibold">Catat Pembelian</h2>
          <p className="mt-1 text-sm text-muted">
            Pembelian mem-posting pergerakan stok masuk yang cocok secara otomatis — pembelian dan
            stok tidak pernah bisa berbeda.
          </p>
          <form action={async (fd) => { await recordPurchase(fd); }} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <select name="supplierId" required aria-label="Pemasok" className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="">Pilih pemasok…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select name="itemId" required aria-label="Item" className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="">Pilih item…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
            </select>
            <input name="quantity" type="number" min={1} required placeholder="Jumlah" aria-label="Jumlah" className="rounded-md border border-line px-3 py-2 text-sm" />
            <input name="unitPrice" type="number" min={0} required placeholder="Harga satuan (IDR)" aria-label="Harga satuan" className="rounded-md border border-line px-3 py-2 text-sm" />
            <select name="locationId" required aria-label="Lokasi tujuan" className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="">Lokasi tujuan…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark sm:col-span-2 lg:col-span-1">
              Catat Pembelian
            </button>
          </form>
        </section>
      )}

      <PurchaseHistory />
    </div>
  );
}

async function PurchaseHistory() {
  const purchases = await prisma.purchase.findMany({
    include: { supplier: true, item: true, movement: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return (
    <section>
      <h2 className="mb-3 font-semibold">Riwayat Pembelian</h2>
      <DataTable
        columns={[
          { key: "supplier", header: "Pemasok", render: (p) => p.supplier.name },
          { key: "item", header: "Item", render: (p) => <span>{p.item.name}<span className="block text-xs text-muted">{p.item.sku}</span></span> },
          { key: "qty", header: "Jumlah", align: "right", render: (p) => String(p.quantity) },
          { key: "price", header: "Harga Satuan", align: "right", render: (p) => formatIDR(p.unitPrice) },
          { key: "total", header: "Total", align: "right", render: (p) => <strong>{formatIDR(p.total)}</strong> },
          { key: "trx", header: "Transaksi", render: (p) => p.movement?.code ?? "—" },
          { key: "date", header: "Tanggal", render: (p) => formatDate(p.createdAt) },
        ]}
        rows={purchases}
        emptyText="Belum ada pembelian."
      />
    </section>
  );
}
