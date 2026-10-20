"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import {
  BUDGET_RANGES,
  COMPLEXITIES,
  CaseRecord,
  Firm,
  formatRange,
  matchesBudget,
  recommendationScore,
} from "@/lib/legalink";

const NEEDS = ["all", "Business contracts", "Licensing", "Civil disputes", "Property", "Family law"];

type FirmWithRatings = Firm & {
  google_rating?: number | null;
  in_house_rating?: number | null;
  review_count?: number | null;
};

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="legal-wrap" style={{ padding: 40 }}>Loading marketplaceÃ¢â‚¬Â¦</div>}>
      <MarketplaceContent />
    </Suspense>
  );
}

function MarketplaceContent() {
  const params = useSearchParams();
  const router = useRouter();
  const caseId = params.get("case");
  const [firms, setFirms] = useState<FirmWithRatings[]>([]);
  const [caseIntake, setCaseIntake] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [need, setNeed] = useState(params.get("need") ?? "all");
  const [complexity, setComplexity] = useState(params.get("complexity") ?? "all");
  const [budget, setBudget] = useState(params.get("budget") ?? "all");
  const [q, setQ] = useState("");
  const [bookingFirmId, setBookingFirmId] = useState<number | null>(null);
  const [bookingError, setBookingError] = useState("");
  const [requested, setRequested] = useState<Record<number, string>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();
      // Firms + aggregated ratings (Google + verified in-house) in one query.
      const { data, error } = await supabase
        .from("firms")
        .select("*")
        .eq("is_published", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) setLoadError(error.message);
      else {
        const rows = (data ?? []) as FirmWithRatings[];
        setFirms(rows);
        // Aggregated ratings (Google + verified in-house) from the firm_ratings view.
        const { data: ratings } = await supabase
          .from("firm_ratings")
          .select("firm_id, google_rating, in_house_rating, review_count");
        if (ratings) {
          const map = new Map<number, { google_rating: number | null; in_house_rating: number | null; review_count: number }>();
          for (const r of ratings as { firm_id: number; google_rating: number | null; in_house_rating: number | null; review_count: number }[]) {
            map.set(r.firm_id, r);
          }
          setFirms(rows.map((f) => ({ ...f, ...map.get(f.id) })));
        }
      }
      // Load the saved case intake for recommendations + booking requests.
      if (caseId) {
        const { data: c } = await supabase.from("cases").select("*").eq("id", caseId).single();
        if (c) {
          setCaseIntake(c as CaseRecord);
          // Pre-fill filters from the intake.
          if (c.legal_need && c.legal_need !== "Not sure yet") setNeed(c.legal_need);
          setComplexity(c.severity);
          setBudget(c.budget_range);
          // Which firms already have a request from this case?
          const { data: existing } = await supabase
            .from("booking_offers")
            .select("firm_id, status")
            .eq("case_id", caseId);
          if (existing) {
            const map: Record<number, string> = {};
            for (const b of existing) map[b.firm_id] = b.status;
            setRequested(map);
          }
        }
      }
      setLoading(false);
    }
    load();
  }, [caseId]);

  const filtered = useMemo(() => {
    let list = firms.filter((f) => {
      if (need !== "all" && f.practice_area !== need) return false;
      if (complexity !== "all" && f.complexity !== complexity) return false;
      if (!matchesBudget(f, budget)) return false;
      if (q) {
        const hay = `${f.name} ${f.description} ${f.practice_area} ${(f.tags ?? []).join(" ")} ${f.area ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    // With a saved case intake, rank by recommendation score.
    if (caseIntake) {
      list = [...list].sort((a, b) => recommendationScore(b, caseIntake) - recommendationScore(a, caseIntake));
    }
    return list;
  }, [firms, need, complexity, budget, q, caseIntake]);

  async function requestBooking(firmId: number) {
    if (!caseId || !caseIntake) return;
    setBookingError("");
    setBookingFirmId(firmId);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push(`/auth/login?next=/marketplace?case=${caseId}`);
      return;
    }
    const { error } = await supabase.from("booking_offers").insert({
      case_id: caseId,
      firm_id: firmId,
      client_id: userData.user.id,
      status: "PENDING",
    });
    if (error) {
      // Unique active request per (case, firm) Ã¢â€ â€™ surface friendly message.
      setBookingError(
        error.code === "23505"
          ? "You already have an active request with this firm. Check My Requests."
          : error.message,
      );
    } else {
      setRequested((m) => ({ ...m, [firmId]: "PENDING" }));
      router.push("/bookings");
    }
    setBookingFirmId(null);
  }

  function ratingText(f: FirmWithRatings): string {
    const parts: string[] = [];
    if (f.google_rating) parts.push(`Google ${Number(f.google_rating).toFixed(1)}Ã¢Ëœâ€¦`);
    if (f.in_house_rating) parts.push(`Legal!nk ${Number(f.in_house_rating).toFixed(1)}Ã¢Ëœâ€¦ (${f.review_count ?? 0})`);
    return parts.length ? parts.join(" Ã‚Â· ") : "No reviews yet";
  }

  return (
    <>
      <SiteNav />
      <main className="legal-wrap legal-section">
        <div className="legal-section-head">
          <div>
            <div className="legal-eyebrow">The marketplace</div>
            <h2>{caseIntake ? "Recommended for your case." : "Find your legal fit."}</h2>
          </div>
          <p>
            {caseIntake
              ? `Ranked for: ${caseIntake.legal_need} Ã‚Â· ${caseIntake.severity} urgency. Click "Request Booking" to send your intake to a firm.`
              : "Login-gated. Curated firms for every budget and complexity."}
          </p>
        </div>

        {caseIntake && (
          <div className="legal-notice" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span>
              Ã¢Å“â€¦ Case intake saved Ã¢â‚¬â€ your request keeps these details. Rejected? Come back and request another firm with 1 click.
            </span>
            <Link href="/start-case" className="legal-outlinebtn">Start a new intake</Link>
          </div>
        )}
        {bookingError && <div className="legal-notice">{bookingError}</div>}

        <div className="legal-market">
          <aside className="legal-panel">
            <h3 style={{ margin: 0 }}>Refine your search</h3>
            <div className="legal-field">
              <label>LEGAL NEED</label>
              <select value={need} onChange={(e) => setNeed(e.target.value)}>
                {NEEDS.map((n) => (
                  <option key={n} value={n}>{n === "all" ? "All legal needs" : n}</option>
                ))}
              </select>
            </div>
            <div className="legal-field">
              <label>URGENCY / COMPLEXITY</label>
              <select value={complexity} onChange={(e) => setComplexity(e.target.value)}>
                <option value="all">Any urgency</option>
                {COMPLEXITIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div className="legal-field">
              <label>BUDGET RANGE</label>
              <select value={budget} onChange={(e) => setBudget(e.target.value)}>
                <option value="all">Any budget</option>
                {BUDGET_RANGES.map((b) => (<option key={b.value} value={b.value}>{b.label}</option>))}
              </select>
            </div>
            <div className="legal-field">
              <label>SEARCH</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try SME or property" />
            </div>
            <button
              className="legal-secondary legal-full"
              style={{ marginTop: 14 }}
              onClick={() => { setNeed("all"); setComplexity("all"); setBudget("all"); setQ(""); }}
            >
              Reset filters
            </button>
          </aside>
          <div>
            <div className="legal-results-top">
              <strong>{loading ? "LoadingÃ¢â‚¬Â¦" : `${filtered.length} firm${filtered.length === 1 ? "" : "s"}`}</strong>
              <span>Live from Supabase</span>
            </div>
            {loadError && <div className="legal-notice">{loadError} Ã¢â‚¬â€ did you run schema.sql / migration-v2.sql?</div>}
            {!loading && filtered.length === 0 && (
              <div className="legal-empty">
                No firms match these filters. Try widening the budget or urgency.
              </div>
            )}
            <div className="legal-firm-list">
              {filtered.map((f) => {
                const reqStatus = requested[f.id];
                return (
                  <article className="legal-firm" key={f.id}>
                    {f.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.logo_url}
                        alt={`${f.name} logo`}
                        width={48}
                        height={48}
                        style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }}
                      />
                    ) : (
                      <div className="legal-firmmark">{f.initials}</div>
                    )}
                    <div>
                      <h3>
                        {f.name}
                        {f.is_featured && (
                          <span className="legal-tag" style={{ marginLeft: 8, background: "var(--gold)", color: "var(--on-gold)" }}>Featured</span>
                        )}
                        {f.is_verified && (
                          <span className="legal-tag" style={{ marginLeft: 8, background: "#1a7f37", color: "#ffffff" }}>Verified</span>
                        )}
                      </h3>
                      <p className="desc">{f.description}</p>
                      <div style={{ fontSize: 12, color: "var(--muted-legal)", marginBottom: 8 }}>
                        {f.area ? `Ã°Å¸â€œÂ ${f.area} Ã‚Â· ` : ""}{ratingText(f)}
                      </div>
                      <div className="legal-chips">
                        <span>{f.practice_area}</span>
                        <span>{f.complexity} complexity</span>
                        {(f.tags ?? []).slice(0, 2).map((t) => (<span key={t}>{t}</span>))}
                      </div>
                      {f.operating_hours && (
                        <div style={{ fontSize: 12, color: "var(--muted-legal)", marginTop: 6 }}>{f.operating_hours}</div>
                      )}
                    </div>
                    <div className="legal-firm-right">
                      <strong>{formatRange(f.price_min, f.price_max)}</strong>
                      <small>estimated range</small>
                      {caseId && caseIntake ? (
                        reqStatus ? (
                          <Link href="/bookings" className="legal-outlinebtn">
                            {reqStatus === "PENDING" ? "Request sent Ã¢Å“â€œ" : "View request"}
                          </Link>
                        ) : (
                          <button
                            className="legal-primary"
                            style={{ padding: "9px 14px", fontSize: 13 }}
                            disabled={bookingFirmId === f.id}
                            onClick={() => requestBooking(f.id)}
                          >
                            {bookingFirmId === f.id ? "SendingÃ¢â‚¬Â¦" : "Request Booking"}
                          </button>
                        )
                      ) : (
                        <Link href={`/firms/${f.id}`} className="legal-outlinebtn">View match</Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}