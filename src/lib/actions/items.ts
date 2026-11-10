"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit, snapshot } from "@/lib/audit";

const itemSchema = z.object({
  sku: z
    .string()
    .min(1, "SKU wajib diisi.")
    .max(50)
    .regex(/^[A-Z0-9-]+$/, "SKU hanya boleh huruf besar, angka, dan strip."),
  name: z.string().min(2, "Nama minimal 2 karakter.").max(200),
  description: z.string().max(1000).optional(),
  categoryId: z.string().uuid("Kategori tidak valid."),
  supplierId: z.string().uuid().optional().nullable(),
  unit: z.string().min(1).max(20),
  price: z.coerce.number().int().min(0, "Harga tidak boleh negatif."),
  minStock: z.coerce.number().int().min(0, "Stok minimum tidak boleh negatif."),
});

export async function createItem(formData: FormData) {
  try {
    const user = await requirePermission("items.create");
    const parsed = itemSchema.safeParse({
      sku: String(formData.get("sku") ?? "").trim().toUpperCase(),
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      categoryId: formData.get("categoryId"),
      supplierId: formData.get("supplierId") || null,
      unit: formData.get("unit"),
      price: formData.get("price"),
      minStock: formData.get("minStock"),
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const existing = await prisma.item.findUnique({ where: { sku: parsed.data.sku } });
    if (existing) return { ok: false as const, error: `SKU ${parsed.data.sku} sudah digunakan.` };
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({ data: parsed.data });
      await writeAudit(
        { userId: user.id, action: "Tambah item", module: "Inventaris", entityId: created.id, newValue: snapshot(parsed.data) },
        tx,
      );
      return created;
    });
    revalidatePath("/items");
    return { ok: true as const, id: item.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menambah item." };
  }
}

export async function updateItem(id: string, formData: FormData) {
  try {
    const user = await requirePermission("items.edit");
    // NOTE: updateItem cannot touch stock — balances only change via the
    // movement ledger (see src/lib/actions/movements.ts).
    const parsed = itemSchema.safeParse({
      sku: String(formData.get("sku") ?? "").trim().toUpperCase(),
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      categoryId: formData.get("categoryId"),
      supplierId: formData.get("supplierId") || null,
      unit: formData.get("unit"),
      price: formData.get("price"),
      minStock: formData.get("minStock"),
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const updated = await prisma.$transaction(async (tx) => {
      const prev = await tx.item.findUnique({ where: { id } });
      if (!prev) throw new Error("Item tidak ditemukan.");
      if (parsed.data.sku !== prev.sku) {
        const clash = await tx.item.findUnique({ where: { sku: parsed.data.sku } });
        if (clash) throw new Error(`SKU ${parsed.data.sku} sudah digunakan.`);
      }
      const result = await tx.item.update({ where: { id }, data: parsed.data });
      await writeAudit(
        { userId: user.id, action: "Ubah item", module: "Inventaris", entityId: id, prevValue: snapshot(prev), newValue: snapshot(parsed.data) },
        tx,
      );
      return result;
    });
    revalidatePath("/items");
    revalidatePath(`/items/${id}`);
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah item." };
  }
}

export async function deleteItem(id: string) {
  try {
    const user = await requirePermission("items.delete");
    await prisma.$transaction(async (tx) => {
      const prev = await tx.item.findUnique({ where: { id } });
      if (!prev) throw new Error("Item tidak ditemukan.");
      const inUse =
        (await tx.stockMovement.count({ where: { itemId: id } })) > 0 ||
        (await tx.stockRequestItem.count({ where: { itemId: id } })) > 0;
      if (inUse) {
        throw new Error("Item sudah memiliki riwayat pergerakan/permintaan — tidak bisa dihapus.");
      }
      await tx.item.delete({ where: { id } });
      await writeAudit(
        { userId: user.id, action: "Hapus item", module: "Inventaris", entityId: id, prevValue: snapshot(prev) },
        tx,
      );
    });
    revalidatePath("/items");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menghapus item." };
  }
}

/** Magic-byte check for product images (MIME type is never trusted). 2 MB max. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAGIC: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47],
  jpeg: [0xff, 0xd8, 0xff],
  webp: [0x52, 0x49, 0x46, 0x46],
  gif: [0x47, 0x49, 0x46, 0x38],
};

export function detectImageType(bytes: Uint8Array): string | null {
  for (const [kind, magic] of Object.entries(MAGIC)) {
    if (magic.every((b, i) => bytes[i] === b)) return kind;
  }
  return null;
}

export async function uploadItemImage(itemId: string, formData: FormData) {
  try {
    const user = await requirePermission("items.edit");
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false as const, error: "Tidak ada file yang diunggah." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false as const, error: "Ukuran gambar maksimal 2 MB." };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectImageType(bytes);
    if (!kind) {
      return { ok: false as const, error: "File bukan gambar PNG/JPEG/WebP/GIF yang valid." };
    }
    // Stored as a data URL in this scaffold; swap for object storage in production.
    const dataUrl = `data:image/${kind};base64,${Buffer.from(bytes).toString("base64")}`;
    await prisma.item.update({ where: { id: itemId }, data: { imageUrl: dataUrl } });
    await writeAudit({ userId: user.id, action: "Unggah gambar item", module: "Inventaris", entityId: itemId });
    revalidatePath(`/items/${itemId}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengunggah gambar." };
  }
}
