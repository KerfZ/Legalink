"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { FirmProfileForm } from "@/components/firm-profile-form";

// Firm onboarding: a user who signed up as "Law firm" completes their
// profile here (shared form component). Their listing starts UNPUBLISHED
// until an admin approves it.
export default function FirmOnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isFirm, setIsFirm] = useState(false);
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false);

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/auth/login?next=/firm/onboarding");
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
      setIsFirm(true);
      // Already onboarded?
      const { data: firm } = await supabase
        .from("firms")
        .select("id, is_published")
        .eq("owner_id", userData.user.id)
        .maybeSingle();
      if (firm) {
        setAlreadyOnboarded(true);
      }
      setReady(true);
    }
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <SiteNav />
      <main className="legal-wrap" style={{ paddingTop: 40, paddingBottom: 70, maxWidth: 640 }}>
        <div className="legal-eyebrow">Law firm onboarding</div>
        <h1 style={{ letterSpacing: -2, margin: "10px 0" }}>Set up your firm profile.</h1>
        <p className="legal-tiny">
          Your listing goes live after an admin review. You&apos;ll then receive booking requests with full case intakes.
        </p>

        {ready && alreadyOnboarded && (
          <div className="legal-notice" style={{ marginTop: 18 }}>
            You already completed onboarding.{" "}
            <Link href="/firm/profile">Edit your profile</Link> or{" "}
            <Link href="/firm/dashboard">go to your firm dashboard</Link>.
          </div>
        )}

        {ready && isFirm && !alreadyOnboarded && <FirmProfileForm mode="create" />}
      </main>
    </>
  );
}
