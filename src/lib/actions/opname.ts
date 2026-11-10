"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit, snapshot } from "@/lib/audit";
import { applyMovement } from "@/lib/actions/movements";

/**
 * Creates an opname session for one location, snapshotting current balances
 * as system stock. One location may have only one active session.
 * (Form action: receives FormData from the "Buat Sesi Opname" form.)
 */
export async function createOpnameSession(formData: FormData) {
  try {
    const user = await requirePermission("opname.manage");
    const locationId = String(formData.get("locationId") ?? "");
    const note = String(formData.get("note") ?? "") || undefined;
    if (!locationId) return { ok: false as const, error: "Lokasi wajib dipilih." };
    const session = await prisma.$transaction(async (tx) => {
      const location = await tx.location.findUnique({ where: { id: locationId } });
      if (!location) throw new Error("Lokasi tidak ditemukan.");
      const active = await tx.stockOpname.findFirst({
        where: { locationId, status: { in: ["BERLANGSUNG", "DIAJUKAN"] } },
      });
      if (active) {
        throw new Error("Lokasi ini sudah memiliki satu sesi opname aktif.");
      }
      const balances = await tx.stockBalance.findMany({
        where: { locationId },
        include: { item: true },
      });
      const created = await tx.stockOpname.create({
        data: {
          locationId,
          status: "BERLANGSUNG",
          note: note ?? null,
          createdById: user.id,
          details: {
            create: balances.map((b) => ({
              itemId: b.itemId,
              systemQty: b.quantity,
              physicalQty: null,
              difference: 0,
            })),
          },
        },
      });
      await writeAudit(
        { userId: user.id, action: "Buat sesi opname", module: "Stok Opname", entityId: created.id, newValue: snapshot({ locationId, items: balances.length }) },
        tx,
      );
      return created;
    });
    revalidatePath("/opname");
    return { ok: true as const, id: session.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal membuat sesi opname." };
  }
}

const countSchema = z.object({
  detailId: z.string().uuid(),
  physicalQty: z.number().int().min(0, "Jumlah fisik tidak boleh negatif."),
});

/** Records a physical count; discrepancy is computed live. */
export async function recordCount(detailId: string, physicalQty: number) {
  try {
    const user = await requirePermission("opname.manage");
    const parsed = countSchema.safeParse({ detailId, physicalQty });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const detail = await prisma.$transaction(async (tx) => {
      const d = await tx.stockOpnameDetail.findUnique({
        where: { id: detailId },
        include: { opname: true },
      });
      if (!d) throw new Error("Detail opname tidak ditemukan.");
      if (d.opname.status !== "BERLANGSUNG") {
        throw new Error("Sesi ini sudah diajukan — hitungan tidak bisa diubah lagi.");
      }
      return tx.stockOpnameDetail.update({
        where: { id: detailId },
        data: { physicalQty, difference: physicalQty - d.systemQty },
      });
    });
    revalidatePath("/opname");
    return { ok: true as const, id: detail.id, difference: detail.difference };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menyimpan hitungan." };
  }
}

/** Submits a counted session for manager approval. */
export async function submitOpname(opnameId: string) {
  try {
    const user = await requirePermission("opname.manage");
    const updated = await prisma.$transaction(async (tx) => {
      const op = await tx.stockOpname.findUnique({
        where: { id: opnameId },
        include: { details: true },
      });
      if (!op) throw new Error("Sesi opname tidak ditemukan.");
      if (op.status !== "BERLANGSUNG") throw new Error("Sesi ini sudah diajukan atau diputuskan.");
      const uncounted = op.details.filter((d) => d.physicalQty === null).length;
      if (uncounted > 0) {
        throw new Error(`${uncounted} item belum dihitung. Lengkapi hitungan fisik dulu.`);
      }
      const result = await tx.stockOpname.update({
        where: { id: opnameId },
        data: { status: "DIAJUKAN" },
      });
      await writeAudit(
        { userId: user.id, action: "Ajukan opname", module: "Stok Opname", entityId: op.id, newValue: snapshot({ status: "DIAJUKAN" }) },
        tx,
      );
      const managers = await tx.user.findMany({
        where: { isActive: true, role: { name: { in: ["Super Admin", "Admin", "Manager"] } } },
        select: { id: true },
      });
      await tx.notification.createMany({
        data: managers.map((m) => ({
          userId: m.id,
          kind: "opname",
          title: "Opname menunggu persetujuan",
          message: `Sesi opname di ${op.locationId} sudah diajukan dan menunggu keputusan.`,
        })),
      });
      return result;
    });
    revalidatePath("/opname");
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengajukan opname." };
  }
}

/**
 * Manager decision. APPROVAL is the only path that changes balances:
 * one PENYESUAIAN movement per discrepant line brings the balance exactly
 * to the physical count. Rejection returns the session for recount.
 */
export async function decideOpname(
  opnameId: string,
  decision: "approve" | "reject",
  note?: string,
) {
  try {
    const user = await requirePermission("opname.approve");
    const decided = await prisma.$transaction(async (tx) => {
      const op = await tx.stockOpname.findUnique({
        where: { id: opnameId },
        include: { details: true },
      });
      if (!op) throw new Error("Sesi opname tidak ditemukan.");
      if (op.status !== "DIAJUKAN") {
        throw new Error("Hanya sesi yang sudah diajukan yang bisa diputuskan.");
      }
      if (decision === "approve") {
        for (const d of op.details) {
          if (d.difference !== 0) {
            await applyMovement(tx, {
              itemId: d.itemId,
              type: "PENYESUAIAN",
              quantity: d.difference,
              toLocationId: op.locationId,
              note: `Opname ${op.id.slice(0, 8)} — penyesuaian ke hitungan fisik`,
              createdById: user.id,
              opnameId: op.id,
            });
          }
        }
        const result = await tx.stockOpname.update({
          where: { id: opnameId },
          data: { status: "DISETUJUI", decidedById: user.id, decisionNote: note ?? null },
        });
        await writeAudit(
          { userId: user.id, action: "Setujui opname", module: "Stok Opname", entityId: op.id, newValue: snapshot({ status: "DISETUJUI" }) },
          tx,
        );
        return result;
      }
      const result = await tx.stockOpname.update({
        where: { id: opnameId },
        data: { status: "DITOLAK", decidedById: user.id, decisionNote: note ?? null },
      });
      await writeAudit(
        { userId: user.id, action: "Tolak opname", module: "Stok Opname", entityId: op.id, newValue: snapshot({ status: "DITOLAK" }) },
        tx,
      );
      return result;
    });
    revalidatePath("/opname");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
    return { ok: true as const, id: decided.id, status: decided.status };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal memproses keputusan opname." };
  }
}
