"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit, snapshot } from "@/lib/audit";

const nameSchema = z.string().min(2, "Nama minimal 2 karakter.").max(100);

export async function createCategory(formData: FormData) {
  try {
    const user = await requirePermission("categories.manage");
    const name = nameSchema.safeParse(String(formData.get("name") ?? "").trim());
    if (!name.success) return { ok: false as const, error: name.error.issues[0]?.message };
    const existing = await prisma.category.findUnique({ where: { name: name.data } });
    if (existing) return { ok: false as const, error: "Kategori sudah ada." };
    const cat = await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({ data: { name: name.data } });
      await writeAudit(
        { userId: user.id, action: "Tambah kategori", module: "Kategori", entityId: created.id, newValue: snapshot({ name: name.data }) },
        tx,
      );
      return created;
    });
    revalidatePath("/categories");
    return { ok: true as const, id: cat.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menambah kategori." };
  }
}

export async function renameCategory(id: string, formData: FormData) {
  try {
    const user = await requirePermission("categories.manage");
    const name = nameSchema.safeParse(String(formData.get("name") ?? "").trim());
    if (!name.success) return { ok: false as const, error: name.error.issues[0]?.message };
    const updated = await prisma.$transaction(async (tx) => {
      const prev = await tx.category.findUnique({ where: { id } });
      if (!prev) throw new Error("Kategori tidak ditemukan.");
      const result = await tx.category.update({ where: { id }, data: { name: name.data } });
      await writeAudit(
        { userId: user.id, action: "Ubah kategori", module: "Kategori", entityId: id, prevValue: snapshot(prev), newValue: snapshot({ name: name.data }) },
        tx,
      );
      return result;
    });
    revalidatePath("/categories");
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah kategori." };
  }
}

export async function deleteCategory(id: string) {
  try {
    const user = await requirePermission("categories.manage");
    await prisma.$transaction(async (tx) => {
      const prev = await tx.category.findUnique({ where: { id } });
      if (!prev) throw new Error("Kategori tidak ditemukan.");
      const usedByItems = await tx.item.count({ where: { categoryId: id } });
      const usedByAssets = await tx.asset.count({ where: { categoryId: id } });
      if (usedByItems > 0 || usedByAssets > 0) {
        throw new Error(
          `Kategori masih digunakan oleh ${usedByItems} item dan ${usedByAssets} aset — tidak bisa dihapus.`,
        );
      }
      await tx.category.delete({ where: { id } });
      await writeAudit(
        { userId: user.id, action: "Hapus kategori", module: "Kategori", entityId: id, prevValue: snapshot(prev) },
        tx,
      );
    });
    revalidatePath("/categories");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menghapus kategori." };
  }
}
