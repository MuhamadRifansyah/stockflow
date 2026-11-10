"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit, snapshot } from "@/lib/audit";
import { applyMovement } from "@/lib/actions/movements";

async function nextRequestCode(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.stockRequest.count({
    where: { code: { startsWith: `REQ-${year}-` } },
  });
  return `REQ-${year}-${String(count + 1).padStart(6, "0")}`;
}

const createSchema = z.object({
  purpose: z.string().min(3, "Tujuan minimal 3 karakter.").max(500),
  items: z
    .array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().positive() }))
    .min(1, "Minimal satu item."),
});

export async function createRequest(input: {
  purpose: string;
  items: { itemId: string; quantity: number }[];
}) {
  try {
    const user = await requirePermission("requests.create");
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const code = await nextRequestCode();
    const req = await prisma.$transaction(async (tx) => {
      const created = await tx.stockRequest.create({
        data: {
          code,
          requesterId: user.id,
          purpose: parsed.data.purpose,
          status: "MENUNGGU",
          items: {
            create: parsed.data.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
          },
        },
      });
      await writeAudit(
        { userId: user.id, action: "Buat permintaan stok", module: "Permintaan Stok", entityId: created.id, newValue: snapshot({ code, purpose: parsed.data.purpose }) },
        tx,
      );
      // Notify managers that a request is waiting.
      const managers = await tx.user.findMany({
        where: { isActive: true, role: { name: { in: ["Super Admin", "Admin", "Manager"] } } },
        select: { id: true },
      });
      await tx.notification.createMany({
        data: managers.map((m) => ({
          userId: m.id,
          kind: "permintaan",
          title: "Permintaan stok baru",
          message: `${code} dari ${user.name} menunggu persetujuan.`,
        })),
      });
      return created;
    });
    revalidatePath("/requests");
    revalidatePath("/approvals");
    return { ok: true as const, id: req.id, code: req.code };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal membuat permintaan." };
  }
}

const decisionSchema = z.object({
  requestId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

/** Manager approves or rejects a waiting request. */
export async function decideRequest(
  requestId: string,
  decision: "approve" | "reject",
  note?: string,
) {
  try {
    const user = await requirePermission("requests.approve");
    const parsed = decisionSchema.safeParse({ requestId, note });
    if (!parsed.success) return { ok: false as const, error: "Data tidak valid." };

    const updated = await prisma.$transaction(async (tx) => {
      const req = await tx.stockRequest.findUnique({ where: { id: requestId } });
      if (!req) throw new Error("Permintaan tidak ditemukan.");
      if (req.status !== "MENUNGGU") {
        throw new Error(`Permintaan sudah ${req.status.toLowerCase()} — tidak bisa diputuskan lagi.`);
      }
      const status = decision === "approve" ? "DISETUJUI" : "DITOLAK";
      const result = await tx.stockRequest.update({
        where: { id: requestId },
        data: { status, approvedById: user.id, decisionNote: note ?? null },
      });
      await writeAudit(
        {
          userId: user.id,
          action: decision === "approve" ? "Setujui permintaan" : "Tolak permintaan",
          module: "Persetujuan",
          entityId: req.id,
          prevValue: snapshot({ status: req.status }),
          newValue: snapshot({ status }),
        },
        tx,
      );
      await tx.notification.create({
        data: {
          userId: req.requesterId,
          kind: "permintaan",
          title: decision === "approve" ? "Permintaan disetujui" : "Permintaan ditolak",
          message: `${req.code} ${decision === "approve" ? "disetujui" : "ditolak"} oleh ${user.name}.`,
        },
      });
      return result;
    });
    revalidatePath("/approvals");
    revalidatePath("/requests");
    return { ok: true as const, id: updated.id, status: updated.status };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memproses keputusan." };
  }
}

/** Warehouse Staff starts processing an approved request.
 *  (Form action: bound requestId first, then FormData with sourceLocationId.) */
export async function startProcessing(requestId: string, formData: FormData) {
  try {
    const user = await requirePermission("requests.process");
    const sourceLocationId = String(formData.get("sourceLocationId") ?? "");
    if (!sourceLocationId) {
      return { ok: false as const, error: "Lokasi sumber wajib dipilih." };
    }
    const updated = await prisma.$transaction(async (tx) => {
      const req = await tx.stockRequest.findUnique({ where: { id: requestId } });
      if (!req) throw new Error("Permintaan tidak ditemukan.");
      if (req.status !== "DISETUJUI") {
        throw new Error("Hanya permintaan yang sudah disetujui yang bisa diproses.");
      }
      const location = await tx.location.findUnique({ where: { id: sourceLocationId } });
      if (!location) throw new Error("Lokasi sumber tidak ditemukan.");
      const result = await tx.stockRequest.update({
        where: { id: requestId },
        data: { status: "DIPROSES", sourceLocationId },
      });
      await writeAudit(
        { userId: user.id, action: "Proses permintaan", module: "Permintaan Stok", entityId: req.id, newValue: snapshot({ sourceLocationId }) },
        tx,
      );
      return result;
    });
    revalidatePath("/requests");
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memproses permintaan." };
  }
}

/**
 * Completes a processing request. Posts one real KELUAR movement per line
 * from the chosen source location — atomically. Insufficient stock on ANY
 * line rejects the whole completion (nothing is posted).
 */
export async function completeRequest(requestId: string) {
  try {
    const user = await requirePermission("requests.process");
    const completed = await prisma.$transaction(async (tx) => {
      const req = await tx.stockRequest.findUnique({
        where: { id: requestId },
        include: { items: { include: { item: true } } },
      });
      if (!req) throw new Error("Permintaan tidak ditemukan.");
      if (req.status !== "DIPROSES") {
        throw new Error("Hanya permintaan yang sedang diproses yang bisa diselesaikan.");
      }
      if (!req.sourceLocationId) throw new Error("Lokasi sumber belum dipilih.");

      // Pre-check every line before posting anything.
      for (const line of req.items) {
        const bal = await tx.stockBalance.findUnique({
          where: {
            itemId_locationId: { itemId: line.itemId, locationId: req.sourceLocationId },
          },
        });
        const available = bal?.quantity ?? 0;
        if (available < line.quantity) {
          throw new Error(
            `Stok ${line.item.name} di lokasi sumber tidak mencukupi: tersedia ${available} ${line.item.unit}, diminta ${line.quantity} ${line.item.unit}. Penyelesaian dibatalkan.`,
          );
        }
      }
      for (const line of req.items) {
        await applyMovement(tx, {
          itemId: line.itemId,
          type: "KELUAR",
          quantity: line.quantity,
          fromLocationId: req.sourceLocationId,
          note: `Permintaan ${req.code}`,
          createdById: user.id,
          requestId: req.id,
        });
      }
      const result = await tx.stockRequest.update({
        where: { id: requestId },
        data: { status: "SELESAI" },
      });
      await writeAudit(
        { userId: user.id, action: "Selesaikan permintaan", module: "Permintaan Stok", entityId: req.id, prevValue: snapshot({ status: "DIPROSES" }), newValue: snapshot({ status: "SELESAI" }) },
        tx,
      );
      await tx.notification.create({
        data: {
          userId: req.requesterId,
          kind: "permintaan",
          title: "Permintaan selesai",
          message: `${req.code} sudah selesai diproses dari gudang.`,
        },
      });
      return result;
    });
    revalidatePath("/requests");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
    return { ok: true as const, id: completed.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menyelesaikan permintaan." };
  }
}
