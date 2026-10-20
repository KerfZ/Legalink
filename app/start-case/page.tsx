"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import {
  BUDGET_RANGES,
  CONSULT_MODES,
  LEGAL_NEEDS,
  SEVERITIES,
  type BudgetValue,
  type ConsultMode,
  type Severity,
  budgetLabel,
  modeLabel,
} from "@/lib/legalink";

const STEPS = ["Need", "Urgency & budget", "Details", "Availability"] as const;

export default function StartCasePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form state (kept in state so multi-step navigation preserves input).
  const [nickname, setNickname] = useState("");
  const [legalNeed, setLegalNeed] = useState("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [budget, setBudget] = useState<BudgetValue | "">("");
  const [details, setDetails] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [mode, setMode] = useState<ConsultMode | "">("");

  function stepValid(): boolean {
    switch (step) {
      case 0:
        return legalNeed !== "" && severity !== "";
      case 1:
        return budget !== "";
      case 2:
        return details.trim().length >= 10;
      case 3:
        return preferredTime !== "" && mode !== "";
      default:
        return false;
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      router.push("/auth/login?next=/start-case");
      return;
    }
    const payload = {
      user_id: user.id,
      nickname,
      legal_need: legalNeed,
      severity: severity as Severity,
      budget_range: budget as BudgetValue,
      details: details.trim(),
      preferred_time: new Date(preferredTime).toISOString(),
      mode: mode as ConsultMode,
    };
    const { data: inserted, error: insertError } = await supabase
      .from("cases")
      .insert(payload)
      .select("id")
      .single();
    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }
    // Redirect to recommended firms for this saved intake.
    router.push(`/marketplace?case=${inserted.id}`);
  }

  return (
    <>
      <SiteNav />
      <main className="legal-wrap" style={{ paddingTop: 40, paddingBottom: 70, maxWidth: 680 }}>
        <div className="legal-eyebrow">Tell us about your case</div>
        <h1 style={{ letterSpacing: -2, margin: "10px 0" }}>Describe your legal need.</h1>
        <p className="legal-tiny">
          A few quick questions — saved securely. Please don&apos;t include confidential information.
        </p>

        {/* Step progress */}
        <div style={{ display: "flex", gap: 8, margin: "20px 0 6px", flexWrap: "wrap" }}>
          {STEPS.map((s, i) => (
            <div
              key={s}
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1,
                padding: "6px 10px",
                borderRadius: 999,
                background: i === step ? "var(--gold)" : "var(--chip-bg)",
                color: i === step ? "var(--on-gold)" : "var(--muted-legal)",
              }}
            >
              {i + 1}. {s}
            </div>
          ))}
        </div>

        <form onSubmit={onSubmit} className="legal-panel" style={{ marginTop: 14 }}>
          {step === 0 && (
            <>
              <div className="legal-field">
                <label>YOUR NAME (OPTIONAL)</label>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="How should we address you?"
                />
              </div>
              <div className="legal-field">
                <label>WHAT DO YOU NEED HELP WITH?</label>
                <select value={legalNeed} onChange={(e) => setLegalNeed(e.target.value)} required>
                  <option value="" disabled>Choose a legal need</option>
                  {LEGAL_NEEDS.map((n) => (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>
              <div className="legal-field">
                <label>SEVERITY / URGENCY</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  required
                >
                  <option value="" disabled>How urgent is it?</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}{s === "Low" ? " — advice or document review" : s === "Medium" ? " — several issues or parties" : " — major dispute or ongoing proceedings"}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {step === 1 && (
            <div className="legal-field">
              <label>BUDGET RANGE</label>
              <select
                value={budget}
                onChange={(e) => setBudget(e.target.value as BudgetValue)}
                required
              >
                <option value="" disabled>Choose a range</option>
                {BUDGET_RANGES.map((b) => (<option key={b.value} value={b.value}>{b.label}</option>))}
                <option value="gt5m">Not sure yet</option>
              </select>
              <p className="legal-tiny" style={{ marginTop: 8 }}>
                This helps us match you with firms in your range. Fees are always confirmed by the firm in their offer.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="legal-field">
              <label>DETAILED DESCRIPTION OF YOUR CASE</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Briefly describe what happened, who is involved, and what outcome you hope for…"
                style={{ minHeight: 160 }}
                required
              />
              <p className="legal-tiny" style={{ marginTop: 6 }}>
                {details.trim().length < 10
                  ? "Please write at least a short paragraph (min. 10 characters)."
                  : "Firms will review this before making an offer."}
              </p>
            </div>
          )}

          {step === 3 && (
            <>
              <div className="legal-field">
                <label>PREFERRED DATE &amp; TIME AVAILABILITY</label>
                <input
                  type="datetime-local"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                  required
                />
                <p className="legal-tiny" style={{ marginTop: 6 }}>
                  Pick your best slot — the firm can counter-propose another time in their offer.
                </p>
              </div>
              <div className="legal-field">
                <label>CONSULTATION MODE PREFERENCE</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {CONSULT_MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMode(m.value as ConsultMode)}
                      style={{
                        border: `1px solid ${mode === m.value ? "var(--gold)" : "var(--line)"}`,
                        background: mode === m.value ? "var(--chip-bg)" : "var(--card-bg)",
                        borderRadius: 12,
                        padding: "14px 12px",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--ink)",
                      }}
                    >
                      {m.value === "ONLINE" ? "🎥" : "🏢"} {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Review summary on last step before submit */}
          {step === 3 && legalNeed && severity && budget && (
            <div className="legal-notice" style={{ marginTop: 16 }}>
              <strong>Review:</strong> {legalNeed} · {severity} urgency · {budgetLabel(budget)} ·{" "}
              {mode ? modeLabel(mode) : ""} · {preferredTime ? new Date(preferredTime).toLocaleString() : ""}
            </div>
          )}

          {error && <div className="legal-notice">{error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            {step > 0 && (
              <button
                type="button"
                className="legal-secondary"
                onClick={() => setStep((s) => s - 1)}
                disabled={loading}
              >
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                className="legal-primary legal-full"
                onClick={() => stepValid() && setStep((s) => s + 1)}
                disabled={!stepValid()}
              >
                Continue
              </button>
            ) : (
              <button
                className="legal-primary legal-full"
                disabled={loading || !stepValid()}
                type="submit"
              >
                {loading ? "Saving…" : "See my matches"}
              </button>
            )}
          </div>
        </form>
      </main>
    </>
  );
}