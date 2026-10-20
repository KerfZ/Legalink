"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { COMPLEXITIES, LEGAL_NEEDS } from "@/lib/legalink";

// Firm onboarding: a user who signed up as "Law firm" completes their
// profile here. Their listing starts UNPUBLISHED until an admin approves it.
export default function FirmOnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isFirm, setIsFirm] = useState(false);
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const { error: err } = await supabase.from("firms").insert({
      owner_id: userData.user.id,
      created_by: userData.user.id,
      name: String(form.get("name")),
      initials: String(form.get("initials") || "L"),
      practice_area: String(form.get("practice_area")),
      complexity: String(form.get("complexity")),
      price_min: Number(form.get("price_min")),
      price_max: Number(form.get("price_max")),
      description: String(form.get("description")),
      tags,
      history: String(form.get("history")),
      area: String(form.get("area")),
      office_address: String(form.get("office_address")),
      logo_url: String(form.get("logo_url") ?? "") || null,
      google_rating: form.get("google_rating") ? Number(form.get("google_rating")) : null,
      contact_name: String(form.get("contact_name") ?? ""),
      contact_email: String(form.get("contact_email") ?? ""),
      contact_phone: String(form.get("contact_phone") ?? ""),
      is_published: false, // admin approval required
    });
    if (err) setError(err.message);
    else router.push("/firm/dashboard");
    setLoading(false);
  }

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
            âœ… You already completed onboarding.{" "}
            <Link href="/firm/dashboard">Go to your firm dashboard â†’</Link>
          </div>
        )}

        {ready && isFirm && !alreadyOnboarded && (
          <form onSubmit={onSubmit} className="legal-panel" style={{ marginTop: 20 }}>
            <div className="legal-field"><label>FIRM NAME</label><input name="name" required placeholder="e.g. North &amp; Co. Legal" /></div>
            <div className="legal-field"><label>INITIALS (LOGO FALLBACK)</label><input name="initials" placeholder="N&amp;C" /></div>
            <div className="legal-field"><label>LOGO IMAGE URL (OPTIONAL)</label><input name="logo_url" placeholder="https://â€¦" /></div>
            <div className="legal-field"><label>AREA / CITY</label><input name="area" required placeholder="e.g. Jakarta Selatan" /></div>
            <div className="legal-field"><label>OFFICE ADDRESS (FOR IN-PERSON VISITS)</label><textarea name="office_address" placeholder="Street, cityâ€¦" /></div>
            <div className="legal-field">
              <label>MAIN PRACTICE AREA</label>
              <select name="practice_area" required>
                {LEGAL_NEEDS.filter((n) => n !== "Not sure yet").map((n) => (<option key={n}>{n}</option>))}
              </select>
            </div>
            <div className="legal-field">
              <label>TYPICAL CASE COMPLEXITY HANDLED</label>
              <select name="complexity" required>
                {COMPLEXITIES.map((c) => (<option key={c}>{c}</option>))}
              </select>
            </div>
            <div className="legal-field"><label>PRICE MIN (IDR)</label><input name="price_min" type="number" min={0} required /></div>
            <div className="legal-field"><label>PRICE MAX (IDR)</label><input name="price_max" type="number" min={0} required /></div>
            <div className="legal-field"><label>SHORT DESCRIPTION</label><textarea name="description" required placeholder="Who you help and howâ€¦" /></div>
            <div className="legal-field"><label>TAGS (comma separated)</label><input name="tags" placeholder="SME-friendly, Fixed-scope" /></div>
            <div className="legal-field"><label>BRIEF HISTORY / BACKGROUND</label><textarea name="history" required placeholder="Founded year, team size, notable experienceâ€¦" /></div>
            <div className="legal-field"><label>GOOGLE REVIEW SCORE (0.0â€“5.0, OPTIONAL)</label><input name="google_rating" type="number" step="0.1" min={0} max={5} placeholder="4.6" /></div>
            <div className="legal-field"><label>CONTACT PERSON</label><input name="contact_name" /></div>
            <div className="legal-field"><label>CONTACT EMAIL</label><input name="contact_email" type="email" /></div>
            <div className="legal-field"><label>CONTACT PHONE</label><input name="contact_phone" /></div>
            {error && <div className="legal-notice">{error}</div>}
            <button className="legal-primary legal-full" style={{ marginTop: 16 }} disabled={loading} type="submit">
              {loading ? "Submittingâ€¦" : "Submit for review"}
            </button>
          </form>
        )}
      </main>
    </>
  );
}