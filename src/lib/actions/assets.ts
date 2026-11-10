"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit, snapshot } from "@/lib/audit";

async function nextAssetCode(): Promise<string> {
  const count = await prisma.asset.count();
  return `AST-${String(count + 1).padStart(4, "0")}`;
}

const assetSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter.").max(200),
  serialNumber: z.string().max(100).optional(),
  categoryId: z.string().uuid("Kategori tidak valid."),
  locationId: z.string().uuid("Lokasi tidak valid."),
  condition: z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT"]),
  status: z.enum(["AKTIF", "DIPINJAMKAN", "PERAWATAN", "RUSAK", "NONAKTIF"]),
  purchaseDate: z.string().optional(),
  purchasePrice: z.coerce.number().int().min(0),
  notes: z.string().max(500).optional(),
});

export async function createAsset(formData: FormData) {
  try {
    const user = await requirePermission("assets.manage");
    const parsed = assetSchema.safeParse({
      name: formData.get("name"),
      serialNumber: formData.get("serialNumber") || undefined,
      categoryId: formData.get("categoryId"),
      locationId: formData.get("locationId"),
      condition: formData.get("condition"),
      status: formData.get("status") ?? "AKTIF",
      purchaseDate: formData.get("purchaseDate") || undefined,
      purchasePrice: formData.get("purchasePrice") ?? 0,
      notes: formData.get("notes") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          ...parsed.data,
          code: await nextAssetCode(),
          purchaseDate: parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : null,
        },
      });
      await writeAudit(
        { userId: user.id, action: "Daftarkan aset", module: "Aset", entityId: created.id, newValue: snapshot(parsed.data) },
        tx,
      );
      return created;
    });
    revalidatePath("/assets");
    return { ok: true as const, id: asset.id, code: asset.code };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mendaftarkan aset." };
  }
}

export async function updateAsset(id: string, formData: FormData) {
  try {
    const user = await requirePermission("assets.manage");
    const parsed = assetSchema.safeParse({
      name: formData.get("name"),
      serialNumber: formData.get("serialNumber") || undefined,
      categoryId: formData.get("categoryId"),
      locationId: formData.get("locationId"),
      condition: formData.get("condition"),
      status: formData.get("status"),
      purchaseDate: formData.get("purchaseDate") || undefined,
      purchasePrice: formData.get("purchasePrice") ?? 0,
      notes: formData.get("notes") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const updated = await prisma.$transaction(async (tx) => {
      const prev = await tx.asset.findUnique({ where: { id } });
      if (!prev) throw new Error("Aset tidak ditemukan.");
      const result = await tx.asset.update({
        where: { id },
        data: {
          ...parsed.data,
          purchaseDate: parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : null,
        },
      });
      await writeAudit(
        { userId: user.id, action: "Ubah aset", module: "Aset", entityId: id, prevValue: snapshot(prev), newValue: snapshot(parsed.data) },
        tx,
      );
      return result;
    });
    revalidatePath("/assets");
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah aset." };
  }
}

const assignSchema = z.object({
  assetId: z.string().uuid(),
  employeeName: z.string().min(2, "Nama karyawan minimal 2 karakter.").max(100),
  note: z.string().max(500).optional(),
});

/** Assigns an asset; the asset becomes DIPINJAMKAN. */
export async function assignAsset(formData: FormData) {
  try {
    const user = await requirePermission("assets.manage");
    const parsed = assignSchema.safeParse({
      assetId: formData.get("assetId"),
      employeeName: String(formData.get("employeeName") ?? "").trim(),
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const assignment = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: parsed.data.assetId } });
      if (!asset) throw new Error("Aset tidak ditemukan.");
      if (asset.status !== "AKTIF") {
        throw new Error(`Aset berstatus ${asset.status.toLowerCase()} — tidak bisa dipinjamkan.`);
      }
      const created = await tx.assetAssignment.create({
        data: { assetId: asset.id, employeeName: parsed.data.employeeName, note: parsed.data.note ?? null, status: "DIPINJAM" },
      });
      await tx.asset.update({ where: { id: asset.id }, data: { status: "DIPINJAMKAN" } });
      await writeAudit(
        { userId: user.id, action: "Tugaskan aset", module: "Aset", entityId: asset.id, newValue: snapshot(parsed.data) },
        tx,
      );
      return created;
    });
    revalidatePath("/assets");
    revalidatePath("/assignments");
    return { ok: true as const, id: assignment.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menugaskan aset." };
  }
}

const returnSchema = z.object({
  assignmentId: z.string().uuid(),
  condition: z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT"]),
  note: z.string().max(500).optional(),
});

/** Returns an asset with its condition; the asset goes back to AKTIF (or PERAWATAN if damaged). */
export async function returnAsset(formData: FormData) {
  try {
    const user = await requirePermission("assets.manage");
    const parsed = returnSchema.safeParse({
      assignmentId: formData.get("assignmentId"),
      condition: formData.get("condition"),
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const updated = await prisma.$transaction(async (tx) => {
      const assignment = await tx.assetAssignment.findUnique({
        where: { id: parsed.data.assignmentId },
        include: { asset: true },
      });
      if (!assignment) throw new Error("Penugasan tidak ditemukan.");
      if (assignment.status !== "DIPINJAM") throw new Error("Aset ini sudah dikembalikan.");
      const result = await tx.assetAssignment.update({
        where: { id: assignment.id },
        data: {
          status: "DIKEMBALIKAN",
          returnedAt: new Date(),
          returnCondition: parsed.data.condition,
          note: parsed.data.note ?? assignment.note,
        },
      });
      await tx.asset.update({
        where: { id: assignment.assetId },
        data: {
          condition: parsed.data.condition,
          status: parsed.data.condition === "BAIK" ? "AKTIF" : "PERAWATAN",
        },
      });
      await writeAudit(
        { userId: user.id, action: "Kembalikan aset", module: "Aset", entityId: assignment.assetId, newValue: snapshot({ condition: parsed.data.condition }) },
        tx,
      );
      return result;
    });
    revalidatePath("/assets");
    revalidatePath("/assignments");
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengembalikan aset." };
  }
}

/** Starts / ends maintenance on an asset. */
export async function setAssetMaintenance(assetId: string, start: boolean) {
  try {
    const user = await requirePermission("assets.manage");
    const updated = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: assetId } });
      if (!asset) throw new Error("Aset tidak ditemukan.");
      if (start && asset.status === "DIPINJAMKAN") {
        throw new Error("Aset sedang dipinjam — tidak bisa masuk perawatan.");
      }
      const result = await tx.asset.update({
        where: { id: assetId },
        data: { status: start ? "PERAWATAN" : "AKTIF" },
      });
      await writeAudit(
        { userId: user.id, action: start ? "Mulai perawatan aset" : "Selesai perawatan aset", module: "Aset", entityId: assetId },
        tx,
      );
      return result;
    });
    revalidatePath("/assets");
    return { ok: true as const, id: updated.id, status: updated.status };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah status perawatan." };
  }
}
