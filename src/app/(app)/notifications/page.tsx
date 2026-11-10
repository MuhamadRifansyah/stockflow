import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { DataTable } from "@/components/DataTable";
import { formatDateTime, timeAgo } from "@/lib/format";

const KIND_LABEL: Record<string, string> = {
  "low-stock": "Stok menipis",
  permintaan: "Permintaan",
  opname: "Opname",
  info: "Info",
};

export default async function NotificationsPage() {
  const user = await requirePermission("dashboard.view");

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Mark all as read when the page is opened.
  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold">Notifikasi</h1>
        <p className="text-sm text-muted">
          Pemberitahuan stok menipis, permintaan, dan opname. Membuka halaman ini menandai
          semuanya sebagai sudah dibaca.
        </p>
      </div>

      <DataTable
        columns={[
          { key: "kind", header: "Jenis", render: (n) => <span className="rounded-md bg-canvas px-2 py-0.5 text-xs">{KIND_LABEL[n.kind] ?? n.kind}</span> },
          {
            key: "content", header: "Pesan",
            render: (n) => (
              <span>
                <span className="font-medium">{n.title}</span>
                <span className="block text-muted">{n.message}</span>
              </span>
            ),
          },
          { key: "when", header: "Waktu", render: (n) => `${formatDateTime(n.createdAt)} · ${timeAgo(n.createdAt)}` },
        ]}
        rows={notifications}
        emptyText="Belum ada notifikasi."
      />
    </div>
  );
}
