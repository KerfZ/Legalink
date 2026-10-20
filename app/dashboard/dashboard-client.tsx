"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import {
  BookingOffer,
  Firm,
  Transaction,
  bookingStatusLabel,
  formatDateTime,
  formatFullRp,
  formatRange,
} from "@/lib/legalink";

type Tab = "firms" | "bookings" | "transactions" | "verification";

export default function DashboardClient() {
  const [tab, setTab] = useState<Tab>("firms");
  const [firms, setFirms] = useState<Firm[]>([]);
  const [bookings, setBookings] = useState<BookingOffer[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const supabase = createClient();
    const [{ data: f }, { data: b }, { data: t }] = await Promise.all([
      supabase.from("firms").select("*").order("created_at", { ascending: false }),
      supabase.from("booking_offers")
        .select("*, firms(name), cases(legal_need, severity)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setFirms((f ?? []) as Firm[]);
    setBookings((b ?? []) as BookingOffer[]);
    setTxns((t ?? []) as Transaction[]);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setNotice(""); setSaving(true);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const tags = String(form.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const { error: err } = await supabase.from("firms").insert({
      name: String(form.get("name")),
      initials: String(form.get("initials") || "L"),
      practice_area: String(form.get("practice_area")),
      complexity: String(form.get("complexity")),
      price_min: Number(form.get("price_min")),
      price_max: Number(form.get("price_max")),
      description: String(form.get("description")),
      tags,
      history: String(form.get("history")),
      area: String(form.get("area") ?? ""),
      office_address: String(form.get("office_address") ?? ""),
      logo_url: String(form.get("logo_url") ?? "") || null,
      google_rating: form.get("google_rating") ? Number(form.get("google_rating")) : null,
      contact_name: String(form.get("contact_name") ?? ""),
      contact_email: String(form.get("contact_email") ?? ""),
      contact_phone: String(form.get("contact_phone") ?? ""),
      is_published: true,
    });
    if (err) setError(err.message);
    else {
      setNotice("Firm added.");
      (e.target as HTMLFormElement).reset();
      refresh();
    }
    setSaving(false);
  }

  async function removeFirm(id: number) {
    if (!confirm("Delete this firm?")) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("firms").delete().eq("id", id);
    if (err) setError(err.message);
    else refresh();
  }

  async function toggleFirm(id: number, field: "is_published" | "is_featured", value: boolean) {
    const supabase = createClient();
    const { error: err } = await supabase.from("firms").update({ [field]: value }).eq("id", id);
    if (err) setError(err.message);
    else refresh();
  }

  // Credential verification: only admins may set is_verified (enforced by the
  // prevent_self_verification DB trigger as well). Approving also publishes.
  async function setVerified(id: number, value: boolean) {
    if (value && !confirm("Verify this firm's credentials and publish its listing?")) return;
    if (!value && !confirm("Revoke this firm's verification?")) return;
    const supabase = createClient();
    const { error: err } = await supabase
      .from("firms")
      .update(value ? { is_verified: true, is_published: true } : { is_verified: false })
      .eq("id", id);
    if (err) setError(err.message);
    else refresh();
  }

  const totalFees = txns
    .filter((t) => t.payment_status === "SUCCESS")
    .reduce((sum, t) => sum + t.platform_fee_amount, 0);
  const totalVolume = txns
    .filter((t) => t.payment_status === "SUCCESS")
    .reduce((sum, t) => sum + t.total_amount, 0);

  return (
    <>
      <SiteNav />
      <main className="legal-wrap legal-section">
        <div className="legal-eyebrow">Dashboard</div>
        <h1 style={{ letterSpacing: -2, margin: "8px 0" }}>Platform management.</h1>
        <p className="legal-tiny">Admin only — manage listings, monitor bookings and platform revenue.</p>
        {error && <div className="legal-notice">{error}</div>}
        {notice && <div className="legal-notice">{notice}</div>}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, margin: "18px 0 14px", flexWrap: "wrap" }}>
          {(["firms", "bookings", "transactions", "verification"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                padding: "8px 14px", borderRadius: 999, cursor: "pointer",
                border: "1px solid var(--line)",
                background: tab === t ? "var(--gold)" : "transparent",
                color: tab === t ? "var(--on-gold)" : "var(--ink)",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "firms" && (
          <div className="legal-market" style={{ marginTop: 0 }}>
            <form onSubmit={onSubmit} className="legal-panel">
              <h3 style={{ margin: 0 }}>Add a firm</h3>
              <div className="legal-field"><label>FIRM NAME</label><input name="name" required /></div>
              <div className="legal-field"><label>INITIALS</label><input name="initials" /></div>
              <div className="legal-field"><label>LOGO IMAGE URL</label><input name="logo_url" placeholder="https://…" /></div>
              <div className="legal-field"><label>AREA / CITY</label><input name="area" placeholder="e.g. Jakarta Selatan" /></div>
              <div className="legal-field"><label>OFFICE ADDRESS</label><textarea name="office_address" /></div>
              <div className="legal-field"><label>PRACTICE AREA</label>
                <select name="practice_area" required>
                  <option>Business contracts</option><option>Licensing</option>
                  <option>Civil disputes</option><option>Property</option><option>Family law</option>
                </select>
              </div>
              <div className="legal-field"><label>COMPLEXITY</label>
                <select name="complexity" required>
                  <option>Low</option><option>Medium</option><option>High</option>
                </select>
              </div>
              <div className="legal-field"><label>PRICE MIN (IDR)</label><input name="price_min" type="number" required /></div>
              <div className="legal-field"><label>PRICE MAX (IDR)</label><input name="price_max" type="number" required /></div>
              <div className="legal-field"><label>DESCRIPTION</label><textarea name="description" required /></div>
              <div className="legal-field"><label>TAGS (comma separated)</label><input name="tags" /></div>
              <div className="legal-field"><label>BRIEF HISTORY</label><textarea name="history" required /></div>
              <div className="legal-field"><label>GOOGLE REVIEW SCORE (0–5)</label><input name="google_rating" type="number" step="0.1" min={0} max={5} /></div>
              <div className="legal-field"><label>CONTACT NAME</label><input name="contact_name" /></div>
              <div className="legal-field"><label>CONTACT EMAIL</label><input name="contact_email" /></div>
              <div className="legal-field"><label>CONTACT PHONE</label><input name="contact_phone" /></div>
              <button className="legal-primary legal-full" style={{ marginTop: 14 }} disabled={saving} type="submit">
                {saving ? "Saving…" : "Add firm"}
              </button>
            </form>
            <div>
              <div className="legal-results-top">
                <strong>{loading ? "Loading…" : `${firms.length} firms`}</strong>
                <span>{firms.filter((f) => !f.is_published).length} awaiting approval</span>
              </div>
              <div className="legal-firm-list">
                {firms.map((f) => (
                  <article className="legal-firm" key={f.id}>
                    {f.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.logo_url} alt="" width={48} height={48} style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }} />
                    ) : (
                      <div className="legal-firmmark">{f.initials}</div>
                    )}
                    <div>
                      <h3>{f.name}</h3>
                      <p className="desc">{f.description}</p>
                      <div className="legal-chips">
                        <span>{f.area || "no area"}</span>
                        {f.is_featured && <span style={{ background: "var(--gold)", color: "var(--on-gold)" }}>Featured</span>}
                        {!f.is_published && <span>unpublished</span>}
                        {f.is_verified && <span style={{ background: "#1a7f37", color: "#fff" }}>verified</span>}
                      </div>
                    </div>
                    <div className="legal-firm-right">
                      <strong>{formatRange(f.price_min, f.price_max)}</strong>
                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button className="legal-outlinebtn" onClick={() => toggleFirm(f.id, "is_published", !f.is_published)}>
                          {f.is_published ? "Unpublish" : "Approve"}
                        </button>
                        <button className="legal-outlinebtn" onClick={() => toggleFirm(f.id, "is_featured", !f.is_featured)}>
                          {f.is_featured ? "Unfeature" : "Feature"}
                        </button>
                        <button className="legal-outlinebtn" onClick={() => removeFirm(f.id)}>Delete</button>
                      </div>
                    </div>
                  </article>
                ))}
                {!loading && firms.length === 0 && (
                  <div className="legal-empty">No firms yet. Add your first one.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "verification" && (
          <div>
            <div className="legal-results-top">
              <strong>{loading ? "Loading..." : `${firms.filter((f) => !f.is_verified).length} awaiting verification`}</strong>
              <span>Approving grants the Verified badge and publishes the listing</span>
            </div>
            <div className="legal-panel" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)", color: "var(--muted-legal)", fontSize: 11, letterSpacing: 1 }}>
                    <th style={{ padding: "8px 6px" }}>FIRM</th>
                    <th style={{ padding: "8px 6px" }}>CREDENTIALS</th>
                    <th style={{ padding: "8px 6px" }}>LISTING</th>
                    <th style={{ padding: "8px 6px" }}>STATUS</th>
                    <th style={{ padding: "8px 6px" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {firms.map((f) => (
                    <tr key={f.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "8px 6px" }}>{f.name}</td>
                      <td style={{ padding: "8px 6px" }}>
                        {f.credentials_url ? (
                          <a href={f.credentials_url} target="_blank" rel="noopener noreferrer">View document</a>
                        ) : (
                          "none submitted"
                        )}
                      </td>
                      <td style={{ padding: "8px 6px" }}>{f.is_published ? "Live" : "Unpublished"}</td>
                      <td style={{ padding: "8px 6px", color: f.is_verified ? "#1a7f37" : "var(--muted-legal)" }}>
                        {f.is_verified ? "Verified" : "Pending"}
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <button className="legal-outlinebtn" onClick={() => setVerified(f.id, !f.is_verified)}>
                          {f.is_verified ? "Revoke verification" : "Approve & verify"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && firms.length === 0 && <div className="legal-empty">No firms yet.</div>}
            </div>
          </div>
        )}

        {tab === "bookings" && (
          <div>
            <div className="legal-results-top"><strong>{loading ? "Loading…" : `${bookings.length} recent bookings`}</strong></div>
            <div className="legal-panel" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)", color: "var(--muted-legal)", fontSize: 11, letterSpacing: 1 }}>
                    <th style={{ padding: "8px 6px" }}>FIRM</th>
                    <th style={{ padding: "8px 6px" }}>CASE</th>
                    <th style={{ padding: "8px 6px" }}>STATUS</th>
                    <th style={{ padding: "8px 6px" }}>OFFER</th>
                    <th style={{ padding: "8px 6px" }}>CREATED</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "8px 6px" }}>{b.firms?.name ?? b.firm_id}</td>
                      <td style={{ padding: "8px 6px" }}>{b.cases?.legal_need ?? "—"} ({b.cases?.severity ?? "?"})</td>
                      <td style={{ padding: "8px 6px" }}>{bookingStatusLabel(b.status)}</td>
                      <td style={{ padding: "8px 6px" }}>{b.offered_price != null ? formatFullRp(b.offered_price) : "—"}</td>
                      <td style={{ padding: "8px 6px" }}>{formatDateTime(b.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && bookings.length === 0 && <div className="legal-empty">No bookings yet.</div>}
            </div>
          </div>
        )}

        {tab === "transactions" && (
          <div>
            <div className="legal-panel" style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
              <div><div className="legal-tiny">Successful volume</div><strong style={{ color: "var(--gold)", fontSize: 20 }}>{formatFullRp(totalVolume)}</strong></div>
              <div><div className="legal-tiny">Platform fees (20%)</div><strong style={{ color: "var(--gold)", fontSize: 20 }}>{formatFullRp(totalFees)}</strong></div>
              <div><div className="legal-tiny">Transactions</div><strong style={{ fontSize: 20 }}>{txns.length}</strong></div>
            </div>
            <div className="legal-panel" style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)", color: "var(--muted-legal)", fontSize: 11, letterSpacing: 1 }}>
                    <th style={{ padding: "8px 6px" }}>METHOD</th>
                    <th style={{ padding: "8px 6px" }}>VA / REF</th>
                    <th style={{ padding: "8px 6px" }}>TOTAL</th>
                    <th style={{ padding: "8px 6px" }}>FEE (20%)</th>
                    <th style={{ padding: "8px 6px" }}>STATUS</th>
                    <th style={{ padding: "8px 6px" }}>PAID AT</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "8px 6px" }}>{t.payment_method}{t.bank ? ` · ${t.bank}` : ""}</td>
                      <td style={{ padding: "8px 6px" }}>{t.virtual_account_no ?? t.id.slice(0, 8)}</td>
                      <td style={{ padding: "8px 6px" }}>{formatFullRp(t.total_amount)}</td>
                      <td style={{ padding: "8px 6px" }}>{formatFullRp(t.platform_fee_amount)}</td>
                      <td style={{ padding: "8px 6px" }}>{t.payment_status}</td>
                      <td style={{ padding: "8px 6px" }}>{formatDateTime(t.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && txns.length === 0 && <div className="legal-empty">No transactions yet.</div>}
            </div>
          </div>
        )}
      </main>
    </>
  );
}