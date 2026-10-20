import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteNav } from "@/components/site-nav";
import { formatRange } from "@/lib/legalink";

export default async function FirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const { id } = await params;
  const { case: caseId } = await searchParams;
  const supabase = await createClient();
  const { data: firm, error } = await supabase
    .from("firms")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !firm) return notFound();
  const { data: ratingRows } = await supabase
    .from("firm_ratings")
    .select("google_rating, in_house_rating, review_count")
    .eq("firm_id", id)
    .maybeSingle();
  const ratings = ratingRows as { google_rating: number | null; in_house_rating: number | null; review_count: number } | null;

  return (
    <>
      <SiteNav />
      <main className="legal-wrap" style={{ paddingTop: 40, paddingBottom: 70, maxWidth: 820 }}>
        <Link href="/marketplace" className="legal-tiny">â† Back to marketplace</Link>
        <div className="legal-panel" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {firm.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firm.logo_url} alt={`${firm.name} logo`} width={56} height={56} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover" }} />
            ) : (
              <div className="legal-firmmark" style={{ width: 56, height: 56 }}>{firm.initials}</div>
            )}
            <div>
              <h1 style={{ margin: 0, letterSpacing: -1 }}>{firm.name}</h1>
              <p className="legal-tiny">
                {firm.area ? `ðŸ“ ${firm.area} Â· ` : ""}{firm.practice_area} Â· {firm.complexity} complexity
              </p>
            </div>
          </div>
          <p style={{ lineHeight: 1.65, marginTop: 16 }}>{firm.description}</p>
          <div className="legal-chips" style={{ marginTop: 8 }}>
            {(firm.tags ?? []).map((t: string) => (<span key={t}>{t}</span>))}
          </div>
          <div className="legal-howrow" style={{ marginTop: 16 }}>
            <span>Estimated price</span>
            <strong>{formatRange(firm.price_min, firm.price_max)}</strong>
          </div>
          <div className="legal-howrow">
            <span>Google review score</span>
            <strong>{ratings?.google_rating ? `${Number(ratings.google_rating).toFixed(1)} â˜…` : "â€”"}</strong>
          </div>
          <div className="legal-howrow">
            <span>Verified Legal!nk client rating</span>
            <strong>
              {ratings?.in_house_rating
                ? `${Number(ratings.in_house_rating).toFixed(1)} â˜… (${ratings.review_count} review${ratings.review_count === 1 ? "" : "s"})`
                : "No reviews yet"}
            </strong>
          </div>
          <div style={{ marginTop: 16 }}>
            {caseId ? (
              <Link href={`/marketplace?case=${caseId}`} className="legal-primary">
                â† Back to recommendations â€” request this firm there
              </Link>
            ) : (
              <Link href="/start-case" className="legal-primary">Describe your case to request a booking</Link>
            )}
          </div>
        </div>

        <div className="legal-panel" style={{ marginTop: 16 }}>
          <div className="legal-eyebrow">Brief history</div>
          <p style={{ lineHeight: 1.65 }}>{firm.history || "No history added yet."}</p>
        </div>

        <div className="legal-panel" style={{ marginTop: 16 }}>
          <div className="legal-eyebrow">Contact information</div>
          {firm.office_address && (
            <div className="legal-howrow"><span>Office address</span><strong>{firm.office_address}</strong></div>
          )}
          <div className="legal-howrow"><span>Contact person</span><strong>{firm.contact_name || "â€”"}</strong></div>
          <div className="legal-howrow"><span>Email</span><strong>{firm.contact_email || "â€”"}</strong></div>
          <div className="legal-howrow"><span>Phone</span><strong>{firm.contact_phone || "â€”"}</strong></div>
          <p className="legal-tiny">Confirm scope, availability, and fees directly with the firm.</p>
        </div>
      </main>
    </>
  );
}