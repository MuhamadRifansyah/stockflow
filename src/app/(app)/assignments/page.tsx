import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { StatusDot } from "@/components/StatusDot";
import { assignAsset, returnAsset } from "@/lib/actions/assets";
import { formatDateTime } from "@/lib/format";

export default async function AssignmentsPage() {
  const user = await requirePermission("assets.view");
  const canManage = hasPermission(user, "assets.manage");

  const [assignments, availableAssets] = await Promise.all([
    prisma.assetAssignment.findMany({
      include: { asset: true },
      orderBy: { assignedAt: "desc" },
    }),
    prisma.asset.findMany({
      where: { status: "AKTIF" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const outNow = assignments.filter((a) => a.status === "DIPINJAM").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold">Penugasan Aset</h1>
        <p className="text-sm text-muted">
          Riwayat penugasan aset ke karyawan, termasuk pengembalian.
        </p>
      </div>

      <p className="text-sm text-muted">
        <strong className="text-ink">{outNow}</strong> aset sedang dipinjam ·{" "}
        <strong className="text-ink">{assignments.length}</strong> riwayat penugasan
      </p>

      {canManage && (
        <form action={async (fd) => { await assignAsset(fd); }} className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-4">
          <div className="min-w-64 flex-1">
            <label htmlFor="assetId" className="block text-sm font-medium mb-1">Aset (hanya yang berstatus Aktif)</label>
            <select id="assetId" name="assetId" required className="w-full rounded-md border border-line px-3 py-2 text-sm">
              <option value="">Pilih aset…</option>
              {availableAssets.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-48 flex-1">
            <label htmlFor="employeeName" className="block text-sm font-medium mb-1">Nama karyawan</label>
            <input id="employeeName" name="employeeName" required placeholder="mis. Fajar Nugroho" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
            Tugaskan Aset
          </button>
        </form>
      )}

      <DataTable
        columns={[
          {
            key: "asset", header: "Aset",
            render: (a) => (
              <span className="font-medium">{a.asset.name}<span className="block text-xs font-normal text-muted">{a.asset.code}</span></span>
            ),
          },
          { key: "employee", header: "Karyawan", render: (a) => a.employeeName },
          { key: "assigned", header: "Ditugaskan", render: (a) => formatDateTime(a.assignedAt) },
          { key: "returned", header: "Dikembalikan", render: (a) => (a.returnedAt ? formatDateTime(a.returnedAt) : "—") },
          {
            key: "status", header: "Status",
            render: (a) => (
              <StatusDot tone={a.status === "DIPINJAM" ? "black" : "green"}>
                {a.status === "DIPINJAM" ? "Sedang dipinjam" : "Dikembalikan"}
              </StatusDot>
            ),
          },
          {
            key: "actions", header: "Aksi", align: "right",
            render: (a) =>
              canManage && a.status === "DIPINJAM" ? (
                <form action={async (fd) => { await returnAsset(fd); }} className="flex items-center justify-end gap-2">
                  <input type="hidden" name="assignmentId" value={a.id} />
                  <select name="condition" aria-label="Kondisi saat kembali" className="rounded-md border border-line px-2 py-1.5 text-sm">
                    <option value="BAIK">Baik</option>
                    <option value="RUSAK_RINGAN">Rusak ringan</option>
                    <option value="RUSAK_BERAT">Rusak berat</option>
                  </select>
                  <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent">
                    Kembalikan
                  </button>
                </form>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
        ]}
        rows={assignments}
        emptyText="Belum ada penugasan aset."
      />
    </div>
  );
}
