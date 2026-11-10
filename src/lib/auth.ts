import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const PBKDF2_ITERATIONS = 120_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 hari
const MAX_FAILURES = 8;
const LOCKOUT_MINUTES = 15;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha256");
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/** True when the email has hit the brute-force lockout. */
async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000);
  const failures = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gte: since } },
  });
  return failures >= MAX_FAILURES;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_TTL_SECONDS },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email dan Kata Sandi",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Kata sandi", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        if (await isLockedOut(email)) {
          throw new Error(
            `Terlalu banyak percobaan gagal. Coba lagi setelah ${LOCKOUT_MINUTES} menit.`,
          );
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { role: true },
        });
        const ok = !!user && user.isActive && verifyPassword(password, user.passwordHash);
        await prisma.loginAttempt.create({ data: { email, success: ok } });
        if (!ok) return null;

        // Bersihkan catatan gagal setelah login berhasil.
        await prisma.loginAttempt.deleteMany({ where: { email, success: false } });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roleName: user.role.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roleName = (user as { roleName?: string }).roleName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = String(token.id);
        (session.user as { roleName?: string }).roleName = String(token.roleName ?? "");
      }
      return session;
    },
  },
});
