import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createCategory, deleteCategory } from "@/lib/actions/categories";
import { formatDate } from "@/lib/format";

export default async function CategoriesPage() {
  const user = await requirePermission("categories.manage");
  void user;
  const canManage = hasPermission(user, "categories.manage");

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true, assets: true } } },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold">Kategori</h1>
        <p className="text-sm text-muted">
          Pengelompokan item inventaris dan aset. Kategori yang masih digunakan tidak dapat dihapus.
        </p>
      </div>

      {canManage && (
        <form action={async (fd) => { await createCategory(fd); }} className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-4">
          <div className="min-w-64 flex-1">
            <label htmlFor="name" className="block text-sm font-medium mb-1">Nama kategori baru</label>
            <input
              id="name"
              name="name"
              required
              placeholder="mis. Peralatan Jaringan"
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
            + Tambah Kategori
          </button>
        </form>
      )}

      <DataTable
        columns={[
          { key: "name", header: "Nama Kategori", render: (c) => <span className="font-medium">{c.name}</span> },
          { key: "items", header: "Item", align: "right", render: (c) => String(c._count.items) },
          { key: "assets", header: "Aset", align: "right", render: (c) => String(c._count.assets) },
          { key: "created", header: "Dibuat", render: (c) => formatDate(c.createdAt) },
          {
            key: "actions", header: "Aksi", align: "right",
            render: (c) =>
              canManage ? (
                <ConfirmDialog
                  triggerLabel="Hapus"
                  title="Hapus kategori?"
                  description={`Kategori "${c.name}" akan dihapus. Kategori yang masih dipakai item atau aset tidak bisa dihapus.`}
                  confirmLabel="Ya, hapus"
                  danger
                  action={deleteCategory}
                  actionId={c.id}
                />
              ) : (
                <span className="text-muted">—</span>
              ),
          },
        ]}
        rows={categories}
        emptyText="Belum ada kategori."
      />
    </div>
  );
}
