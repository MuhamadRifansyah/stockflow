import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";

export async function Topbar({ user }: { user: SessionUser }) {
  const unread = await prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });
  const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-line bg-white px-6">
      <div className="relative hidden flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          placeholder="Cari menu…"
          aria-label="Cari menu"
          className="w-full max-w-sm rounded-md border border-line bg-canvas py-1.5 pl-9 pr-3 text-sm"
        />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Link
          href="/notifications"
          aria-label={`Notifikasi, ${unread} belum dibaca`}
          className="relative rounded-md p-2 text-muted hover:bg-canvas"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              {unread}
            </span>
          )}
        </Link>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
          {initials}
        </span>
      </div>
    </header>
  );
}
