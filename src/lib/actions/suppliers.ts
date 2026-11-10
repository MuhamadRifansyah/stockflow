"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit, snapshot } from "@/lib/audit";
import { applyMovement } from "@/lib/actions/movements";

const supplierSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter.").max(200),
  contact: z.string().max(100).optional(),
  email: z.string().email("Email tidak valid.").optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
});

export async function createSupplier(formData: FormData) {
  try {
    const user = await requirePermission("suppliers.manage");
    const parsed = supplierSchema.safeParse({
      name: String(formData.get("name") ?? "").trim(),
      contact: formData.get("contact") || undefined,
      email: formData.get("email") || undefined,
      phone: formData.get("phone") || undefined,
      address: formData.get("address") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const sup = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: { ...parsed.data, email: parsed.data.email || null },
      });
      await writeAudit(
        { userId: user.id, action: "Tambah pemasok", module: "Pemasok", entityId: created.id, newValue: snapshot(parsed.data) },
        tx,
      );
      return created;
    });
    revalidatePath("/suppliers");
    return { ok: true as const, id: sup.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menambah pemasok." };
  }
}

export async function updateSupplier(id: string, formData: FormData) {
  try {
    const user = await requirePermission("suppliers.manage");
    const parsed = supplierSchema.safeParse({
      name: String(formData.get("name") ?? "").trim(),
      contact: formData.get("contact") || undefined,
      email: formData.get("email") || undefined,
      phone: formData.get("phone") || undefined,
      address: formData.get("address") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const updated = await prisma.$transaction(async (tx) => {
      const prev = await tx.supplier.findUnique({ where: { id } });
      if (!prev) throw new Error("Pemasok tidak ditemukan.");
      const result = await tx.supplier.update({
        where: { id },
        data: { ...parsed.data, email: parsed.data.email || null },
      });
      await writeAudit(
        { userId: user.id, action: "Ubah pemasok", module: "Pemasok", entityId: id, prevValue: snapshot(prev), newValue: snapshot(parsed.data) },
        tx,
      );
      return result;
    });
    revalidatePath("/suppliers");
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah pemasok." };
  }
}

export async function deleteSupplier(id: string) {
  try {
    const user = await requirePermission("suppliers.manage");
    await prisma.$transaction(async (tx) => {
      const prev = await tx.supplier.findUnique({ where: { id } });
      if (!prev) throw new Error("Pemasok tidak ditemukan.");
      const purchases = await tx.purchase.count({ where: { supplierId: id } });
      if (purchases > 0) {
        throw new Error("Pemasok sudah memiliki riwayat pembelian — tidak bisa dihapus.");
      }
      await tx.item.updateMany({ where: { supplierId: id }, data: { supplierId: null } });
      await tx.supplier.delete({ where: { id } });
      await writeAudit(
        { userId: user.id, action: "Hapus pemasok", module: "Pemasok", entityId: id, prevValue: snapshot(prev) },
        tx,
      );
    });
    revalidatePath("/suppliers");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menghapus pemasok." };
  }
}

const purchaseSchema = z.object({
  supplierId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.coerce.number().int().positive("Jumlah harus lebih dari nol."),
  unitPrice: z.coerce.number().int().min(0, "Harga satuan tidak boleh negatif."),
  locationId: z.string().uuid("Lokasi tujuan tidak valid."),
});

/**
 * Records a purchase AND posts the matching MASUK movement in one atomic
 * transaction, so the purchase and the stock-in can never diverge.
 */
export async function recordPurchase(formData: FormData) {
  try {
    const user = await requirePermission("suppliers.manage");
    const parsed = purchaseSchema.safeParse({
      supplierId: formData.get("supplierId"),
      itemId: formData.get("itemId"),
      quantity: formData.get("quantity"),
      unitPrice: formData.get("unitPrice"),
      locationId: formData.get("locationId"),
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const purchase = await prisma.$transaction(async (tx) => {
      const movement = await applyMovement(tx, {
        itemId: parsed.data.itemId,
        type: "MASUK",
        quantity: parsed.data.quantity,
        toLocationId: parsed.data.locationId,
        note: `Pembelian dari pemasok`,
        createdById: user.id,
      });
      const created = await tx.purchase.create({
        data: {
          supplierId: parsed.data.supplierId,
          itemId: parsed.data.itemId,
          quantity: parsed.data.quantity,
          unitPrice: parsed.data.unitPrice,
          total: parsed.data.quantity * parsed.data.unitPrice,
          movementId: movement.id,
        },
      });
      await writeAudit(
        { userId: user.id, action: "Catat pembelian", module: "Pemasok", entityId: created.id, newValue: snapshot(parsed.data) },
        tx,
      );
      return created;
    });
    revalidatePath("/suppliers");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
    return { ok: true as const, id: purchase.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mencatat pembelian." };
  }
}
