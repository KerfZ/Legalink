"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { BookingOffer, Transaction, formatDateTime, formatFullRp } from "@/lib/legalink";
import { SUPPORTED_BANKS, computeFees, generateVirtualAccountNo, type BankCode } from "@/lib/payments";

type Stage = "loading" | "choose" | "va" | "paid" | "error";

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingOffer | null>(null);
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState("");
  const [method, setMethod] = useState<"VA" | "QRIS">("VA");
  const [bank, setBank] = useState<BankCode>("BCA");
  const [creating, setCreating] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push(`/auth/login?next=/checkout/${id}`);
        return;
      }
      const { data: b } = await supabase
        .from("booking_offers")
        .select("*, firms(name, initials, office_address), cases(legal_need, mode)")
        .eq("id", id)
        .single();
      if (!b) {
        setStage("error");
        setError("Booking not found.");
        return;
      }
      if (b.status !== "ACCEPTED") {
        setStage("error");
        setError(`This booking is "${b.status}" — only accepted offers can be paid.`);
        return;
      }
      setBooking(b as BookingOffer);
      const { data: t } = await supabase
        .from("transactions")
        .select("*")
        .eq("booking_offer_id", id)
        .maybeSingle();
      if (t) {
        setTxn(t as Transaction);
        setStage((t as Transaction).payment_status === "SUCCESS" ? "paid" : "va");
      } else {
        setStage("choose");
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fee = booking?.offered_price != null ? computeFees(booking.offered_price) : null;

  async function createPayment() {
    if (!booking || !fee) return;
    setCreating(true);
    setError("");
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const vaNo = method === "VA" ? generateVirtualAccountNo(bank) : null;
    const { data: t, error: err } = await supabase
      .from("transactions")
      .insert({
        booking_offer_id: booking.id,
        client_id: userData.user.id,
        total_amount: fee.totalAmount,
        platform_fee_amount: fee.platformFeeAmount,
        firm_payout_amount: fee.firmPayoutAmount,
        payment_method: method,
        bank: method === "VA" ? bank : null,
        virtual_account_no: vaNo,
        payment_status: "PENDING",
      })
      .select("*")
      .single();
    if (err) {
      setError(err.message);
      setCreating(false);
      return;
    }
    setTxn(t as Transaction);
    setStage("va");
    setCreating(false);
  }

  async function simulatePayment() {
    if (!txn) return;
    setSimulating(true);
    setError("");
    // Mock webhook: flip the transaction to SUCCESS exactly like the
    // provider callback handled by /api/payments/webhook.
    const res = await fetch("/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: txn.booking_offer_id,
        status: "SUCCESS",
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Payment confirmation failed.");
      setSimulating(false);
      return;
    }
    setTxn({ ...txn, payment_status: "SUCCESS", paid_at: new Date().toISOString() });
    setStage("paid");
    setSimulating(false);
  }

  function copyVa() {
    if (!txn?.virtual_account_no) return;
    navigator.clipboard.writeText(txn.virtual_account_no);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <SiteNav />
      <main className="legal-wrap" style={{ paddingTop: 40, paddingBottom: 70, maxWidth: 640 }}>
        <Link href="/bookings" className="legal-tiny">← Back to my requests</Link>
        <div className="legal-eyebrow" style={{ marginTop: 14 }}>Checkout</div>
        <h1 style={{ letterSpacing: -2, margin: "10px 0" }}>Pay for your consultation.</h1>

        {stage === "loading" && <div className="legal-empty" style={{ marginTop: 20 }}>Loading…</div>}
        {stage === "error" && (
          <div className="legal-notice" style={{ marginTop: 20 }}>
            {error} <Link href="/bookings">Go to my requests</Link>
          </div>
        )}

        {booking && fee && (stage === "choose" || stage === "va") && (
          <>
            <div className="legal-panel" style={{ marginTop: 18 }}>
              <div className="legal-eyebrow">Booking summary</div>
              <div className="legal-howrow"><span>Firm</span><strong>{booking.firms?.name ?? "—"}</strong></div>
              <div className="legal-howrow"><span>Case</span><strong>{booking.cases?.legal_need ?? "—"}</strong></div>
              <div className="legal-howrow"><span>Consultation time</span><strong>{formatDateTime(booking.offered_time)}</strong></div>
              <div className="legal-howrow"><span>Consultation fee</span><strong>{formatFullRp(fee.totalAmount)}</strong></div>
              <div className="legal-howrow"><span>Platform service fee (20%)</span><strong>included in total</strong></div>
              <div className="legal-howrow"><span>Total to pay</span><strong style={{ color: "var(--gold)", fontSize: 16 }}>{formatFullRp(fee.totalAmount)}</strong></div>
            </div>

            {stage === "choose" ? (
              <div className="legal-panel" style={{ marginTop: 16 }}>
                <div className="legal-eyebrow">Payment method</div>
                <div className="legal-field">
                  <label>CHOOSE BANK VIRTUAL ACCOUNT OR QRIS</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                    {SUPPORTED_BANKS.map((b) => (
                      <button
                        key={b.code}
                        type="button"
                        onClick={() => { setMethod("VA"); setBank(b.code); }}
                        style={{
                          border: `1px solid ${method === "VA" && bank === b.code ? "var(--gold)" : "var(--line)"}`,
                          background: method === "VA" && bank === b.code ? "var(--chip-bg)" : "var(--card-bg)",
                          borderRadius: 12, padding: "12px", cursor: "pointer",
                          fontSize: 13, fontWeight: 700, color: "var(--ink)", textAlign: "left",
                        }}
                      >
                        {b.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMethod("QRIS")}
                      style={{
                        gridColumn: "1 / -1",
                        border: `1px solid ${method === "QRIS" ? "var(--gold)" : "var(--line)"}`,
                        background: method === "QRIS" ? "var(--chip-bg)" : "var(--card-bg)",
                        borderRadius: 12, padding: "12px", cursor: "pointer",
                        fontSize: 13, fontWeight: 700, color: "var(--ink)", textAlign: "left",
                      }}
                    >
                      QRIS — scan with any e-wallet / banking app
                    </button>
                  </div>
                </div>
                {error && <div className="legal-notice">{error}</div>}
                <button
                  className="legal-primary legal-full"
                  style={{ marginTop: 16 }}
                  disabled={creating}
                  onClick={createPayment}
                >
                  {creating ? "Creating payment…" : method === "VA" ? `Pay with ${bank} VA` : "Pay with QRIS"}
                </button>
              </div>
            ) : (
              <div className="legal-panel" style={{ marginTop: 16 }}>
                <div className="legal-eyebrow">
                  {txn?.payment_method === "QRIS" ? "QRIS payment" : `${txn?.bank} Virtual Account`}
                </div>
                {txn?.payment_method === "QRIS" ? (
                  <p style={{ marginTop: 10, lineHeight: 1.6 }}>
                    Open your banking or e-wallet app, choose <strong>QRIS</strong>, and scan the code shown
                    at payment. The order reference is <strong>{txn?.id.slice(0, 8).toUpperCase()}</strong>.
                  </p>
                ) : (
                  <>
                    <p className="legal-tiny" style={{ marginTop: 8 }}>
                      Transfer exactly this amount to the Virtual Account number below:
                    </p>
                    <div
                      style={{
                        marginTop: 10, padding: "16px", borderRadius: 12,
                        background: "var(--chip-bg)", display: "flex",
                        justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
                      }}
                    >
                      <strong style={{ fontSize: 20, letterSpacing: 1, color: "var(--gold)" }}>
                        {txn?.virtual_account_no}
                      </strong>
                      <button className="legal-outlinebtn" onClick={copyVa}>
                        {copied ? "Copied ✓" : "Copy"}
                      </button>
                    </div>
                    <div className="legal-howrow" style={{ marginTop: 12 }}>
                      <span>Amount due</span>
                      <strong>{formatFullRp(txn?.total_amount ?? 0)}</strong>
                    </div>
                  </>
                )}
                <p className="legal-tiny" style={{ marginTop: 10 }}>
                  Status: <strong>{txn?.payment_status}</strong> — payment confirmation is automatic via webhook.
                  In this demo you can confirm it yourself:
                </p>
                {error && <div className="legal-notice">{error}</div>}
                <button
                  className="legal-primary legal-full"
                  style={{ marginTop: 12 }}
                  disabled={simulating}
                  onClick={simulatePayment}
                >
                  {simulating ? "Confirming…" : "I have paid — confirm payment (demo)"}
                </button>
              </div>
            )}
          </>
        )}

        {stage === "paid" && txn && (
          <div className="legal-panel" style={{ marginTop: 18, textAlign: "center", padding: 30 }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <h2 style={{ margin: "10px 0 4px", letterSpacing: -1 }}>Payment successful</h2>
            <p className="legal-tiny">
              Your consultation is confirmed for {formatDateTime(booking?.offered_time)}. The schedule is now locked.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
              <Link href={`/documents/${txn.booking_offer_id}`} className="legal-primary">
                Upload case documents →
              </Link>
              <Link href="/bookings" className="legal-secondary">Back to my requests</Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}