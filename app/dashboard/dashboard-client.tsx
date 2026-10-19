"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { Firm, formatRange } from "@/lib/legalink";

export default function DashboardClient({ isAdmin }: { isAdmin: boolean }) {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase.from("firms").select("*").order("created_at", { ascending: false });
    setFirms((data ?? []) as Firm[]);
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

  return (
    <>
      <SiteNav />
      <main className="legal-wrap legal-section">
        <div className="legal-eyebrow">Dashboard</div>
        <h1 style={{ letterSpacing: -2, margin: "8px 0" }}>Manage firms.</h1>
        <p className="legal-tiny">
          Database starts empty. {isAdmin ? "You are admin." : "Need admin role — run SQL at bottom of schema.sql."}
        </p>
        {error && <div className="legal-notice">{error}</div>}
        {notice && <div className="legal-notice">{notice}</div>}
        <div className="legal-market" style={{ marginTop: 20 }}>
          <form onSubmit={onSubmit} className="legal-panel">
            <h3 style={{ margin: 0 }}>Add a firm</h3>
            <div className="legal-field"><label>FIRM NAME</label><input name="name" required disabled={!isAdmin} /></div>
            <div className="legal-field"><label>INITIALS</label><input name="initials" disabled={!isAdmin} /></div>
            <div className="legal-field"><label>PRACTICE AREA</label>
              <select name="practice_area" required disabled={!isAdmin}>
                <option>Business contracts</option><option>Licensing</option>
                <option>Civil disputes</option><option>Property</option><option>Family law</option>
              </select>
            </div>
            <div className="legal-field"><label>COMPLEXITY</label>
              <select name="complexity" required disabled={!isAdmin}>
                <option>Low</option><option>Medium</option><option>High</option>
              </select>
            </div>
            <div className="legal-field"><label>PRICE MIN (IDR)</label><input name="price_min" type="number" required disabled={!isAdmin} /></div>
            <div className="legal-field"><label>PRICE MAX (IDR)</label><input name="price_max" type="number" required disabled={!isAdmin} /></div>
            <div className="legal-field"><label>DESCRIPTION</label><textarea name="description" required disabled={!isAdmin} /></div>
            <div className="legal-field"><label>TAGS (comma separated)</label><input name="tags" disabled={!isAdmin} /></div>
            <div className="legal-field"><label>BRIEF HISTORY</label><textarea name="history" required disabled={!isAdmin} /></div>
            <div className="legal-field"><label>CONTACT NAME</label><input name="contact_name" disabled={!isAdmin} /></div>
            <div className="legal-field"><label>CONTACT EMAIL</label><input name="contact_email" disabled={!isAdmin} /></div>
            <div className="legal-field"><label>CONTACT PHONE</label><input name="contact_phone" disabled={!isAdmin} /></div>
            <button className="legal-primary legal-full" style={{ marginTop: 14 }} disabled={!isAdmin || saving} type="submit">
              {saving ? "Saving…" : "Add firm"}
            </button>
          </form>
          <div>
            <div className="legal-results-top">
              <strong>{loading ? "Loading…" : `${firms.length} firms`}</strong>
            </div>
            <div className="legal-firm-list">
              {firms.map((f) => (
                <article className="legal-firm" key={f.id}>
                  <div className="legal-firmmark">{f.initials}</div>
                  <div>
                    <h3>{f.name}</h3>
                    <p className="desc">{f.description}</p>
                  </div>
                  <div className="legal-firm-right">
                    <strong>{formatRange(f.price_min, f.price_max)}</strong>
                    {isAdmin && (
                      <div style={{ marginTop: 8 }}>
                        <button className="legal-outlinebtn" onClick={() => removeFirm(f.id)}>Delete</button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {!loading && firms.length === 0 && (
                <div className="legal-empty">No firms yet. Add your first one.</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
