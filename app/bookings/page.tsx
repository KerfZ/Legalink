"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import {
  BookingOffer,
  bookingStatusLabel,
  budgetLabel,
  formatDateTime,
  formatFullRp,
  modeLabel,
} from "@/lib/legalink";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "var(--chip-bg)",
  OFFER_SENT: "var(--gold)",
  ACCEPTED: "#1a7f37",
  REJECTED: "#b42318",
};
const STATUS_FG: Record<string, string> = {
  PENDING: "var(--muted-legal)",
  OFFER_SENT: "var(--on-gold)",
  ACCEPTED: "#ffffff",
  REJECTED: "#ffffff",
};

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange(n)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 24,
            lineHeight: 1,
            color: n <= value ? "var(--gold)" : "var(--line)",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function BookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  // Payment status + this client's reviews (drive the review prompt).
  const [txMap, setTxMap] = useState<Record<string, string>>({});
  const [reviewMap, setReviewMap] = useState<Record<string, { id: string; rating: number; comment: string | null }>>({});

  // Review form state.
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  async function refresh() {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/auth/login?next=/bookings");
      return;
    }
    const { data, error: err } = await supabase
      .from("booking_offers")
      .select("*, firms(name, initials, area, contact_email, office_address), cases(nickname, legal_need, severity, budget_range, details, preferred_time, mode)")
      .eq("client_id", userData.user.id)
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else setBookings((data ?? []) as BookingOffer[]);
    // Payment status + my reviews, so paid bookings can leave/edit a review.
    const [{ data: txs }, { data: revs }] = await Promise.all([
      supabase.from("transactions").select("booking_offer_id, payment_status").eq("client_id", userData.user.id),
      supabase.from("reviews").select("id, booking_offer_id, rating, comment").eq("client_id", userData.user.id),
    ]);
    setTxMap(Object.fromEntries((txs ?? []).map((t) => [t.booking_offer_id, t.payment_status])));
    setReviewMap(
      Object.fromEntries(
        (revs ?? []).map((r) => [r.booking_offer_id, { id: r.id, rating: r.rating, comment: r.comment }]),
      ),
    );
    setLoading(false);
  }

  useEffect(() => { refresh(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(id: string, accept: boolean) {
    setActing(id);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase
      .from("booking_offers")
      .update({
        status: accept ? "ACCEPTED" : "REJECTED",
        responded_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "OFFER_SENT"); // only valid from OFFER_SENT
    if (err) setError(err.message);
    else if (accept) {
      router.push(`/checkout/${id}`);
      return;
    } else {
      setNotice("Offer declined. You can request another firm from your saved case.");
    }
    await refresh();
    setActing(null);
  }

  // Insert (or edit) a review. RLS only allows this after a SUCCESS payment,
  // one review per booking (unique constraint on booking_offer_id).
  async function submitReview(b: BookingOffer) {
    if (reviewRating < 1) return;
    setReviewSaving(true);
    setError("");
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/auth/login?next=/bookings");
      return;
    }
    const existing = reviewMap[b.id];
    const { error: err } = existing
      ? await supabase
          .from("reviews")
          .update({ rating: reviewRating, comment: reviewText.trim() })
          .eq("id", existing.id)
      : await supabase.from("reviews").insert({
          firm_id: b.firm_id,
          client_id: userData.user.id,
          booking_offer_id: b.id,
          rating: reviewRating,
          comment: reviewText.trim(),
        });
    if (err) setError(err.message);
    else {
      setReviewFor(null);
      setNotice("Thanks! Your review is now live on the firm's profile.");
      await refresh();
    }
    setReviewSaving(false);
  }

  return (
    <>
      <SiteNav />
      <main className="legal-wrap legal-section" style={{ maxWidth: 860 }}>
        <div className="legal-section-head">
          <div>
            <div className="legal-eyebrow">My requests</div>
            <h2>Bookings &amp; offers.</h2>
          </div>
          <p>Track firm responses to your case intake. Accept an offer to proceed to payment.</p>
        </div>
        {error && <div className="legal-notice">{error}</div>}
        {notice && <div className="legal-notice">{notice}</div>}
        {loading && <div className="legal-empty">Loading…</div>}
        {!loading && bookings.length === 0 && (
          <div className="legal-empty">
            No requests yet.{" "}
            <Link href="/start-case" className="legal-outlinebtn" style={{ marginLeft: 8 }}>
              Describe your case
            </Link>
          </div>
        )}
        <div className="legal-firm-list" style={{ marginTop: 4 }}>
          {bookings.map((b) => (
            <article className="legal-panel" key={b.id} style={{ marginTop: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17 }}>
                    {b.firms?.name ?? "Firm"}{" "}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: STATUS_STYLES[b.status] ?? "var(--chip-bg)",
                        color: STATUS_FG[b.status] ?? "var(--muted-legal)",
                        marginLeft: 6,
                        verticalAlign: "middle",
                      }}
                    >
                      {bookingStatusLabel(b.status)}
                    </span>
                  </h3>
                  <p className="legal-tiny" style={{ margin: "6px 0 0" }}>
                    {b.cases?.legal_need} · {b.cases?.severity} urgency · {b.cases ? budgetLabel(b.cases.budget_range) : ""} ·{" "}
                    {b.cases ? modeLabel(b.cases.mode) : ""}
                  </p>
                  <p className="legal-tiny" style={{ margin: "2px 0 0" }}>
                    Sent {formatDateTime(b.created_at)}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  {b.status === "OFFER_SENT" && b.offered_price != null && (
                    <strong style={{ color: "var(--gold)", fontSize: 18 }}>{formatFullRp(b.offered_price)}</strong>
                  )}
                </div>
              </div>

              {b.status === "PENDING" && (
                <p className="legal-tiny" style={{ marginTop: 12 }}>
                  ⏳ Waiting for the firm to review your case and respond with an offer.
                </p>
              )}

              {b.status === "OFFER_SENT" && (
                <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <div className="legal-howrow"><span>Proposed time</span><strong>{formatDateTime(b.offered_time)}</strong></div>
                  <div className="legal-howrow"><span>Consultation fee</span><strong>{b.offered_price != null ? formatFullRp(b.offered_price) : "—"}</strong></div>
                  <div className="legal-howrow"><span>Meeting details</span><strong style={{ maxWidth: "60%", textAlign: "right" }}>{b.meeting_details || (b.cases?.mode === "ONLINE" ? "Video link to follow" : b.firms?.office_address || "Office address to follow")}</strong></div>
                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button
                      className="legal-primary"
                      style={{ padding: "10px 18px" }}
                      disabled={acting === b.id}
                      onClick={() => decide(b.id, true)}
                    >
                      Accept &amp; Pay
                    </button>
                    <button
                      className="legal-secondary"
                      disabled={acting === b.id}
                      onClick={() => decide(b.id, false)}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {b.status === "ACCEPTED" && (
                <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
                  <Link href={`/checkout/${b.id}`} className="legal-primary" style={{ padding: "10px 18px" }}>
                    Complete payment →
                  </Link>
                  <Link href={`/documents/${b.id}`} className="legal-outlinebtn">
                    Document vault
                  </Link>
                </div>
              )}

              {b.status === "REJECTED" && (
                <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <p className="legal-tiny" style={{ margin: 0 }}>
                    This request was declined. Your case intake is saved — request another firm in 1 click:
                  </p>
                  <Link href={`/marketplace?case=${b.case_id}`} className="legal-outlinebtn">
                    ← Back to recommended firms
                  </Link>
                </div>
              )}

              {txMap[b.id] === "SUCCESS" && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  {!reviewMap[b.id] && reviewFor !== b.id && (
                    <button
                      className="legal-outlinebtn"
                      onClick={() => {
                        setReviewFor(b.id);
                        setReviewRating(0);
                        setReviewText("");
                      }}
                    >
                      Leave a review
                    </button>
                  )}
                  {reviewMap[b.id] && reviewFor !== b.id && (
                    <div>
                      <div className="legal-tiny" style={{ margin: 0 }}>
                        Your review:{" "}
                        <strong style={{ color: "var(--gold)" }}>
                          {"★".repeat(reviewMap[b.id].rating)}
                          {"☆".repeat(5 - reviewMap[b.id].rating)}
                        </strong>
                        {reviewMap[b.id].comment ? ` — ${reviewMap[b.id].comment}` : ""}
                      </div>
                      <button
                        className="legal-outlinebtn"
                        style={{ marginTop: 8 }}
                        onClick={() => {
                          setReviewFor(b.id);
                          setReviewRating(reviewMap[b.id].rating);
                          setReviewText(reviewMap[b.id].comment ?? "");
                        }}
                      >
                        Edit review
                      </button>
                    </div>
                  )}
                  {reviewFor === b.id && (
                    <div>
                      <div className="legal-field">
                        <label>YOUR RATING</label>
                        <StarPicker value={reviewRating} onChange={setReviewRating} />
                      </div>
                      <div className="legal-field">
                        <label>REVIEW (OPTIONAL)</label>
                        <textarea
                          rows={3}
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          placeholder="How did the consultation go?"
                        />
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          className="legal-primary"
                          disabled={reviewSaving || reviewRating < 1}
                          onClick={() => submitReview(b)}
                        >
                          {reviewSaving ? "Saving..." : "Submit review"}
                        </button>
                        <button className="legal-secondary" onClick={() => setReviewFor(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </main>
    </>
  );
}