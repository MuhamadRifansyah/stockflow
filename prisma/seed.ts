// StockFlow seed — idempotent demo data.
// Demo accounts are seeded INACTIVE with random discarded passwords: a Super
// Admin must activate them and set passwords from Manajemen Pengguna.
// Run: npm run seed   (requires DATABASE_URL; never run against production)

import { PrismaClient, MovementType } from "@prisma/client";
import { randomBytes, pbkdf2Sync } from "node:crypto";

const prisma = new PrismaClient();

// --- 27-permission catalog (must match src/lib/permissions.ts) ---
const PERMISSIONS: { key: string; label: string; module: string }[] = [
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
];

const ROLE_PERMS: Record<string, string[]> = {
  "Super Admin": PERMISSIONS.map((p) => p.key), // 27 — locked
  Admin: PERMISSIONS.map((p) => p.key).filter((k) => k !== "roles.manage"), // 26
  "Warehouse Staff": [
    "dashboard.view", "items.view", "items.create", "items.edit",
    "movements.view", "movements.create",
    "assets.view", "assets.manage",
    "requests.view", "requests.process",
    "opname.view", "opname.manage",
    "suppliers.view", "suppliers.manage",
    "reports.view", "audit.view",
  ], // 16
  Manager: [
    "dashboard.view", "items.view", "movements.view", "assets.view",
    "requests.view", "requests.approve",
    "opname.view", "opname.approve",
    "suppliers.view", "reports.view", "reports.export", "audit.view",
  ], // 12
  Employee: [
    "dashboard.view", "items.view", "movements.view",
    "requests.view", "requests.create",
  ], // 5
};

function discardedPasswordHash(): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(randomBytes(32).toString("hex"), salt, 120_000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`; // random — nobody knows it; Super Admin must reset it
}

async function main() {
  // --- Permissions & roles ---
  const permByKey = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const rec = await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, module: p.module },
      create: p,
    });
    permByKey.set(p.key, rec.id);
  }
  const roleByName = new Map<string, string>();
  for (const [name, keys] of Object.entries(ROLE_PERMS)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { isLocked: name === "Super Admin" },
      create: { name, isLocked: name === "Super Admin" },
    });
    roleByName.set(name, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: keys.map((k) => ({ roleId: role.id, permissionId: permByKey.get(k)! })),
    });
  }

  // --- Demo accounts (INACTIVE, random discarded password) ---
  const demos = [
    { name: "Sari Wulandari", email: "admin@stockflow.id", role: "Admin" },
    { name: "Rina Amelia", email: "manager@stockflow.id", role: "Manager" },
    { name: "Dedi Kurniawan", email: "gudang@stockflow.id", role: "Warehouse Staff" },
    { name: "Fajar Nugroho", email: "karyawan@stockflow.id", role: "Employee" },
  ];
  const userByEmail = new Map<string, string>();
  for (const d of demos) {
    const u = await prisma.user.upsert({
      where: { email: d.email },
      update: { name: d.name, roleId: roleByName.get(d.role)!, isActive: false },
      create: {
        name: d.name,
        email: d.email,
        passwordHash: discardedPasswordHash(),
        roleId: roleByName.get(d.role)!,
        isActive: false,
      },
    });
    userByEmail.set(d.email, u.id);
  }
  const dedi = userByEmail.get("gudang@stockflow.id")!;
  const rina = userByEmail.get("manager@stockflow.id")!;
  const fajar = userByEmail.get("karyawan@stockflow.id")!;

  // --- Categories ---
  const catNames = ["ATK & Perlengkapan Kantor", "Elektronik", "Peralatan IT", "Furnitur Kantor"];
  const catByName = new Map<string, string>();
  for (const name of catNames) {
    const c = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    catByName.set(name, c.id);
  }

  // --- Locations ---
  const locData = [
    { name: "Gudang Utama — Jakarta", type: "Gudang" },
    { name: "Gudang Cabang — Bekasi", type: "Gudang" },
    { name: "Kantor Pusat — Ruang IT", type: "Kantor" },
  ];
  const locByName = new Map<string, string>();
  for (const l of locData) {
    const loc = await prisma.location.upsert({
      where: { name: l.name },
      update: { type: l.type },
      create: l,
    });
    locByName.set(l.name, loc.id);
  }
  const gudangUtama = locByName.get("Gudang Utama — Jakarta")!;
  const gudangBekasi = locByName.get("Gudang Cabang — Bekasi")!;
  const ruangIT = locByName.get("Kantor Pusat — Ruang IT")!;

  // --- Suppliers ---
  const supData = [
    { name: "PT Gramedia Sarana ATK", contact: "Andi Prasetyo", email: "b2b@gramediasarana.co.id" },
    { name: "PT Sinar Abadi Elektronik", contact: "Budi Hartono", email: "sales@sinarabadi.co.id" },
    { name: "CV Mitra Komputindo", contact: "Sari Wulandari", email: "order@mitrakomputindo.id" },
  ];
  const supByName = new Map<string, string>();
  for (const s of supData) {
    const sup = await prisma.supplier.upsert({
      where: { name: s.name },
      update: { contact: s.contact, email: s.email },
      create: s,
    });
    supByName.set(s.name, sup.id);
  }

  // --- Items (14 SKUs) ---
  const items = [
    { sku: "ATK-BAT-AA", name: "Baterai AA Alkaline (isi 4)", cat: "ATK & Perlengkapan Kantor", sup: "PT Gramedia Sarana ATK", unit: "pak", price: 45000, minStock: 30 },
    { sku: "ELK-CBL-001", name: "Kabel HDMI 2.1 — 2 meter", cat: "Elektronik", sup: "PT Sinar Abadi Elektronik", unit: "pcs", price: 145000, minStock: 30 },
    { sku: "ATK-PPR-A4", name: "Kertas HVS A4 80gsm", cat: "ATK & Perlengkapan Kantor", sup: "PT Gramedia Sarana ATK", unit: "rim", price: 55000, minStock: 40 },
    { sku: "ELK-MOU-002", name: "Mouse Wireless 2.4GHz", cat: "Peralatan IT", sup: "CV Mitra Komputindo", unit: "pcs", price: 189000, minStock: 60 },
    { sku: "ELK-MON-024", name: "Monitor LED 24 inci Full HD", cat: "Elektronik", sup: "PT Sinar Abadi Elektronik", unit: "unit", price: 1850000, minStock: 5 },
    { sku: "ATK-PEN-BLK", name: "Pulpen Gel Hitam 0.5mm", cat: "ATK & Perlengkapan Kantor", sup: "PT Gramedia Sarana ATK", unit: "pcs", price: 8500, minStock: 50 },
    { sku: "IT-KBD-003", name: "Keyboard Mechanical RGB", cat: "Peralatan IT", sup: "CV Mitra Komputindo", unit: "pcs", price: 750000, minStock: 10 },
    { sku: "FRN-CHR-001", name: "Kursi Kantor Ergonomis", cat: "Furnitur Kantor", sup: "CV Mitra Komputindo", unit: "unit", price: 2400000, minStock: 3 },
    { sku: "ELK-PRJ-001", name: "Proyektor LED 1080p", cat: "Elektronik", sup: "PT Sinar Abadi Elektronik", unit: "unit", price: 5200000, minStock: 2 },
    { sku: "ATK-FLD-A4", name: "Map Plastik A4 (isi 12)", cat: "ATK & Perlengkapan Kantor", sup: "PT Gramedia Sarana ATK", unit: "pak", price: 32000, minStock: 25 },
    { sku: "IT-SSD-001", name: "SSD NVMe 1TB", cat: "Peralatan IT", sup: "CV Mitra Komputindo", unit: "pcs", price: 1250000, minStock: 20 },
    { sku: "IT-RAM-008", name: "RAM DDR4 8GB 3200MHz", cat: "Peralatan IT", sup: "CV Mitra Komputindo", unit: "pcs", price: 420000, minStock: 10 },
    { sku: "FRN-DSK-002", name: "Meja Kerja 120x60cm", cat: "Furnitur Kantor", sup: "CV Mitra Komputindo", unit: "unit", price: 1850000, minStock: 2 },
    { sku: "ELK-SPK-001", name: "Speaker Bluetooth Portable", cat: "Elektronik", sup: "PT Sinar Abadi Elektronik", unit: "pcs", price: 350000, minStock: 10 },
  ];
  const itemBySku = new Map<string, string>();
  for (const it of items) {
    const rec = await prisma.item.upsert({
      where: { sku: it.sku },
      update: {
        name: it.name, categoryId: catByName.get(it.cat)!, supplierId: supByName.get(it.sup)!,
        unit: it.unit, price: it.price, minStock: it.minStock,
      },
      create: {
        sku: it.sku, name: it.name, categoryId: catByName.get(it.cat)!,
        supplierId: supByName.get(it.sup)!, unit: it.unit, price: it.price, minStock: it.minStock,
      },
    });
    itemBySku.set(it.sku, rec.id);
  }

  // --- Movements (18) + derived balances ---
  // Helper applies one ledger entry atomically (same invariant as the app).
  async function postMovement(m: {
    code: string; sku: string; type: MovementType; qty: number;
    fromId?: string | null; toId?: string | null; note?: string; by: string;
  }) {
    await prisma.$transaction(async (tx) => {
      // qty is the signed delta applied at the "primary" location:
      // MASUK/KELUAR/PENYESUAIAN -> toId (or fromId for KELUAR); TRANSFER moves qty out of fromId into toId.
      const primaryLoc = m.type === "KELUAR" ? m.fromId : m.toId;
      let balanceAfter: number | null = null;
      if (m.type === "TRANSFER") {
        const from = await tx.stockBalance.upsert({
          where: { itemId_locationId: { itemId: itemBySku.get(m.sku)!, locationId: m.fromId! } },
          update: { quantity: { decrement: m.qty } },
          create: { itemId: itemBySku.get(m.sku)!, locationId: m.fromId!, quantity: -m.qty },
        });
        balanceAfter = from.quantity;
        await tx.stockBalance.upsert({
          where: { itemId_locationId: { itemId: itemBySku.get(m.sku)!, locationId: m.toId! } },
          update: { quantity: { increment: m.qty } },
          create: { itemId: itemBySku.get(m.sku)!, locationId: m.toId!, quantity: m.qty },
        });
      } else {
        const signed = m.type === "MASUK" ? m.qty : -m.qty; // PENYESUAIAN qty is already signed
        const delta = m.type === "PENYESUAIAN" ? m.qty : signed;
        const bal = await tx.stockBalance.upsert({
          where: { itemId_locationId: { itemId: itemBySku.get(m.sku)!, locationId: primaryLoc! } },
          update: { quantity: { increment: delta } },
          create: { itemId: itemBySku.get(m.sku)!, locationId: primaryLoc!, quantity: delta },
        });
        balanceAfter = bal.quantity;
      }
      await tx.stockMovement.upsert({
        where: { code: m.code },
        update: {},
        create: {
          code: m.code, itemId: itemBySku.get(m.sku)!, type: m.type,
          quantity: m.type === "MASUK" || m.type === "PENYESUAIAN" ? m.qty : -m.qty,
          fromLocationId: m.fromId ?? null, toLocationId: m.toId ?? null,
          balanceAfter, note: m.note ?? null, createdById: m.by,
        },
      });
    });
  }

  const GU = gudangUtama;
  const movements: Parameters<typeof postMovement>[0][] = [
    { code: "TRX-2026-1091", sku: "ATK-BAT-AA", type: "MASUK", qty: 88, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1092", sku: "ELK-CBL-001", type: "MASUK", qty: 205, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1093", sku: "ATK-PPR-A4", type: "MASUK", qty: 30, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1094", sku: "ELK-MOU-002", type: "MASUK", qty: 58, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1095", sku: "ELK-MON-024", type: "MASUK", qty: 23, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1096", sku: "ATK-PEN-BLK", type: "MASUK", qty: 150, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1097", sku: "IT-KBD-003", type: "MASUK", qty: 35, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1098", sku: "FRN-CHR-001", type: "MASUK", qty: 9, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1099", sku: "ELK-PRJ-001", type: "MASUK", qty: 4, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1100", sku: "ATK-FLD-A4", type: "MASUK", qty: 12, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1103", sku: "IT-SSD-001", type: "MASUK", qty: 17, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1104", sku: "IT-RAM-008", type: "MASUK", qty: 26, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1105", sku: "FRN-DSK-002", type: "MASUK", qty: 6, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1106", sku: "ELK-SPK-001", type: "MASUK", qty: 21, toId: GU, note: "Stok awal", by: dedi },
    { code: "TRX-2026-1101", sku: "ELK-CBL-001", type: "KELUAR", qty: 60, fromId: GU, note: "Pemakaian tim IT", by: dedi },
    { code: "TRX-2026-1102", sku: "ATK-PPR-A4", type: "KELUAR", qty: 18, fromId: GU, note: "Kebutuhan cetak laporan bulanan", by: rina },
    { code: "TRX-2026-1107", sku: "ELK-MOU-002", type: "TRANSFER", qty: 20, fromId: GU, toId: gudangBekasi, note: "Pemerataan stok cabang", by: dedi },
    { code: "TRX-2026-1108", sku: "IT-KBD-003", type: "PENYESUAIAN", qty: -1, toId: GU, note: "Koreksi hitung fisik", by: dedi },
    { code: "TRX-2026-1109", sku: "ATK-FLD-A4", type: "KELUAR", qty: 12, fromId: GU, note: "Distribusi ke divisi", by: dedi },
  ];
  // Only seed movements when the table is empty (never overwrite live data).
  const existingMovements = await prisma.stockMovement.count();
  if (existingMovements === 0) {
    for (const m of movements) await postMovement(m);
  }

  // --- Assets (8) ---
  const assets = [
    { code: "AST-0001", name: "Laptop Bisnis 14 inci — ThinkPad T14", sn: "SN-LTP-88A102", cat: "Peralatan IT", loc: ruangIT, cond: "BAIK" as const, status: "DIPINJAMKAN" as const, price: 14250000, date: new Date("2024-03-15") },
    { code: "AST-0002", name: "Laptop Bisnis 14 inci — ThinkPad T14", sn: "SN-LTP-88A117", cat: "Peralatan IT", loc: ruangIT, cond: "BAIK" as const, status: "AKTIF" as const, price: 14250000, date: new Date("2024-03-15") },
    { code: "AST-0003", name: "Monitor LED 27 inci QHD", sn: "SN-MON-27Q551", cat: "Elektronik", loc: ruangIT, cond: "BAIK" as const, status: "DIPINJAMKAN" as const, price: 3290000, date: new Date("2024-06-02") },
    { code: "AST-0004", name: "Printer Laser Multifungsi", sn: "SN-PRN-LJ2044", cat: "Elektronik", loc: gudangUtama, cond: "RUSAK_RINGAN" as const, status: "PERAWATAN" as const, price: 4750000, date: new Date("2023-11-20") },
    { code: "AST-0005", name: "Kursi Kantor Ergonomis", sn: "SN-CHR-ERG021", cat: "Furnitur Kantor", loc: ruangIT, cond: "BAIK" as const, status: "AKTIF" as const, price: 2400000, date: new Date("2024-01-10") },
    { code: "AST-0006", name: "Switch Jaringan 24 Port", sn: "SN-SW-24G110", cat: "Peralatan IT", loc: ruangIT, cond: "BAIK" as const, status: "AKTIF" as const, price: 3150000, date: new Date("2024-02-28") },
    { code: "AST-0007", name: "Meja Kerja 120x60cm", sn: "SN-DSK-120060", cat: "Furnitur Kantor", loc: gudangBekasi, cond: "BAIK" as const, status: "AKTIF" as const, price: 1850000, date: new Date("2023-09-05") },
    { code: "AST-0008", name: "UPS 1500VA Online", sn: "SN-UPS-1500A", cat: "Elektronik", loc: gudangUtama, cond: "RUSAK_BERAT" as const, status: "RUSAK" as const, price: 7875000, date: new Date("2023-08-20") },
  ];
  const assetByCode = new Map<string, string>();
  for (const a of assets) {
    const rec = await prisma.asset.upsert({
      where: { code: a.code },
      update: {},
      create: {
        code: a.code, name: a.name, serialNumber: a.sn,
        categoryId: catByName.get(a.cat)!, locationId: a.loc,
        condition: a.cond, status: a.status,
        purchasePrice: a.price, purchaseDate: a.date,
      },
    });
    assetByCode.set(a.code, rec.id);
  }

  // --- Assignments (2, still out) ---
  const existingAssignments = await prisma.assetAssignment.count();
  if (existingAssignments === 0) {
    await prisma.assetAssignment.createMany({
      data: [
        { assetId: assetByCode.get("AST-0001")!, employeeName: "Fajar Nugroho", status: "DIPINJAM", note: "oleh Sistem (data awal)" },
        { assetId: assetByCode.get("AST-0003")!, employeeName: "Maya Putri", status: "DIPINJAM", note: "oleh Sistem (data awal)" },
      ],
    });
  }

  // --- Stock requests (2) ---
  const existingRequests = await prisma.stockRequest.count();
  if (existingRequests === 0) {
    await prisma.stockRequest.create({
      data: {
        code: "REQ-2026-000101",
        requesterId: fajar,
        purpose: "Kebutuhan operasional harian kantor pusat",
        status: "MENUNGGU",
        createdAt: new Date("2026-11-09T14:30:00+07:00"),
        items: {
          create: [
            { itemId: itemBySku.get("ELK-CBL-001")!, quantity: 5 },
            { itemId: itemBySku.get("ELK-MON-024")!, quantity: 2 },
          ],
        },
      },
    });
    await prisma.stockRequest.create({
      data: {
        code: "REQ-2026-000102",
        requesterId: fajar,
        purpose: "Persiapan ruang kerja karyawan baru",
        status: "DISETUJUI",
        approvedById: rina,
        createdAt: new Date("2026-11-08T14:30:00+07:00"),
        items: {
          create: [{ itemId: itemBySku.get("ELK-MOU-002")!, quantity: 3 }],
        },
      },
    });
  }

  console.log("Seed selesai: 5 peran, 27 izin, 4 kategori, 3 lokasi, 3 pemasok, 14 item, 18 pergerakan, 8 aset, 2 penugasan, 2 permintaan.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
