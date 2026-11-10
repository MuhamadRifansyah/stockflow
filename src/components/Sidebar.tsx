"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, Tags, MapPin, ArrowLeftRight, Boxes,
  UserCheck, ClipboardList, CheckSquare, Scale, Truck, BarChart3,
  ScrollText, Users, BookOpen, Settings, LogOut,
} from "lucide-react";
import { hasPermission, type SessionUser } from "@/lib/permissions";
import { signOut } from "next-auth/react";

type NavItem = { href: string; label: string; icon: React.ReactNode; perm: string };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Ringkasan",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, perm: "dashboard.view" },
    ],
  },
  {
    title: "Inventaris",
    items: [
      { href: "/items", label: "Semua Item", icon: <Package className="h-4 w-4" />, perm: "items.view" },
      { href: "/categories", label: "Kategori", icon: <Tags className="h-4 w-4" />, perm: "categories.manage" },
      { href: "/locations", label: "Lokasi", icon: <MapPin className="h-4 w-4" />, perm: "locations.manage" },
      { href: "/movements", label: "Pergerakan Stok", icon: <ArrowLeftRight className="h-4 w-4" />, perm: "movements.view" },
    ],
  },
  {
    title: "Manajemen Aset",
    items: [
      { href: "/assets", label: "Registri Aset", icon: <Boxes className="h-4 w-4" />, perm: "assets.view" },
      { href: "/assignments", label: "Penugasan Aset", icon: <UserCheck className="h-4 w-4" />, perm: "assets.view" },
    ],
  },
  {
    title: "Operasional",
    items: [
      { href: "/requests", label: "Permintaan Stok", icon: <ClipboardList className="h-4 w-4" />, perm: "requests.view" },
      { href: "/approvals", label: "Persetujuan", icon: <CheckSquare className="h-4 w-4" />, perm: "requests.approve" },
      { href: "/opname", label: "Stok Opname", icon: <Scale className="h-4 w-4" />, perm: "opname.view" },
    ],
  },
  {
    title: "Manajemen",
    items: [
      { href: "/suppliers", label: "Pemasok", icon: <Truck className="h-4 w-4" />, perm: "suppliers.view" },
      { href: "/reports", label: "Laporan & Analitik", icon: <BarChart3 className="h-4 w-4" />, perm: "reports.view" },
      { href: "/audit", label: "Log Audit", icon: <ScrollText className="h-4 w-4" />, perm: "audit.view" },
    ],
  },
  {
    title: "Sistem",
    items: [
      { href: "/users", label: "Manajemen Pengguna", icon: <Users className="h-4 w-4" />, perm: "users.view" },
      { href: "/docs", label: "Dokumentasi", icon: <BookOpen className="h-4 w-4" />, perm: "dashboard.view" },
      { href: "/settings", label: "Pengaturan", icon: <Settings className="h-4 w-4" />, perm: "settings.manage" },
    ],
  },
];

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-white md:flex">
      <div className="flex h-[52px] items-center gap-2 border-b border-white/10 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent">
          <Package className="h-4 w-4" />
        </span>
        <span className="font-semibold">StockFlow</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((group) => {
          const items = group.items.filter((i) => hasPermission(user, i.perm));
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="mb-5">
              <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-white/40">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${
                          active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 px-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-white/50">{user.roleName}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Keluar"
            title="Keluar"
            className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
