"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn, getUser } from "@/lib/auth";
import { Sidebar } from "./Sidebar";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  allowedRoles?: ("owner" | "advertiser" | "admin")[];
}

export function DashboardShell({ children, allowedRoles }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    const user = getUser();
    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      router.replace("/dashboard");
      return;
    }
    setReady(true);
  }, [router, allowedRoles]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
