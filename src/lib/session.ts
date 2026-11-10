// Server-only session helpers. Imported by server actions and pages only —
// never from a client component.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";

/** Returns the signed-in user with role + permission keys, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    roleName: user.role.name,
    permissions: user.role.permissions.map((rp) => rp.permission.key),
  };
}

/** Throws when unauthenticated or missing the permission. */
export async function requirePermission(key: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Anda harus masuk terlebih dahulu.");
  if (!user.permissions.includes(key)) {
    throw new Error(`Izin tidak cukup: ${key} diperlukan.`);
  }
  return user;
}
