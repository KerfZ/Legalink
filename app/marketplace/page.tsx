"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { Firm, formatRange, matchesBudget } from "@/lib/legalink";

const NEEDS = ["all", "Business contracts", "Licensing", "Civil disputes", "Property", "Family law"];

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="legal-wrap" style={{ padding: 40 }}>Loading marketplace…</div>}>
      <MarketplaceContent />
    </Suspense>
  );
}

function MarketplaceContent() {
  const params = useSearchParams();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [need, setNeed] = useState(params.get("need") ?? "all");
  const [complexity, setComplexity] = useState(params.get("complexity") ?? "all");
  const [budget, setBudget] = useState(params.get("budget") ?? "all");
  const [q, setQ] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("firms")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) setLoadError(error.message);
      else setFirms((data ?? []) as Firm[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return firms.filter((f) => {
      if (need !== "all" && f.practice_area !== need) return false;
      if (complexity !== "all" && f.complexity !== complexity) return false;
      if (!matchesBudget(f, budget)) return false;
      if (q) {
        const hay = `${f.name} ${f.description} ${f.practice_area} ${f.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [firms, need, complexity, budget, q]);

  return (
    <>
      <SiteNav />
      <main className="legal-wrap legal-section">
        <div className="legal-section-head">
          <div>
            <div className="legal-eyebrow">The marketplace</div>
            <h2>Find your legal fit.</h2>
          </div>
          <p>Login-gated. Curated firms for every budget and complexity.</p>
        </div>
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
              <label>CASE COMPLEXITY</label>
              <select value={complexity} onChange={(e) => setComplexity(e.target.value)}>
                <option value="all">Any complexity</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
            <div className="legal-field">
              <label>BUDGET RANGE</label>
              <select value={budget} onChange={(e) => setBudget(e.target.value)}>
                <option value="all">Any budget</option>
                <option value="low">Under Rp2 million</option>
                <option value="mid">Rp2–5 million</option>
                <option value="high">Over Rp5 million</option>
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
              <strong>{loading ? "Loading…" : `${filtered.length} firm${filtered.length === 1 ? "" : "s"}`}</strong>
              <span>Live from Supabase</span>
            </div>
            {loadError && <div className="legal-notice">{loadError} — did you run schema.sql?</div>}
            {!loading && filtered.length === 0 && (
              <div className="legal-empty">
                No firms match these filters. Try widening the budget or complexity.
              </div>
            )}
            <div className="legal-firm-list">
              {filtered.map((f) => (
                <article className="legal-firm" key={f.id}>
                  <div className="legal-firmmark">{f.initials}</div>
                  <div>
                    <h3>{f.name}</h3>
                    <p className="desc">{f.description}</p>
                    <div className="legal-chips">
                      <span>{f.practice_area}</span>
                      <span>{f.complexity} complexity</span>
                      {f.tags.slice(0, 2).map((t) => (<span key={t}>{t}</span>))}
                    </div>
                  </div>
                  <div className="legal-firm-right">
                    <strong>{formatRange(f.price_min, f.price_max)}</strong>
                    <small>estimated range</small>
                    <Link href={`/firms/${f.id}`} className="legal-outlinebtn">View match</Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
