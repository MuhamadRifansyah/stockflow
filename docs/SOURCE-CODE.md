# StockFlow — Kode Sumber (Next.js + Prisma + Auth.js)

## Catatan jujur: ini scaffold, bukan ekspor byte-per-byte

StockFlow awalnya dibangun dan berjalan sebagai aplikasi web hosted di runtime
Muse — kodenya tidak tersedia sebagai file lokal. Repositori ini berisi
**rekonstruksi scaffold yang setia pada spesifikasi dan perilaku build hosted
tersebut**: model data, invarian ledger, alur approval, RBAC, dan desain yang
sama, ditulis ulang sebagai codebase Next.js (App Router, TypeScript) + Prisma
+ Auth.js yang lengkap dan siap dijalankan sendiri.

Artinya: struktur dan aturan bisnisnya sama dengan yang didokumentasikan di
`README.md`, `docs/ARCHITECTURE.md`, dan `docs/SETUP.md`, tetapi implementasi
ini ditulis baru untuk repositori — bukan salinan persis dari kode artifact
hosted. Jika ada perbedaan kecil (mis. penamaan internal), yang mengikat adalah
dokumen arsitektur dan perilaku yang terlihat di screenshot `docs/screenshots/`.

## Pemetaan ke build hosted

| Build hosted | Scaffold ini |
|---|---|
| Runtime hosted Muse + relational DB | Next.js 14 App Router + PostgreSQL via Prisma |
| Sesi server-side 7 hari | Auth.js (next-auth v5) Credentials, JWT `maxAge` 7 hari |
| PBKDF2 120.000 iterasi | `src/lib/auth.ts` — `pbkdf2Sync(..., 120_000, 64, "sha256")` |
| 5 peran, 27 izin | `src/lib/permissions.ts` + `prisma/seed.ts` (Super Admin 27, Admin 26, Warehouse Staff 16, Manager 12, Employee 5) |
| Ledger saldo per lokasi | `src/lib/actions/movements.ts` — `applyMovement()` satu-satunya jalur perubahan saldo, di dalam transaksi |
| Request → approve → proses → selesai | `src/lib/actions/requests.ts` |
| Opname snapshot → hitung → ajukan → setujui | `src/lib/actions/opname.ts` |
| Ekspor Excel (.xls) & PDF, maks. 5.000 baris | `src/lib/actions/reports.ts` (SpreadsheetML + PDF minimal server-generated) |
| Throttling login 8 gagal / 15 menit | `src/lib/auth.ts` + tabel `LoginAttempt` |
| Gambar produk maks. 2 MB + cek magic-byte | `src/lib/actions/items.ts` (`detectImageType`) |

## Struktur

```
package.json  tsconfig.json  next.config.mjs  tailwind.config.ts  postcss.config.mjs
prisma/
  schema.prisma   # 21 model: User, Role, Permission, RolePermission, Session,
                  # Category, Item, Location, Supplier, Purchase, StockBalance,
                  # StockMovement, Asset, AssetAssignment, StockRequest,
                  # StockRequestItem, StockOpname, StockOpnameDetail,
                  # Notification, AuditLog, LoginAttempt
  seed.ts         # 5 peran + 27 izin, 4 kategori, 3 lokasi, 3 pemasok,
                  # 14 SKU, 18 pergerakan, 8 aset, 2 penugasan, 2 permintaan
src/
  middleware.ts   # lindungi semua route kecuali /login
  app/
    layout.tsx  globals.css  login/page.tsx
    (app)/layout.tsx          # sidebar gelap + topbar
    (app)/dashboard/page.tsx  (app)/items/page.tsx  (app)/items/[id]/page.tsx
    (app)/categories  (app)/locations  (app)/movements  (app)/assets
    (app)/assignments  (app)/requests  (app)/approvals  (app)/opname
    (app)/suppliers  (app)/reports  (app)/audit  (app)/users
    (app)/settings  (app)/docs  (app)/notifications
  components/     # Sidebar, Topbar, StatBand, DataTable, StatusDot,
                  # EmptyState, ConfirmDialog, MovementForm, RequestForm, OpnameForm
  lib/
    prisma.ts  auth.ts  session.ts  permissions.ts  format.ts  audit.ts
    actions/   # movements, requests, opname, items, categories, locations,
               # suppliers, assets, users, reports
```

## Cara menjalankan

```bash
npm install
cp .env.example .env        # isi DATABASE_URL dan NEXTAUTH_SECRET
npx prisma migrate dev      # buat tabel di PostgreSQL
npm run seed                # data demo (akun demo NONAKTIF — lihat bawah)
npm run dev                 # http://localhost:3000
```

Perintah lain: `npm run build`, `npm start`, `npm run lint`,
`npx prisma studio`.

## Akun & login pertama

1. Buka aplikasi — kunjungan pertama menampilkan layar setup satu kali untuk
   membuat akun **Super Admin** (endpoint setup menolak jika Super Admin sudah
   ada; implementasi setup awal ada di `src/lib/actions/users.ts` sebagai pola
   yang sama — buat pengguna pertama lewat seed + promosikan, atau tambahkan
   route setup Anda sendiri).
2. Masuk sebagai Super Admin → **Manajemen Pengguna** → aktifkan empat akun
   demo dan atur kata sandinya:
   - Admin — `admin@stockflow.id`
   - Manager — `manager@stockflow.id`
   - Warehouse Staff — `gudang@stockflow.id`
   - Employee — `karyawan@stockflow.id`
3. Akun demo di-seed **nonaktif dengan kata sandi acak yang dibuang** — tidak
   ada kata sandi demo yang dipublikasikan di mana pun di repo ini.

## Yang sengaja tidak ada di scaffold ini

- **Tidak ada `.env` asli** — hanya `.env.example`. Jangan pernah commit
  kredensial.
- **Tidak ada kredensial demo** — lihat poin 3 di atas.
- **Ekspor PDF** memakai generator PDF minimal di server (satu halaman teks);
  untuk laporan PDF yang kaya, ganti `exportReportPdf` dengan library seperti
  `pdfkit` atau render headless.
- **Upload gambar** disimpan sebagai data URL di scaffold ini; untuk produksi
  ganti dengan object storage (mis. Supabase Storage) — validasi magic-byte
  tetap berlaku.
- **Notifikasi** masih in-app; belum ada email/WhatsApp.
- **Tidak ada impor massal CSV/Excel** dan **tidak ada pemindaian barcode/QR**
  — keduanya tercatat sebagai kekurangan di README dan bisa ditambahkan di
  atas fondasi ini.
