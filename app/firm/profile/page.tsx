"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { FirmProfileForm } from "@/components/firm-profile-form";
import type { Firm } from "@/lib/legalink";

// Edit an existing firm profile. The update targets owner_id = current user,
// and the "owners update own firms" RLS policy enforces ownership.
export default function FirmProfilePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [firm, setFirm] = useState<Firm | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/auth/login?next=/firm/profile");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();
      if (profile?.role !== "firm") {
        router.push("/marketplace");
        return;
      }
      const { data: f } = await supabase
        .from("firms")
        .select("*")
        .eq("owner_id", userData.user.id)
        .maybeSingle();
      if (!f) {
        router.push("/firm/onboarding");
        return;
      }
      setFirm(f as Firm);
      setReady(true);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <SiteNav />
      <main className="legal-wrap" style={{ paddingTop: 40, paddingBottom: 70, maxWidth: 640 }}>
        <div className="legal-eyebrow">Firm profile</div>
        <h1 style={{ letterSpacing: -2, margin: "10px 0" }}>Edit your listing.</h1>
        <p className="legal-tiny">
          Changes apply to your existing listing.{" "}
          <Link href="/firm/dashboard">Back to dashboard</Link>
        </p>
        {!ready && <div className="legal-empty">Loading...</div>}
        {ready && firm && <FirmProfileForm mode="edit" initial={firm} />}
      </main>
    </>
  );
}
