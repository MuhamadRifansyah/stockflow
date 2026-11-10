import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { changeOwnPassword } from "@/lib/actions/users";
import { formatDate } from "@/lib/format";

export default async function SettingsPage() {
  const user = await requirePermission("settings.manage");

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
  if (!me) throw new Error("Pengguna tidak ditemukan.");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold">Pengaturan</h1>
        <p className="text-sm text-muted">Akun Anda dan keamanan kata sandi.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-line bg-white p-5">
          <h2 className="font-semibold">Akun Saya</h2>
          <dl className="mt-4 divide-y divide-line text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">Nama</dt>
              <dd className="font-medium">{me.name}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">Email</dt>
              <dd className="font-medium">{me.email}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">Peran</dt>
              <dd className="font-medium">{me.role.name}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-muted">Terdaftar sejak</dt>
              <dd className="font-medium">{formatDate(me.createdAt)}</dd>
            </div>
          </dl>

          <h3 className="mt-6 font-semibold">Izin Saya ({me.role.permissions.length})</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {me.role.permissions.map((rp) => (
              <span key={rp.permission.key} className="rounded-md border border-line bg-canvas px-2 py-1 font-mono text-xs">
                {rp.permission.key}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-5">
          <h2 className="font-semibold">Ubah Kata Sandi</h2>
          <form action={async (fd) => { await changeOwnPassword(fd); }} className="mt-4 space-y-3">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium mb-1">Kata sandi saat ini</label>
              <input id="currentPassword" name="currentPassword" type="password" required className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium mb-1">Kata sandi baru (min. 8 karakter)</label>
              <input id="newPassword" name="newPassword" type="password" required minLength={8} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">Konfirmasi kata sandi baru</label>
              <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
              Simpan Kata Sandi
            </button>
          </form>
          <p className="mt-4 text-xs text-muted">
            Kata sandi disimpan sebagai hash PBKDF2-SHA256 dengan salt acak per pengguna dan
            tidak pernah ditampilkan dalam bentuk teks biasa.
          </p>
        </section>
      </div>
    </div>
  );
}
