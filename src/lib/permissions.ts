// 27-permission catalog + role map. Must match prisma/seed.ts exactly.
// Permission counts: Super Admin 27 · Admin 26 · Warehouse Staff 16 ·
// Manager 12 · Employee 5. Super Admin is locked and cannot be edited.

// Client-safe: this module has NO server imports, so client components
// (Sidebar) may import the catalog and hasPermission from it.
// Session helpers live in src/lib/session.ts.

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
};

export const PERMISSIONS = [
  { key: "dashboard.view", label: "Lihat Dashboard", module: "dashboard" },
  { key: "items.view", label: "Lihat Item", module: "items" },
  { key: "items.create", label: "Tambah Item", module: "items" },
  { key: "items.edit", label: "Ubah Item", module: "items" },
  { key: "items.delete", label: "Hapus Item", module: "items" },
  { key: "categories.manage", label: "Kelola Kategori", module: "categories" },
  { key: "locations.manage", label: "Kelola Lokasi", module: "locations" },
  { key: "movements.view", label: "Lihat Pergerakan Stok", module: "movements" },
  { key: "movements.create", label: "Catat Pergerakan Stok", module: "movements" },
  { key: "assets.view", label: "Lihat Aset", module: "assets" },
  { key: "assets.manage", label: "Kelola Aset", module: "assets" },
  { key: "requests.view", label: "Lihat Permintaan Stok", module: "requests" },
  { key: "requests.create", label: "Buat Permintaan Stok", module: "requests" },
  { key: "requests.approve", label: "Setujui / Tolak Permintaan", module: "requests" },
  { key: "requests.process", label: "Proses Permintaan (Gudang)", module: "requests" },
  { key: "opname.view", label: "Lihat Stok Opname", module: "opname" },
  { key: "opname.manage", label: "Kelola Sesi Opname", module: "opname" },
  { key: "opname.approve", label: "Setujui Penyesuaian Opname", module: "opname" },
  { key: "suppliers.view", label: "Lihat Pemasok", module: "suppliers" },
  { key: "suppliers.manage", label: "Kelola Pemasok & Pembelian", module: "suppliers" },
  { key: "reports.view", label: "Lihat Laporan", module: "reports" },
  { key: "reports.export", label: "Ekspor Laporan (Excel / PDF)", module: "reports" },
  { key: "users.view", label: "Lihat Pengguna", module: "users" },
  { key: "users.manage", label: "Kelola Pengguna", module: "users" },
  { key: "roles.manage", label: "Kelola Peran & Izin", module: "roles" },
  { key: "audit.view", label: "Lihat Log Audit", module: "audit" },
  { key: "settings.manage", label: "Kelola Pengaturan", module: "settings" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Super Admin": [...ALL_PERMISSION_KEYS],
  Admin: ALL_PERMISSION_KEYS.filter((k) => k !== "roles.manage"),
  "Warehouse Staff": [
    "dashboard.view", "items.view", "items.create", "items.edit",
    "movements.view", "movements.create",
    "assets.view", "assets.manage",
    "requests.view", "requests.process",
    "opname.view", "opname.manage",
    "suppliers.view", "suppliers.manage",
    "reports.view", "audit.view",
  ],
  Manager: [
    "dashboard.view", "items.view", "movements.view", "assets.view",
    "requests.view", "requests.approve",
    "opname.view", "opname.approve",
    "suppliers.view", "reports.view", "reports.export", "audit.view",
  ],
  Employee: [
    "dashboard.view", "items.view", "movements.view",
    "requests.view", "requests.create",
  ],
};

export const PERMISSION_COUNT_BY_ROLE: Record<string, number> = {
  "Super Admin": 27,
  Admin: 26,
  "Warehouse Staff": 16,
  Manager: 12,
  Employee: 5,
};

export function hasPermission(user: SessionUser | null, key: string): boolean {
  return !!user && user.permissions.includes(key);
}
