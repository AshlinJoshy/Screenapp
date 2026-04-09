"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { clearSession, getUser } from "@/lib/auth";
import {
  Monitor, FileVideo, Megaphone, CheckSquare, BarChart2,
  Settings, LogOut, ChevronRight, LayoutDashboard, Users,
} from "lucide-react";

type NavItem = { label: string; href: string; icon: React.ReactNode };

const ownerNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/owner", icon: <LayoutDashboard size={18} /> },
  { label: "My Screens", href: "/dashboard/owner/screens", icon: <Monitor size={18} /> },
  { label: "Approvals", href: "/dashboard/owner/approvals", icon: <CheckSquare size={18} /> },
];

const advertiserNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/advertiser", icon: <LayoutDashboard size={18} /> },
  { label: "Campaigns", href: "/dashboard/advertiser/campaigns", icon: <Megaphone size={18} /> },
  { label: "Creatives", href: "/dashboard/advertiser/creatives", icon: <FileVideo size={18} /> },
  { label: "Analytics", href: "/dashboard/advertiser/analytics", icon: <BarChart2 size={18} /> },
];

const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/admin", icon: <LayoutDashboard size={18} /> },
  { label: "All Screens", href: "/dashboard/admin/screens", icon: <Monitor size={18} /> },
  { label: "Users", href: "/dashboard/admin/users", icon: <Users size={18} /> },
  { label: "Analytics", href: "/dashboard/admin/analytics", icon: <BarChart2 size={18} /> },
];

export function Sidebar() {
  const user = getUser();
  const pathname = usePathname();
  const router = useRouter();

  const navItems =
    user?.role === "owner" ? ownerNav :
    user?.role === "advertiser" ? advertiserNav :
    adminNav;

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  return (
    <aside className="w-64 shrink-0 bg-slate-900 text-slate-100 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-800">
        <span className="text-xl font-bold text-white">AdScreen</span>
        <p className="text-xs text-slate-400 mt-0.5 capitalize">{user?.role} Portal</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={14} />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-slate-800 space-y-1">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <Settings size={18} />
          Settings
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-900/40 hover:text-red-400 transition-colors"
        >
          <LogOut size={18} />
          Log out
        </button>
        <div className="px-3 pt-2">
          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          <p className="text-xs font-medium text-slate-300 truncate">{user?.displayName}</p>
        </div>
      </div>
    </aside>
  );
}
