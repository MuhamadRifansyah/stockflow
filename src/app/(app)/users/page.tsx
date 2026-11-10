import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { hasPermission, PERMISSIONS, PERMISSION_COUNT_BY_ROLE } from "@/lib/permissions";
import { DataTable } from "@/components/DataTable";
import { StatusDot } from "@/components/StatusDot";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createUser, setUserActive, deleteUser } from "@/lib/actions/users";
import { formatDate } from "@/lib/format";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await requirePermission("users.view");
  const canManage = hasPermission(user, "users.manage");
  const canManageRoles = hasPermission(user, "roles.manage");
  const tab = searchParams.tab || "users";

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      include: { role: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const modules = [...new Set(PERMISSIONS.map((p) => p.module))];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold">Manajemen Pengguna</h1>
        <p className="text-sm text-muted">
          Akun pengguna, peran, dan izin akses StockFlow. Izin ditegakkan di sisi server pada
          setiap operasi.
        </p>
      </div>

      <div className="flex gap-2">
        <a
          href="/users"
          className={`rounded-md border px-3 py-1.5 text-sm ${tab === "users" ? "border-accent bg-accent/10 font-medium text-accent" : "border-line bg-white hover:border-accent"}`}
        >
          Pengguna
        </a>
        <a
          href="/users?tab=roles"
          className={`rounded-md border px-3 py-1.5 text-sm ${tab === "roles" ? "border-accent bg-accent/10 font-medium text-accent" : "border-line bg-white hover:border-accent"}`}
        >
          Peran &amp; Izin
        </a>
      </div>

      {tab === "roles" ? (
        <div className="space-y-4">
          {roles.map((role) => {
            const keys = role.permissions.map((rp) => rp.permission.key);
            return (
              <section key={role.id} className="rounded-md border border-line bg-white p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">
                    {role.name}
                    {role.isLocked && <span className="ml-2 text-xs font-normal text-muted">(terkunci)</span>}
                  </h2>
                  <p className="text-sm text-muted">
                    {keys.length} izin · {role._count.users} pengguna
                    {PERMISSION_COUNT_BY_ROLE[role.name] !== undefined &&
                      ` · sesuai katalog: ${PERMISSION_COUNT_BY_ROLE[role.name]}`}
                  </p>
                </div>
                {modules.map((mod) => {
                  const perms = PERMISSIONS.filter((p) => p.module === mod);
                  return (
                    <div key={mod} className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted">{mod}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {perms.map((p) => {
                          const on = keys.includes(p.key);
                          return (
                            <span
                              key={p.key}
                              className={`rounded-md border px-2 py-1 text-xs ${
                                on ? "border-accent/40 bg-accent/10 text-accent" : "border-line text-muted"
                              }`}
                            >
                              {p.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {canManageRoles && !role.isLocked && (
                  <p className="mt-4 text-xs text-muted">
                    Ubah izin peran lewat server action <code>updateRolePermissions</code> — lihat
                    src/lib/actions/users.ts. Peran Super Admin terkunci dan tidak bisa diubah.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          {canManage && (
            <form action={async (fd) => { await createUser(fd); }} className="space-y-3 rounded-md border border-line bg-white p-5">
              <h2 className="font-semibold">Tambah Pengguna</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input name="name" required placeholder="Nama lengkap" aria-label="Nama lengkap" className="rounded-md border border-line px-3 py-2 text-sm" />
                <input name="email" type="email" required placeholder="nama@perusahaan.id" aria-label="Email" className="rounded-md border border-line px-3 py-2 text-sm" />
                <input name="password" type="password" required minLength={8} placeholder="Kata sandi awal (min. 8)" aria-label="Kata sandi awal" className="rounded-md border border-line px-3 py-2 text-sm" />
                <select name="roleId" required aria-label="Peran" className="rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Pilih peran…</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                Buat Pengguna
              </button>
            </form>
          )}

          <DataTable
            columns={[
              {
                key: "user", header: "Pengguna",
                render: (u) => (
                  <span className="font-medium">{u.name}<span className="block text-xs font-normal text-muted">{u.email}</span></span>
                ),
              },
              { key: "role", header: "Peran", render: (u) => u.role.name },
              {
                key: "status", header: "Status",
                render: (u) => <StatusDot tone={u.isActive ? "green" : "gray"}>{u.isActive ? "Aktif" : "Nonaktif"}</StatusDot>,
              },
              { key: "created", header: "Terdaftar", render: (u) => formatDate(u.createdAt) },
              {
                key: "actions", header: "Aksi", align: "right",
                render: (u) =>
                  canManage && u.id !== user.id ? (
                    <span className="inline-flex gap-2">
                      <form action={async () => { await setUserActive(u.id, !u.isActive); }}>
                        <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent">
                          {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </form>
                      <ConfirmDialog
                        triggerLabel="Hapus"
                        title="Hapus pengguna?"
                        description={`Pengguna ${u.name} (${u.email}) akan dihapus. Pengguna dengan riwayat tidak bisa dihapus — nonaktifkan saja.`}
                        confirmLabel="Ya, hapus"
                        danger
                        action={deleteUser}
                        actionId={u.id}
                      />
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  ),
              },
            ]}
            rows={users}
            emptyText="Belum ada pengguna."
          />
          <p className="text-xs text-muted">
            Akun demo (admin@, manager@, gudang@, karyawan@stockflow.id) dibuat nonaktif saat seed —
            aktifkan di sini dan atur kata sandinya lewat <code>resetUserPassword</code>.
          </p>
        </>
      )}
    </div>
  );
}
