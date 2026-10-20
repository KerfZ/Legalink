"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import {
  BookingOffer,
  Firm,
  budgetLabel,
  formatDateTime,
  formatFullRp,
  modeLabel,
} from "@/lib/legalink";

// Firm dashboard: incoming booking requests + counter-offer responses.
export default function FirmDashboardPage() {
  const router = useRouter();
  const [firm, setFirm] = useState<Firm | null>(null);
  const [bookings, setBookings] = useState<BookingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  // Counter-offer form state (per selected booking).
  const [respondId, setRespondId] = useState<string | null>(null);
  const [offeredTime, setOfferedTime] = useState("");
  const [offeredPrice, setOfferedPrice] = useState("");
  const [meetingDetails, setMeetingDetails] = useState("");

  async function refresh(supabase: ReturnType<typeof createClient>, userId: string) {
    const { data: f } = await supabase
      .from("firms")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    setFirm((f as Firm) ?? null);
    if (f) {
      const { data } = await supabase
        .from("booking_offers")
        .select("*, cases(nickname, legal_need, severity, budget_range, details, preferred_time, mode)")
        .eq("firm_id", f.id)
        .order("created_at", { ascending: false });
      setBookings((data ?? []) as BookingOffer[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/auth/login?next=/firm/dashboard");
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
      await refresh(supabase, userData.user.id);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startRespond(b: BookingOffer) {
    setRespondId(b.id);
    setError("");
    // Prefill with the client's preferred time; meeting details by mode.
    setOfferedTime(b.cases?.preferred_time ? b.cases.preferred_time.slice(0, 16) : "");
    setOfferedPrice("");
    setMeetingDetails(
      b.cases?.mode === "ONLINE"
        ? "Google Meet link: "
        : firm?.office_address || "",
    );
  }

  async function sendOffer(b: BookingOffer) {
    setActing(b.id);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase
      .from("booking_offers")
      .update({
        status: "OFFER_SENT",
        offered_time: new Date(offeredTime).toISOString(),
        offered_price: Number(offeredPrice),
        meeting_details: meetingDetails.trim(),
        responded_at: new Date().toISOString(),
      })
      .eq("id", b.id)
      .eq("status", "PENDING");
    if (err) setError(err.message);
    else {
      setNotice("Offer sent to the client. They can accept → payment, or decline.");
      setRespondId(null);
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) await refresh(supabase, userData.user.id);
    }
    setActing(null);
  }

  async function decline(b: BookingOffer) {
    if (!confirm("Decline this booking request?")) return;
    setActing(b.id);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("booking_offers")
      .update({ status: "REJECTED", responded_at: new Date().toISOString() })
      .eq("id", b.id)
      .eq("status", "PENDING");
    if (err) setError(err.message);
    else {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) await refresh(supabase, userData.user.id);
    }
    setActing(null);
  }

  return (
    <>
      <SiteNav />
      <main className="legal-wrap legal-section" style={{ maxWidth: 900 }}>
        <div className="legal-section-head">
          <div>
            <div className="legal-eyebrow">Firm dashboard</div>
            <h2>Incoming requests.</h2>
          </div>
          <p>Review each case intake, then send a counter-offer with time, fee, and meeting details.</p>
          <Link href="/firm/profile" className="legal-outlinebtn">Edit profile</Link>
        </div>

        {loading && <div className="legal-empty">Loading…</div>}

        {!loading && !firm && (
          <div className="legal-empty">
            Your firm profile isn&apos;t set up yet.{" "}
            <Link href="/firm/onboarding" className="legal-outlinebtn" style={{ marginLeft: 8 }}>
              Complete onboarding
            </Link>
          </div>
        )}

        {firm && !firm.is_published && (
          <div className="legal-notice">
            ⏳ Your listing is awaiting admin approval. You can still receive requests once published.
          </div>
        )}

        {firm && !firm.is_verified && (
          <div className="legal-notice">
            Verification pending: upload your license/credentials from Edit profile so an admin can grant your Verified badge.
          </div>
        )}

        {error && <div className="legal-notice">{error}</div>}
        {notice && <div className="legal-notice">{notice}</div>}

        <div className="legal-firm-list" style={{ marginTop: 14 }}>
          {bookings.map((b) => (
            <article className="legal-panel" key={b.id} style={{ marginTop: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>
                    {b.cases?.legal_need ?? "Case"}{" "}
                    <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: b.status === "PENDING" ? "var(--chip-bg)" : "var(--gold)", color: b.status === "PENDING" ? "var(--muted-legal)" : "var(--on-gold)", marginLeft: 6, verticalAlign: "middle" }}>
                      {b.status.replace("_", " ")}
                    </span>
                  </h3>
                  <p className="legal-tiny" style={{ margin: "6px 0 0" }}>
                    {b.cases?.severity} urgency · {b.cases ? budgetLabel(b.cases.budget_range) : ""} ·{" "}
                    {b.cases ? modeLabel(b.cases.mode) : ""} · preferred {formatDateTime(b.cases?.preferred_time)}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  {b.status === "OFFER_SENT" && b.offered_price != null && (
                    <strong style={{ color: "var(--gold)" }}>Your offer: {formatFullRp(b.offered_price)}</strong>
                  )}
                  {b.status === "ACCEPTED" && (
                    <strong style={{ color: "#1a7f37" }}>✅ Accepted &amp; paid</strong>
                  )}
                </div>
              </div>

              {b.cases?.details && (
                <div className="legal-notice" style={{ marginTop: 12 }}>
                  <strong>Client&apos;s description:</strong> {b.cases.details}
                </div>
              )}

              {b.status === "PENDING" && respondId !== b.id && (
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button className="legal-primary" style={{ padding: "9px 16px" }} onClick={() => startRespond(b)}>
                    Send counter-offer
                  </button>
                  <button className="legal-secondary" disabled={acting === b.id} onClick={() => decline(b)}>
                    Decline
                  </button>
                </div>
              )}

              {b.status === "PENDING" && respondId === b.id && (
                <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <div className="legal-field">
                    <label>CONFIRMED CONSULTATION TIME SLOT</label>
                    <input type="datetime-local" value={offeredTime} onChange={(e) => setOfferedTime(e.target.value)} required />
                  </div>
                  <div className="legal-field">
                    <label>AGREED CONSULTATION FEE (IDR)</label>
                    <input type="number" min={0} value={offeredPrice} onChange={(e) => setOfferedPrice(e.target.value)} required placeholder="e.g. 1500000" />
                  </div>
                  <div className="legal-field">
                    <label>MEETING DETAILS {b.cases?.mode === "ONLINE" ? "(VIDEO LINK)" : "(OFFICE ADDRESS)"}</label>
                    <textarea value={meetingDetails} onChange={(e) => setMeetingDetails(e.target.value)} required />
                  </div>
                  {error && <div className="legal-notice">{error}</div>}
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      className="legal-primary"
                      disabled={acting === b.id || !offeredTime || !offeredPrice}
                      onClick={() => sendOffer(b)}
                    >
                      {acting === b.id ? "Sending…" : "Send offer"}
                    </button>
                    <button className="legal-secondary" onClick={() => setRespondId(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {b.status === "OFFER_SENT" && (
                <p className="legal-tiny" style={{ marginTop: 10 }}>
                  ⏳ Offer sent {formatDateTime(b.responded_at)} — waiting for the client&apos;s decision.
                </p>
              )}

              {b.status === "ACCEPTED" && (
                <div style={{ marginTop: 10 }}>
                  <Link href={`/documents/${b.id}`} className="legal-outlinebtn">View uploaded documents</Link>
                </div>
              )}
            </article>
          ))}
          {!loading && firm && bookings.length === 0 && (
            <div className="legal-empty">No booking requests yet. They&apos;ll appear here when clients request you.</div>
          )}
        </div>
      </main>
    </>
  );
}