import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteNav } from "@/components/site-nav";
import { formatRange } from "@/lib/legalink";

export default async function FirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: firm, error } = await supabase.from("firms").select("*").eq("id", id).single();
  if (error || !firm) return notFound();

  return (
    <>
      <SiteNav />
      <main className="legal-wrap" style={{ paddingTop: 40, paddingBottom: 70, maxWidth: 820 }}>
        <Link href="/marketplace" className="legal-tiny">← Back to marketplace</Link>
        <div className="legal-panel" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div className="legal-firmmark" style={{ width: 56, height: 56 }}>{firm.initials}</div>
            <div>
              <h1 style={{ margin: 0, letterSpacing: -1 }}>{firm.name}</h1>
              <p className="legal-tiny">{firm.practice_area} · {firm.complexity} complexity</p>
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
        </div>

        <div className="legal-panel" style={{ marginTop: 16 }}>
          <div className="legal-eyebrow">Brief history</div>
          <p style={{ lineHeight: 1.65 }}>{firm.history || "No history added yet."}</p>
        </div>

        <div className="legal-panel" style={{ marginTop: 16 }}>
          <div className="legal-eyebrow">Contact information</div>
          <div className="legal-howrow"><span>Contact person</span><strong>{firm.contact_name || "—"}</strong></div>
          <div className="legal-howrow"><span>Email</span><strong>{firm.contact_email || "—"}</strong></div>
          <div className="legal-howrow"><span>Phone</span><strong>{firm.contact_phone || "—"}</strong></div>
          <p className="legal-tiny">Confirm scope, availability, and fees directly with the firm.</p>
        </div>
      </main>
    </>
  );
}
