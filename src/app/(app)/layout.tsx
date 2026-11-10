import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
        <footer className="border-t border-line px-6 py-3 text-xs text-muted">
          StockFlow · Sistem Inventaris &amp; Manajemen Aset
        </footer>
      </div>
    </div>
  );
}
