import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createLocation, deleteLocation } from "@/lib/actions/locations";

export default async function LocationsPage() {
  const user = await requirePermission("locations.manage");
  const canManage = hasPermission(user, "locations.manage");

  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { balances: true, assets: true } },
      balances: { select: { quantity: true } },
    },
  });
  const rows = locations.map((l) => ({
    ...l,
    itemCount: l._count.balances,
    assetCount: l._count.assets,
    totalQty: l.balances.reduce((s, b) => s + b.quantity, 0),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold">Lokasi</h1>
        <p className="text-sm text-muted">
          Gudang, kantor, dan cabang tempat item serta aset disimpan. Satu item dapat tersebar di
          beberapa lokasi lewat pergerakan stok.
        </p>
      </div>

      {canManage && (
        <form action={createLocation} className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-4">
          <div className="min-w-64 flex-1">
            <label htmlFor="name" className="block text-sm font-medium mb-1">Nama lokasi baru</label>
            <input id="name" name="name" required placeholder="mis. Gudang Cabang — Bandung" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="type" className="block text-sm font-medium mb-1">Tipe</label>
            <select id="type" name="type" className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="Gudang">Gudang</option>
              <option value="Kantor">Kantor</option>
              <option value="Cabang">Cabang</option>
            </select>
          </div>
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
            + Tambah Lokasi
          </button>
        </form>
      )}

      <DataTable
        columns={[
          { key: "name", header: "Nama Lokasi", render: (l) => <span className="font-medium">{l.name}</span> },
          { key: "type", header: "Tipe", render: (l) => <span className="rounded-md bg-canvas px-2 py-0.5 text-xs">{l.type}</span> },
          { key: "items", header: "Item", align: "right", render: (l) => String(l.itemCount) },
          { key: "assets", header: "Aset", align: "right", render: (l) => String(l.assetCount) },
          { key: "qty", header: "Total Unit", align: "right", render: (l) => String(l.totalQty) },
          {
            key: "actions", header: "Aksi", align: "right",
            render: (l) =>
              canManage ? (
                <ConfirmDialog
                  triggerLabel="Hapus"
                  title="Hapus lokasi?"
                  description={`Lokasi "${l.name}" akan dihapus. Lokasi yang masih menyimpan stok atau aset tidak bisa dihapus.`}
                  confirmLabel="Ya, hapus"
                  danger
                  action={deleteLocation}
                  actionId={l.id}
                />
              ) : (
                <span className="text-muted">—</span>
              ),
          },
        ]}
        rows={rows}
        emptyText="Belum ada lokasi."
      />
    </div>
  );
}
