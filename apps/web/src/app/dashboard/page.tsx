"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser, isLoggedIn } from "@/lib/auth";

export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    const user = getUser();
    if (user?.role === "owner") router.replace("/dashboard/owner");
    else if (user?.role === "advertiser") router.replace("/dashboard/advertiser");
    else router.replace("/dashboard/admin");
  }, [router]);
  return null;
}
