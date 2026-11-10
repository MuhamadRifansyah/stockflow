"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit, snapshot } from "@/lib/audit";

const locationSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter.").max(100),
  type: z.enum(["Gudang", "Kantor", "Cabang"]),
  address: z.string().max(300).optional(),
});

export async function createLocation(formData: FormData) {
  try {
    const user = await requirePermission("locations.manage");
    const parsed = locationSchema.safeParse({
      name: String(formData.get("name") ?? "").trim(),
      type: formData.get("type"),
      address: formData.get("address") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const loc = await prisma.$transaction(async (tx) => {
      const created = await tx.location.create({ data: parsed.data });
      await writeAudit(
        { userId: user.id, action: "Tambah lokasi", module: "Lokasi", entityId: created.id, newValue: snapshot(parsed.data) },
        tx,
      );
      return created;
    });
    revalidatePath("/locations");
    return { ok: true as const, id: loc.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menambah lokasi." };
  }
}

export async function updateLocation(id: string, formData: FormData) {
  try {
    const user = await requirePermission("locations.manage");
    const parsed = locationSchema.safeParse({
      name: String(formData.get("name") ?? "").trim(),
      type: formData.get("type"),
      address: formData.get("address") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const updated = await prisma.$transaction(async (tx) => {
      const prev = await tx.location.findUnique({ where: { id } });
      if (!prev) throw new Error("Lokasi tidak ditemukan.");
      const result = await tx.location.update({ where: { id }, data: parsed.data });
      await writeAudit(
        { userId: user.id, action: "Ubah lokasi", module: "Lokasi", entityId: id, prevValue: snapshot(prev), newValue: snapshot(parsed.data) },
        tx,
      );
      return result;
    });
    revalidatePath("/locations");
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah lokasi." };
  }
}

export async function deleteLocation(id: string) {
  try {
    const user = await requirePermission("locations.manage");
    await prisma.$transaction(async (tx) => {
      const prev = await tx.location.findUnique({ where: { id } });
      if (!prev) throw new Error("Lokasi tidak ditemukan.");
      const used =
        (await tx.stockBalance.count({ where: { locationId: id, quantity: { gt: 0 } } })) > 0 ||
        (await tx.asset.count({ where: { locationId: id } })) > 0;
      if (used) {
        throw new Error("Lokasi masih menyimpan stok atau aset — tidak bisa dihapus.");
      }
      await tx.location.delete({ where: { id } });
      await writeAudit(
        { userId: user.id, action: "Hapus lokasi", module: "Lokasi", entityId: id, prevValue: snapshot(prev) },
        tx,
      );
    });
    revalidatePath("/locations");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menghapus lokasi." };
  }
}
