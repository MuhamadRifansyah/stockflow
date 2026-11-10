"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit, snapshot } from "@/lib/audit";
import type { MovementType, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type LedgerInput = {
  itemId: string;
  type: MovementType;
  /** Positive for MASUK/KELUAR/TRANSFER; signed delta for PENYESUAIAN. */
  quantity: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  note?: string | null;
  createdById: string;
  requestId?: string | null;
  opnameId?: string | null;
};

async function nextMovementCode(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const count = await tx.stockMovement.count({
    where: { code: { startsWith: `TRX-${year}-` } },
  });
  return `TRX-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function getBalance(tx: Tx, itemId: string, locationId: string): Promise<number> {
  const bal = await tx.stockBalance.findUnique({
    where: { itemId_locationId: { itemId, locationId } },
  });
  return bal?.quantity ?? 0;
}

async function setBalance(tx: Tx, itemId: string, locationId: string, quantity: number) {
  return tx.stockBalance.upsert({
    where: { itemId_locationId: { itemId, locationId } },
    update: { quantity },
    create: { itemId, locationId, quantity },
  });
}

/**
 * Core ledger invariant — the ONLY way balances change.
 * Runs inside the caller's transaction: movement row + balance upserts +
 * audit row commit atomically. Throws on any validation failure, so the
 * whole batch rolls back. Never call this outside a transaction.
 */
export async function applyMovement(tx: Tx, input: LedgerInput) {
  const { itemId, type, quantity } = input;
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Item tidak ditemukan.");

  if (!Number.isInteger(quantity)) throw new Error("Jumlah harus bilangan bulat.");
  if (type === "PENYESUAIAN" && quantity === 0) {
    throw new Error("Penyesuaian tidak boleh nol.");
  }
  if (type !== "PENYESUAIAN" && quantity <= 0) {
    throw new Error("Jumlah harus lebih dari nol.");
  }

  let balanceAfter: number | null = null;

  if (type === "MASUK") {
    if (!input.toLocationId) throw new Error("Lokasi tujuan wajib diisi untuk stok masuk.");
    const after = (await getBalance(tx, itemId, input.toLocationId)) + quantity;
    await setBalance(tx, itemId, input.toLocationId, after);
    balanceAfter = after;
  } else if (type === "KELUAR") {
    if (!input.fromLocationId) throw new Error("Lokasi sumber wajib diisi untuk stok keluar.");
    const before = await getBalance(tx, itemId, input.fromLocationId);
    if (before < quantity) {
      throw new Error(
        `Stok tidak mencukupi: tersedia ${before} ${item.unit}, diminta ${quantity} ${item.unit}.`,
      );
    }
    const after = before - quantity;
    await setBalance(tx, itemId, input.fromLocationId, after);
    balanceAfter = after;
  } else if (type === "TRANSFER") {
    if (!input.fromLocationId || !input.toLocationId) {
      throw new Error("Lokasi sumber dan tujuan wajib diisi untuk transfer.");
    }
    if (input.fromLocationId === input.toLocationId) {
      throw new Error("Lokasi sumber dan tujuan tidak boleh sama.");
    }
    const before = await getBalance(tx, itemId, input.fromLocationId);
    if (before < quantity) {
      throw new Error(
        `Stok tidak mencukupi untuk transfer: tersedia ${before} ${item.unit}, diminta ${quantity} ${item.unit}.`,
      );
    }
    await setBalance(tx, itemId, input.fromLocationId, before - quantity);
    const destAfter = (await getBalance(tx, itemId, input.toLocationId)) + quantity;
    await setBalance(tx, itemId, input.toLocationId, destAfter);
    balanceAfter = before - quantity;
  } else {
    // PENYESUAIAN — quantity is a signed delta
    if (!input.toLocationId) throw new Error("Lokasi wajib diisi untuk penyesuaian.");
    const before = await getBalance(tx, itemId, input.toLocationId);
    const after = before + quantity;
    if (after < 0) {
      throw new Error(
        `Penyesuaian tidak valid: stok akan menjadi ${after} (tidak boleh negatif).`,
      );
    }
    await setBalance(tx, itemId, input.toLocationId, after);
    balanceAfter = after;
  }

  const code = await nextMovementCode(tx);
  const movement = await tx.stockMovement.create({
    data: {
      code,
      itemId,
      type,
      quantity: type === "MASUK" ? quantity : type === "PENYESUAIAN" ? quantity : -quantity,
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      balanceAfter,
      note: input.note ?? null,
      createdById: input.createdById,
      requestId: input.requestId ?? null,
      opnameId: input.opnameId ?? null,
    },
  });

  // Low-stock notification (to the actor + all admins) when the new balance
  // falls at or below the item minimum.
  if (balanceAfter !== null && balanceAfter <= item.minStock) {
    const admins = await tx.user.findMany({
      where: { isActive: true, role: { name: { in: ["Super Admin", "Admin"] } } },
      select: { id: true },
    });
    const recipients = new Set([input.createdById, ...admins.map((a) => a.id)]);
    await tx.notification.createMany({
      data: [...recipients].map((userId) => ({
        userId,
        kind: "low-stock",
        title: "Stok menipis",
        message: `${item.name} (${item.sku}) tersisa ${balanceAfter} ${item.unit} — di bawah minimum ${item.minStock} ${item.unit}.`,
      })),
    });
  }

  await writeAudit(
    {
      userId: input.createdById,
      action: `Catat pergerakan ${type.toLowerCase()}`,
      module: "Pergerakan Stok",
      entityId: movement.id,
      newValue: snapshot({ code, itemId, type, quantity }),
    },
    tx,
  );

  return movement;
}

// --- Form action ------------------------------------------------------------

const movementSchema = z.object({
  itemId: z.string().uuid("Item tidak valid."),
  type: z.enum(["MASUK", "KELUAR", "TRANSFER", "PENYESUAIAN"]),
  quantity: z.coerce.number().int(),
  fromLocationId: z.string().uuid().optional().nullable(),
  toLocationId: z.string().uuid().optional().nullable(),
  note: z.string().max(500).optional(),
});

export async function createMovement(formData: FormData) {
  try {
    const user = await requirePermission("movements.create");
    const parsed = movementSchema.safeParse({
      itemId: formData.get("itemId"),
      type: formData.get("type"),
      quantity: formData.get("quantity"),
      fromLocationId: formData.get("fromLocationId") || null,
      toLocationId: formData.get("toLocationId") || null,
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const movement = await prisma.$transaction((tx) =>
      applyMovement(tx, { ...parsed.data, createdById: user.id }),
    );
    revalidatePath("/movements");
    revalidatePath("/dashboard");
    revalidatePath("/items");
    return { ok: true as const, id: movement.id, code: movement.code };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mencatat pergerakan." };
  }
}
