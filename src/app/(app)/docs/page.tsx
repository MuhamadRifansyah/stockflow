import Link from "next/link";
import { requirePermission } from "@/lib/session";

const SECTIONS = [
  {
    id: "readme",
    title: "README",
    body: "StockFlow adalah aplikasi manajemen inventaris & aset untuk perusahaan, gudang, kantor, dan tim operasional. Modul: inventaris, pergerakan stok, aset & penugasan, permintaan & persetujuan, stock opname, pemasok, laporan & analitik, manajemen pengguna (RBAC), log audit, dan notifikasi.",
  },
  {
    id: "roles",
    title: "Peran & Izin",
    body: "Lima peran dengan jumlah izin yang sudah diverifikasi terhadap kode server: Super Admin 27 (terkunci), Admin 26 (semua kecuali roles.manage), Warehouse Staff 16, Manager 12, Employee 5. Izin ditegakkan di sisi server pada setiap operasi, bukan hanya dengan menyembunyikan menu.",
  },
  {
    id: "invariants",
    title: "Invarian Inti",
    body: "Saldo stok diturunkan dari ledger pergerakan dan tidak pernah diedit langsung. Stok negatif mustahil: validasi menolak stok keluar berlebih, transfer berlebih, transfer ke lokasi yang sama, penyesuaian nol, dan hasil apa pun di bawah nol. Penyesuaian opname hanya berlaku setelah manajer menyetujui sesi. Semua mutasi menulis entri audit log.",
  },
  {
    id: "setup",
    title: "Setup Pertama Kali",
    body: "Kunjungan pertama menampilkan layar setup satu kali untuk membuat akun Super Admin dengan kata sandi pilihan Anda. Masuk sebagai Super Admin, lalu buka Manajemen Pengguna untuk mengaktifkan empat akun demo (admin@, manager@, gudang@, karyawan@stockflow.id) dan mengatur kata sandinya. Data demo (14 SKU, 18 pergerakan, 8 aset, 3 lokasi, 3 pemasok) di-seed sekali saat database kosong.",
  },
  {
    id: "env",
    title: "Environment",
    body: "Build ini tidak membutuhkan environment variable di runtime hosting, tetapi deployment self-hosted membutuhkan DATABASE_URL dan NEXTAUTH_SECRET (lihat .env.example). Nilai efektif yang sudah tertanam: sesi 7 hari, PBKDF2 120.000 iterasi, throttling login 8 kegagalan / 15 menit, batas ekspor 5.000 baris, batas gambar produk 2 MB.",
  },
  {
    id: "deploy",
    title: "Deployment & Data",
    body: "Jalankan migrasi Prisma sebelum pertama kali memakai aplikasi. Data tersimpan di PostgreSQL dan tidak pernah dihapus oleh deploy ulang. Backup database secara berkala; ekspor laporan bukan pengganti backup.",
  },
  {
    id: "ops",
    title: "Panduan Operasional",
    body: "Catat stok masuk/keluar di Pergerakan Stok. Proses permintaan: karyawan mengajukan → manajer menyetujui/menolak → staf gudang memproses dari lokasi sumber → penyelesaian mem-posting pergerakan keluar asli. Opname: buat sesi per lokasi, hitung fisik, ajukan, lalu manajer menyetujui — saldo berubah hanya saat itu. Stok menipis: cek detail item, lalu catat pembelian dari pemasok atau transfer dari lokasi lain.",
  },
  {
    id: "source",
    title: "Kode Sumber",
    body: "Kode Next.js + Prisma + Auth.js untuk aplikasi ini ada di docs/SOURCE-CODE.md dan di seluruh repositori ini. Versi hosted yang berjalan di Muse memakai runtime yang sama secara arsitektur, tetapi kode sumber ini adalah rekonstruksi scaffold yang setia pada spesifikasi — bukan ekspor byte-per-byte dari artifact.",
  },
];

export default async function DocsPage() {
  const user = await requirePermission("dashboard.view");
  void user;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold">Dokumentasi</h1>
        <p className="text-sm text-muted">
          README, peran &amp; izin, invarian, setup, environment, deployment, dan panduan
          operasional — sama seperti yang ada di build hosted.
        </p>
      </div>

      <nav aria-label="Daftar isi" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:border-accent">
            {s.title}
          </a>
        ))}
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-6 rounded-md border border-line bg-white p-5">
          <h2 className="font-semibold">{s.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
        </section>
      ))}

      <p className="text-sm text-muted">
        Unduh dokumen:{" "}
        <Link href="/docs" className="text-accent hover:underline">README.md</Link> dan{" "}
        <code>.env.example</code> tersedia di root repositori.
      </p>
    </div>
  );
}
