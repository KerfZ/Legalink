import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { createClient } from "@/lib/supabase/server";
import { formatRange } from "@/lib/legalink";
import { RecommendationCarousel, type CarouselFirm } from "@/components/recommendation-carousel";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const cta = user ? "/start-case" : "/auth/login?next=/start-case";

  // Hero recommendations: featured first, then verified, then newest.
  const { data: previewFirms } = await supabase
    .from("firms")
    .select(
      "id,name,initials,practice_area,complexity,price_min,price_max,description,tags,area,operating_hours,google_rating,is_featured,is_verified,logo_url",
    )
    .eq("is_published", true)
    .order("is_featured", { ascending: false })
    .order("is_verified", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3);

  // Aggregated ratings (Google + verified in-house) from the firm_ratings
  // view. The view is authenticated-only, so anonymous visitors get none.
  type RatingRow = {
    firm_id: number;
    google_rating: number | null;
    in_house_rating: number | null;
    review_count: number;
  };
  const { data: ratingRows } = await supabase
    .from("firm_ratings")
    .select("firm_id, google_rating, in_house_rating, review_count");
  const ratingMap = new Map<number, RatingRow>();
  for (const r of (ratingRows ?? []) as RatingRow[]) ratingMap.set(r.firm_id, r);

  // Merge in-house ratings into the hero firms for the carousel.
  const heroFirms = (previewFirms ?? []).map((f: CarouselFirm) => {
    const rr = ratingMap.get(f.id);
    return { ...f, in_house_rating: rr?.in_house_rating ?? null, review_count: rr?.review_count ?? null };
  });

  return (
    <>
      <SiteNav />
      <main>
        <section className="legal-hero legal-wrap">
          <div>
            <div className="legal-eyebrow"><span className="legal-dot" /> Legal support, made clearer</div>
            <h1>The right legal help.<br /><em>The right price.</em></h1>
            <p className="lead">Legal!nk helps individuals and small businesses find legal professionals that fit their needs, case complexity, and budget — without the guesswork.</p>
            <div className="legal-hero-actions">
              <Link href={cta} className="legal-primary">Find my legal match</Link>
              <Link href="/marketplace" className="legal-secondary">Explore law firms</Link>
            </div>
            <div className="legal-trust">
              <div className="legal-avatars"><span className="legal-avatar">SM</span><span className="legal-avatar">LC</span><span className="legal-avatar">UM</span></div>
              <span>Built for SMEs, individuals, and emerging law firms.</span>
            </div>
          </div>
          <div className="legal-hero-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="legal-pill">RECOMMENDED ON LEGAL!NK</span>
              <span style={{ fontSize: 26, color: "var(--pill-fg)" }}>✳</span>
            </div>
            <h2 style={{ fontSize: 26, lineHeight: 1.1, margin: "24px 0 6px" }}>Less uncertainty.<br />More clarity.</h2>
            <div style={{ fontSize: 13, color: "var(--on-gold-muted)", marginBottom: 14 }}>
              Featured &amp; verified firms, live from the marketplace.
            </div>

            {!user ? (
              <div className="legal-match" style={{ display: "block" }}>
                <strong style={{ fontSize: 15 }}>See real firms with transparent prices.</strong>
                <p style={{ fontSize: 13, color: "var(--on-gold-muted)", margin: "8px 0 14px", lineHeight: 1.5 }}>
                  Log in to browse recommended law firms — profiles, price ranges, ratings, and verified credentials.
                </p>
                <Link href="/auth/login?next=/" className="legal-secondary">Log in to see firms</Link>
              </div>
            ) : !previewFirms || previewFirms.length === 0 ? (
              <div className="legal-match" style={{ display: "block" }}>
                <span style={{ fontSize: 13, color: "var(--on-gold-muted)" }}>
                  No firms published yet — new firms are added regularly.
                </span>
              </div>
            ) : (
              <RecommendationCarousel firms={heroFirms} />
            )}
          </div>
        </section>

        <section className="legal-section legal-wrap" id="how">
          <div className="legal-section-head">
            <div><div className="legal-eyebrow">Simple by design</div><h2>From legal problem to<br />clearer next steps.</h2></div>
            <p>Share the basics, understand your case category, then compare relevant firms and their estimated pricing.</p>
          </div>
          <div className="legal-steps">
            <div className="legal-step"><div className="legal-stepnum">01 / TELL US</div><h3>Describe your case</h3><p>Share your legal issue and what kind of support you need.</p></div>
            <div className="legal-step"><div className="legal-stepnum">02 / CLASSIFY</div><h3>Understand complexity</h3><p>A simple starting category: low, medium, or high complexity.</p></div>
            <div className="legal-step"><div className="legal-stepnum">03 / MATCH</div><h3>See relevant firms</h3><p>Explore options based on service area, budget, and experience.</p></div>
            <div className="legal-step"><div className="legal-stepnum">04 / CONNECT</div><h3>Compare & connect</h3><p>Review the fit and contact a firm to confirm scope and fees.</p></div>
          </div>
        </section>

        <section className="legal-section legal-wrap" id="marketplace" style={{ paddingTop: 0 }}>
          <div className="legal-section-head">
            <div><div className="legal-eyebrow">The marketplace</div><h2>Find your legal fit.</h2></div>
            <p>Live firms from the database. Log in to filter, compare, and view contacts.</p>
          </div>
          {!previewFirms || previewFirms.length === 0 ? (
            <div className="legal-empty">No firms published yet. Log in and check back soon — new firms are added regularly.<div style={{ marginTop: 12 }}><Link href={cta} className="legal-outlinebtn">Describe your case first</Link></div></div>
          ) : (
            <>
              <div className="legal-firm-list">
                {previewFirms.map((f) => (
                  <article className="legal-firm" key={f.id}>
                    <div className="legal-firmmark">{f.initials}</div>
                    <div><h3>{f.name}</h3><p className="desc">{f.description}</p>
                      <div className="legal-chips"><span>{f.practice_area}</span><span>{f.complexity} complexity</span></div>
                    </div>
                    <div className="legal-firm-right"><strong>{formatRange(f.price_min, f.price_max)}</strong><small>estimated range</small><Link href={user ? `/firms/${f.id}` : `/auth/login?next=/firms/${f.id}`} className="legal-outlinebtn">View match</Link></div>
                  </article>
                ))}
              </div>
              <div style={{ marginTop: 16, textAlign: "center" }}><Link href="/marketplace" className="legal-secondary">Explore all firms</Link></div>
            </>
          )}
        </section>

        <section className="legal-section legal-wrap" id="about" style={{ paddingTop: 0 }}>
          <div className="legal-how">
            <div>
              <div className="legal-eyebrow">Why Legal!nk</div>
              <h2>Fairer access for clients.<br />More visibility for new firms.</h2>
              <p className="lead">Traditional legal services can feel hard to price and compare. Legal!nk is designed to make options more transparent while helping qualified emerging firms reach clients who need them.</p>
              <div style={{ marginTop: 20 }}><Link href={cta} className="legal-primary">Start with your case</Link></div>
            </div>
            <div className="legal-howbox">
              <div className="legal-eyebrow">What you can compare</div>
              <div className="legal-howrow"><span>Practice area</span><strong>Relevant to your case</strong></div>
              <div className="legal-howrow"><span>Case complexity</span><strong>Low / Medium / High</strong></div>
              <div className="legal-howrow"><span>Estimated price</span><strong>Clearer ranges</strong></div>
              <div className="legal-howrow"><span>Firm profile</span><strong>Expertise & fit</strong></div>
              <p className="legal-tiny" style={{ margin: "12px 0 0" }}>Final scope, availability, credentials, and fees should always be confirmed directly with the legal professional.</p>
            </div>
          </div>
        </section>
      </main>
      <footer className="legal-footer">
        <div className="legal-wrap legal-footerin">
          <div><span className="legal-logo" style={{ fontSize: 19 }}>Legal<span>!</span>nk</span><div style={{ marginTop: 8 }}>Connect with the right legal help, at the right price.</div></div>
          <div>Login required for matching · Firms curated by admin</div>
          <div>© 2026 Legal!nk</div>
        </div>
      </footer>
    </>
  );
}
