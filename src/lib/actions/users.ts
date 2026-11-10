"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit, snapshot } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth";

const createUserSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter.").max(100),
  email: z.string().email("Email tidak valid."),
  password: z.string().min(8, "Kata sandi minimal 8 karakter.").max(128),
  roleId: z.string().uuid("Peran tidak valid."),
});

export async function createUser(formData: FormData) {
  try {
    const user = await requirePermission("users.manage");
    const parsed = createUserSchema.safeParse({
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: formData.get("password"),
      roleId: formData.get("roleId"),
    });
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
    }
    const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
    if (!role) return { ok: false as const, error: "Peran tidak ditemukan." };
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) return { ok: false as const, error: "Email sudah terdaftar." };
    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash: hashPassword(parsed.data.password),
          roleId: parsed.data.roleId,
          isActive: true,
        },
      });
      await writeAudit(
        { userId: user.id, action: "Tambah pengguna", module: "Pengguna", entityId: u.id, newValue: snapshot({ name: u.name, email: u.email, role: role.name }) },
        tx,
      );
      return u;
    });
    revalidatePath("/users");
    return { ok: true as const, id: created.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menambah pengguna." };
  }
}

const updateUserSchema = z.object({
  name: z.string().min(2).max(100),
  roleId: z.string().uuid(),
});

export async function updateUser(id: string, formData: FormData) {
  try {
    const actor = await requirePermission("users.manage");
    const parsed = updateUserSchema.safeParse({
      name: String(formData.get("name") ?? "").trim(),
      roleId: formData.get("roleId"),
    });
    if (!parsed.success) return { ok: false as const, error: "Data tidak valid." };
    const updated = await prisma.$transaction(async (tx) => {
      const prev = await tx.user.findUnique({ where: { id }, include: { role: true } });
      if (!prev) throw new Error("Pengguna tidak ditemukan.");
      if (prev.role.name === "Super Admin" && parsed.data.roleId !== prev.roleId) {
        throw new Error("Peran Super Admin tidak bisa diubah.");
      }
      const role = await tx.role.findUnique({ where: { id: parsed.data.roleId } });
      if (!role) throw new Error("Peran tidak ditemukan.");
      const result = await tx.user.update({
        where: { id },
        data: { name: parsed.data.name, roleId: parsed.data.roleId },
      });
      await writeAudit(
        { userId: actor.id, action: "Ubah pengguna", module: "Pengguna", entityId: id, prevValue: snapshot({ name: prev.name, role: prev.role.name }), newValue: snapshot({ name: result.name, role: role.name }) },
        tx,
      );
      return result;
    });
    revalidatePath("/users");
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah pengguna." };
  }
}

/** Activates / deactivates a user. Never deactivates the last Super Admin. */
export async function setUserActive(id: string, isActive: boolean) {
  try {
    const actor = await requirePermission("users.manage");
    const updated = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, include: { role: true } });
      if (!target) throw new Error("Pengguna tidak ditemukan.");
      if (!isActive && target.role.name === "Super Admin") {
        const count = await tx.user.count({
          where: { isActive: true, role: { name: "Super Admin" } },
        });
        if (count <= 1) throw new Error("Tidak bisa menonaktifkan Super Admin terakhir.");
      }
      const result = await tx.user.update({ where: { id }, data: { isActive } });
      await writeAudit(
        { userId: actor.id, action: isActive ? "Aktifkan pengguna" : "Nonaktifkan pengguna", module: "Pengguna", entityId: id },
        tx,
      );
      return result;
    });
    revalidatePath("/users");
    return { ok: true as const, id: updated.id, isActive: updated.isActive };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah status pengguna." };
  }
}

/** Super Admin sets (or resets) another user's password. */
export async function resetUserPassword(id: string, formData: FormData) {
  try {
    const actor = await requirePermission("users.manage");
    const password = String(formData.get("password") ?? "");
    if (password.length < 8 || password.length > 128) {
      return { ok: false as const, error: "Kata sandi minimal 8 karakter." };
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return { ok: false as const, error: "Pengguna tidak ditemukan." };
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash: hashPassword(password) } });
      await writeAudit(
        { userId: actor.id, action: "Atur ulang kata sandi", module: "Pengguna", entityId: id },
        tx,
      );
    });
    revalidatePath("/users");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengatur ulang kata sandi." };
  }
}

export async function deleteUser(id: string) {
  try {
    const actor = await requirePermission("users.manage");
    await prisma.$transaction(async (tx) => {
      const prev = await tx.user.findUnique({ where: { id }, include: { role: true } });
      if (!prev) throw new Error("Pengguna tidak ditemukan.");
      if (prev.id === actor.id) throw new Error("Anda tidak bisa menghapus akun sendiri.");
      if (prev.role.name === "Super Admin") {
        throw new Error("Akun Super Admin tidak bisa dihapus.");
      }
      const hasHistory =
        (await tx.stockMovement.count({ where: { createdById: id } })) > 0 ||
        (await tx.stockRequest.count({ where: { requesterId: id } })) > 0;
      if (hasHistory) {
        throw new Error("Pengguna sudah memiliki riwayat — nonaktifkan saja, jangan hapus.");
      }
      await tx.user.delete({ where: { id } });
      await writeAudit(
        { userId: actor.id, action: "Hapus pengguna", module: "Pengguna", entityId: id, prevValue: snapshot({ name: prev.name, email: prev.email }) },
        tx,
      );
    });
    revalidatePath("/users");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal menghapus pengguna." };
  }
}

/** Replaces a role's permission set. The locked Super Admin role is refused. */
export async function updateRolePermissions(roleId: string, permissionKeys: string[]) {
  try {
    const actor = await requirePermission("roles.manage");
    const updated = await prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id: roleId } });
      if (!role) throw new Error("Peran tidak ditemukan.");
      if (role.isLocked) throw new Error("Peran Super Admin terkunci — izinnya tidak bisa diubah.");
      const permissions = await tx.permission.findMany({
        where: { key: { in: permissionKeys } },
      });
      if (permissions.length !== permissionKeys.length) {
        throw new Error("Ada kunci izin yang tidak dikenal.");
      }
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      });
      await writeAudit(
        { userId: actor.id, action: "Ubah izin peran", module: "Peran & Izin", entityId: roleId, newValue: snapshot({ role: role.name, permissions: permissionKeys }) },
        tx,
      );
      return role;
    });
    revalidatePath("/users");
    return { ok: true as const, id: updated.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah izin peran." };
  }
}

/** Signed-in user changes their own password. */
export async function changeOwnPassword(formData: FormData) {
  try {
    const actor = await requirePermission("settings.manage");
    const current = String(formData.get("currentPassword") ?? "");
    const next = String(formData.get("newPassword") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");
    if (next.length < 8 || next.length > 128) {
      return { ok: false as const, error: "Kata sandi baru minimal 8 karakter." };
    }
    if (next !== confirm) {
      return { ok: false as const, error: "Konfirmasi kata sandi tidak cocok." };
    }
    const target = await prisma.user.findUnique({ where: { id: actor.id } });
    if (!target || !verifyPassword(current, target.passwordHash)) {
      return { ok: false as const, error: "Kata sandi saat ini salah." };
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.id }, data: { passwordHash: hashPassword(next) } });
      await writeAudit(
        { userId: actor.id, action: "Ubah kata sandi sendiri", module: "Pengaturan", entityId: actor.id },
        tx,
      );
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Gagal mengubah kata sandi." };
  }
}
