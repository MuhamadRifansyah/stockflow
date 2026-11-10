import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type AuditInput = {
  userId?: string | null;
  action: string;
  module: string;
  entityId?: string | null;
  prevValue?: string | null;
  newValue?: string | null;
};

type Tx = Prisma.TransactionClient;

/** Writes one audit-log row. Pass `tx` to include it in an atomic batch. */
export async function writeAudit(input: AuditInput, tx?: Tx) {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      module: input.module,
      entityId: input.entityId ?? null,
      prevValue: input.prevValue ?? null,
      newValue: input.newValue ?? null,
    },
  });
}

/** Serialize a Prisma row for the before/after columns. */
export function snapshot(value: unknown): string {
  try {
    return JSON.stringify(value, null, 0);
  } catch {
    return String(value);
  }
}
