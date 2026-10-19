"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogoutButton } from "./logout-button";

export function SiteNav() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      setLoggedIn(!!data.user);
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
        <Link href="/#about">Our approach</Link>
        {loggedIn ? (
          <LogoutButton />
        ) : (
          <>
            <Link href="/auth/login">Log in</Link>
            <Link href="/start-case" className="legal-btn">
              Describe your case
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
