"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export const EXPORT_MAX_ROWS = 5_000;

export type ReportFilter = {
  from?: Date;
  to?: Date;
  categoryId?: string;
  locationId?: string;
};

/** All 7 reports, computed live from stored data. */
export async function getReports(filter: ReportFilter = {}) {
  const user = await requirePermission("reports.view");
  void user;

  const whereItem = filter.categoryId ? { categoryId: filter.categoryId } : {};
  const whereMovement = {
    ...(filter.from || filter.to
      ? { createdAt: { gte: filter.from, lte: filter.to } }
      : {}),
  };

  const [items, balances, movements, assets, assignments, requests, opnames] =
    await Promise.all([
      prisma.item.findMany({
        where: whereItem,
        include: { category: true, supplier: true, balances: true },
        orderBy: { name: "asc" },
      }),
      prisma.stockBalance.findMany({
        where: filter.locationId ? { locationId: filter.locationId } : {},
        include: { item: true, location: true },
      }),
      prisma.stockMovement.findMany({
        where: whereMovement,
        include: { item: true, createdBy: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.asset.findMany({
        where: filter.categoryId ? { categoryId: filter.categoryId } : {},
        include: { category: true, location: true },
        orderBy: { code: "asc" },
      }),
      prisma.assetAssignment.findMany({
        include: { asset: true },
        orderBy: { assignedAt: "desc" },
      }),
      prisma.stockRequest.findMany({
        include: { requester: true, items: { include: { item: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.stockOpname.findMany({
        include: { location: true, details: { include: { item: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const totalQty = balances.reduce((s, b) => s + b.quantity, 0);
  const inventoryValue = items.reduce(
    (s, it) =>
      s + it.price * it.balances.reduce((q, b) => q + b.quantity, 0),
    0,
  );
  const lowStock = items
    .map((it) => ({
      ...it,
      totalQty: it.balances.reduce((q, b) => q + b.quantity, 0),
    }))
    .filter((it) => it.totalQty <= it.minStock);
  const assetValue = assets.reduce((s, a) => s + a.purchasePrice, 0);
  const opnameDiscrepancies = opnames.flatMap((o) =>
    o.details
      .filter((d) => d.difference !== 0)
      .map((d) => ({ opnameId: o.id, location: o.location.name, item: d.item, ...d })),
  );

  return {
    currentInventory: items.map((it) => ({
      ...it,
      totalQty: it.balances.reduce((q, b) => q + b.quantity, 0),
    })),
    lowStock,
    movements,
    assetRegister: assets,
    assetAssignments: assignments,
    valuation: {
      totalQty,
      inventoryValue,
      assetValue,
      byCategory: items.reduce<Record<string, number>>((acc, it) => {
        const qty = it.balances.reduce((q, b) => q + b.quantity, 0);
        acc[it.category.name] = (acc[it.category.name] ?? 0) + it.price * qty;
        return acc;
      }, {}),
    },
    opnameDiscrepancies,
    requestSummary: {
      total: requests.length,
      menunggu: requests.filter((r) => r.status === "MENUNGGU").length,
      disetujui: requests.filter((r) => r.status === "DISETUJUI").length,
      diproses: requests.filter((r) => r.status === "DIPROSES").length,
      selesai: requests.filter((r) => r.status === "SELESAI").length,
      ditolak: requests.filter((r) => r.status === "DITOLAK").length,
    },
  };
}

export type ReportKind =
  | "inventaris"
  | "stok-menipis"
  | "pergerakan"
  | "aset"
  | "penugasan-aset"
  | "valuasi"
  | "selisih-opname";

/** Builds a SpreadsheetML (.xls) export. Capped at 5,000 rows, audit-logged. */
export async function exportReportExcel(kind: ReportKind): Promise<{ ok: true; filename: string; content: string } | { ok: false; error: string }> {
  try {
    const user = await requirePermission("reports.export");
    const data = await getReports();
    const rows: string[][] = [];
    switch (kind) {
      case "inventaris":
        rows.push(["SKU", "Nama Item", "Kategori", "Stok", "Min.", "Satuan", "Harga", "Nilai"]);
        data.currentInventory.slice(0, EXPORT_MAX_ROWS).forEach((it) =>
          rows.push([
            it.sku, it.name, it.category.name,
            String(it.totalQty), String(it.minStock), it.unit,
            String(it.price), String(it.price * it.totalQty),
          ]),
        );
        break;
      case "stok-menipis":
        rows.push(["SKU", "Nama Item", "Kategori", "Stok", "Min.", "Satuan"]);
        data.lowStock.slice(0, EXPORT_MAX_ROWS).forEach((it) =>
          rows.push([it.sku, it.name, it.category.name, String(it.totalQty), String(it.minStock), it.unit]),
        );
        break;
      case "pergerakan":
        rows.push(["Kode", "Item", "Jenis", "Jumlah", "Tanggal"]);
        data.movements.slice(0, EXPORT_MAX_ROWS).forEach((m) =>
          rows.push([m.code, m.item.name, m.type, String(m.quantity), m.createdAt.toISOString()]),
        );
        break;
      case "aset":
        rows.push(["Kode", "Aset", "Kategori", "Lokasi", "Kondisi", "Status", "Harga Beli"]);
        data.assetRegister.slice(0, EXPORT_MAX_ROWS).forEach((a) =>
          rows.push([a.code, a.name, a.category.name, a.location.name, a.condition, a.status, String(a.purchasePrice)]),
        );
        break;
      case "penugasan-aset":
        rows.push(["Aset", "Karyawan", "Ditugaskan", "Dikembalikan", "Status"]);
        data.assetAssignments.slice(0, EXPORT_MAX_ROWS).forEach((a) =>
          rows.push([
            a.asset.name, a.employeeName, a.assignedAt.toISOString(),
            a.returnedAt ? a.returnedAt.toISOString() : "-", a.status,
          ]),
        );
        break;
      case "valuasi":
        rows.push(["Kategori", "Nilai Persediaan (IDR)"]);
        Object.entries(data.valuation.byCategory).forEach(([cat, val]) =>
          rows.push([cat, String(val)]),
        );
        rows.push(["TOTAL", String(data.valuation.inventoryValue)]);
        break;
      case "selisih-opname":
        rows.push(["Lokasi", "Item", "Stok Sistem", "Hitung Fisik", "Selisih"]);
        data.opnameDiscrepancies.slice(0, EXPORT_MAX_ROWS).forEach((d) =>
          rows.push([d.location, d.item.name, String(d.systemQty), String(d.physicalQty ?? ""), String(d.difference)]),
        );
        break;
    }
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Laporan"><Table>`,
      ...rows.map(
        (r) =>
          `<Row>${r
            .map((c) =>
              /^-?\d+(\.\d+)?$/.test(c)
                ? `<Cell><Data ss:Type="Number">${c}</Data></Cell>`
                : `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`,
            )
            .join("")}</Row>`,
      ),
      `</Table></Worksheet></Workbook>`,
    ].join("");
    await writeAudit({
      userId: user.id,
      action: "Ekspor laporan Excel",
      module: "Laporan",
      entityId: kind,
      newValue: `report: ${kind}`,
    });
    return { ok: true, filename: `stockflow-${kind}.xls`, content: xml };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal mengekspor laporan." };
  }
}

/** Builds a minimal server-generated PDF export (same gating and cap). */
export async function exportReportPdf(kind: ReportKind): Promise<{ ok: true; filename: string; content: string } | { ok: false; error: string }> {
  try {
    const user = await requirePermission("reports.export");
    const data = await getReports();
    const lines: string[] = [`StockFlow — Laporan ${kind}`, ""];
    if (kind === "inventaris") {
      data.currentInventory.slice(0, EXPORT_MAX_ROWS).forEach((it) =>
        lines.push(`${it.sku} | ${it.name} | ${it.totalQty} ${it.unit} | Rp ${it.price * it.totalQty}`),
      );
    } else if (kind === "valuasi") {
      lines.push(`Nilai inventaris: Rp ${data.valuation.inventoryValue}`);
      lines.push(`Nilai aset: Rp ${data.valuation.assetValue}`);
      Object.entries(data.valuation.byCategory).forEach(([cat, val]) =>
        lines.push(`${cat}: Rp ${val}`),
      );
    } else {
      lines.push(`Total baris tersedia: ${kind === "pergerakan" ? data.movements.length : data.currentInventory.length}`);
    }
    // Minimal valid PDF with one text page (Helvetica, 12pt).
    const text = lines.map((l) => l.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")).join("\n");
    const contentStream = `BT /F1 11 Tf 40 780 Td 14 TL (${text.split("\n").join(") Tj T* (")}) Tj ET`;
    const objects = [
      `<< /Type /Catalog /Pages 2 0 R >>`,
      `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
      `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((obj, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((o) => {
      pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    await writeAudit({
      userId: user.id,
      action: "Ekspor laporan PDF",
      module: "Laporan",
      entityId: kind,
      newValue: `report: ${kind}`,
    });
    return { ok: true, filename: `stockflow-${kind}.pdf`, content: pdf };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal mengekspor laporan." };
  }
}
