"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogoutButton } from "./logout-button";
import { ThemeSwitcher } from "./theme-switcher";

export function SiteNav() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setRole(null);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      setRole(profile?.role ?? "client");
    }
    check();
  }, []);

  return (
    <nav className="legal-nav">
      <Link href="/" className="legal-logo">
        Legal<span>!</span>nk
      </Link>
      <div className="legal-navlinks">
        <Link href="/#how">How it works</Link>
        <Link href="/marketplace">Explore firms</Link>
        {role === "client" && <Link href="/bookings">My requests</Link>}
        {role === "firm" && <Link href="/firm/dashboard">Firm dashboard</Link>}
        {role === "admin" && <Link href="/dashboard">Admin</Link>}
        <Link href="/#about">Our approach</Link>
        {role ? (
          <LogoutButton />
        ) : (
          <>
            <Link href="/auth/login">Log in</Link>
            <Link href="/firm/register">For law firms</Link>
            <Link href="/start-case" className="legal-btn">
              Describe your case
            </Link>
          </>
        )}
        <ThemeSwitcher />
      </div>
    </nav>
  );
}