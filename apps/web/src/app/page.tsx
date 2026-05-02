"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn, getUser } from "@/lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    const user = getUser();
    if (user?.role === "owner") router.replace("/dashboard/owner");
    else if (user?.role === "advertiser") router.replace("/dashboard/advertiser");
    else if (user?.role === "admin") router.replace("/dashboard/admin");
    else router.replace("/login");
  }, [router]);

  return null;
}
