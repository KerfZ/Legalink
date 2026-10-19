"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { LEGAL_NEEDS } from "@/lib/legalink";

const COMPLEXITY_OPTS = [
  "Low — advice or document review",
  "Medium — several issues or parties",
  "High — major dispute or ongoing proceedings",
  "Not sure",
];

const BUDGET_OPTS = [
  "Under Rp2 million",
  "Rp2–5 million",
  "Rp5–10 million",
  "Rp10 million+",
  "Not sure yet",
];

export default function StartCasePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      router.push("/auth/login?next=/start-case");
      return;
    }
    const payload = {
      user_id: user.id,
      nickname: String(form.get("nickname") ?? ""),
      legal_need: String(form.get("legal_need") ?? ""),
      complexity: String(form.get("complexity") ?? ""),
      budget_range: String(form.get("budget_range") ?? ""),
      details: String(form.get("details") ?? ""),
    };
    const { error: insertError } = await supabase.from("cases").insert(payload);
    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }
    const params = new URLSearchParams();
    if (payload.legal_need && payload.legal_need !== "Not sure yet")
      params.set("need", payload.legal_need);
    if (payload.complexity.startsWith("Low")) params.set("complexity", "Low");
    else if (payload.complexity.startsWith("Medium")) params.set("complexity", "Medium");
    else if (payload.complexity.startsWith("High")) params.set("complexity", "High");
    if (payload.budget_range === "Under Rp2 million") params.set("budget", "low");
    else if (payload.budget_range === "Rp2–5 million") params.set("budget", "mid");
    else if (payload.budget_range === "Rp5–10 million" || payload.budget_range === "Rp10 million+")
      params.set("budget", "high");
    router.push(`/marketplace?${params.toString()}`);
  }

  return (
    <>
      <SiteNav />
      <main className="legal-wrap" style={{ paddingTop: 40, paddingBottom: 70, maxWidth: 640 }}>
        <div className="legal-eyebrow">Tell us about your case</div>
        <h1 style={{ letterSpacing: -2, margin: "10px 0" }}>Describe your legal need.</h1>
        <p className="legal-tiny">Saved to Supabase. Please don&apos;t include confidential information.</p>
        <form onSubmit={onSubmit} className="legal-panel" style={{ marginTop: 20 }}>
          <div className="legal-field">
            <label>YOUR NAME (OPTIONAL)</label>
            <input name="nickname" placeholder="How should we address you?" />
          </div>
          <div className="legal-field">
            <label>WHAT DO YOU NEED HELP WITH?</label>
            <select name="legal_need" required defaultValue="">
              <option value="" disabled>Choose a legal need</option>
              {LEGAL_NEEDS.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
          </div>
          <div className="legal-field">
            <label>HOW COMPLEX DOES IT SEEM?</label>
            <select name="complexity" required defaultValue="">
              <option value="" disabled>Choose one</option>
              {COMPLEXITY_OPTS.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="legal-field">
            <label>ESTIMATED BUDGET</label>
            <select name="budget_range" required defaultValue="">
              <option value="" disabled>Choose a range</option>
              {BUDGET_OPTS.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
          </div>
          <div className="legal-field">
            <label>BRIEF DESCRIPTION (OPTIONAL)</label>
            <textarea name="details" placeholder="A short, non-confidential summary…" />
          </div>
          {error && <div className="legal-notice">{error}</div>}
          <button className="legal-primary legal-full" style={{ marginTop: 16 }} disabled={loading} type="submit">
            {loading ? "Saving…" : "See my matches"}
          </button>
        </form>
      </main>
    </>
  );
}
