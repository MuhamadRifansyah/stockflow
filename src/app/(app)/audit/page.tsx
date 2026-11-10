import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { DataTable } from "@/components/DataTable";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 20;

type SearchParams = { q?: string; module?: string; from?: string; to?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("audit.view");
  void user;
  const q = (searchParams.q ?? "").trim();
  const module = searchParams.module || "";
  const from = searchParams.from || "";
  const to = searchParams.to || "";
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);

  const where = {
    ...(q
      ? {
          OR: [
            { action: { contains: q, mode: "insensitive" as const } },
            { entityId: { contains: q, mode: "insensitive" as const } },
            { user: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(module ? { module } : {}),
    ...(from || to
      ? { createdAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(`${to}T23:59:59`) : undefined } }
      : {}),
  };

  const modules = await prisma.auditLog.findMany({
    select: { module: true },
    distinct: ["module"],
    orderBy: { module: "asc" },
  });

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold">Log Audit</h1>
        <p className="text-sm text-muted">
          Setiap operasi penting tercatat dengan pengguna, aksi, modul, entitas, nilai sebelum dan
          sesudah, serta waktu kejadian.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="block text-xs text-muted">Cari</label>
          <input id="q" type="search" name="q" defaultValue={q} placeholder="Aksi, entitas, atau pengguna…" className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="module" className="block text-xs text-muted">Modul</label>
          <select id="module" name="module" defaultValue={module} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
            <option value="">Semua modul</option>
            {modules.map((m) => <option key={m.module} value={m.module}>{m.module}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="block text-xs text-muted">Tanggal dari</label>
          <input id="from" name="from" type="date" defaultValue={from} className="rounded-md border border-line bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="to" className="block text-xs text-muted">Tanggal sampai</label>
          <input id="to" name="to" type="date" defaultValue={to} className="rounded-md border border-line bg-white px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-md border border-line bg-white px-4 py-2 text-sm hover:border-accent">Cari</button>
      </form>

      <DataTable
        columns={[
          { key: "time", header: "Waktu", render: (l) => formatDateTime(l.createdAt) },
          { key: "user", header: "Pengguna", render: (l) => l.user?.name ?? "Sistem" },
          { key: "action", header: "Aksi", render: (l) => <span className="font-medium">{l.action}</span> },
          { key: "module", header: "Modul", render: (l) => <span className="rounded-md bg-canvas px-2 py-0.5 text-xs">{l.module}</span> },
          { key: "entity", header: "Entitas", render: (l) => <span className="break-all text-xs">{l.entityId ?? "—"}</span> },
          {
            key: "change", header: "Perubahan",
            render: (l) => (
              <span className="block max-w-72 truncate text-xs text-muted" title={`${l.prevValue ?? "—"} → ${l.newValue ?? "—"}`}>
                Sebelum: {l.prevValue ? l.prevValue.slice(0, 60) : "—"}
                <br />
                Sesudah: {l.newValue ? l.newValue.slice(0, 60) : "—"}
              </span>
            ),
          },
        ]}
        rows={logs}
        emptyText="Belum ada entri audit."
      />

      <p className="text-sm text-muted">
        Halaman {page} dari {pages} · {total} entri
      </p>
    </div>
  );
}
