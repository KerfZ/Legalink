"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/site-nav";
import {
  BookingOffer,
  CaseDocument,
  DOCUMENT_CHECKLIST,
  formatDateTime,
} from "@/lib/legalink";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default function DocumentVaultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingOffer | null>(null);
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  async function refreshDocs(supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase
      .from("case_documents")
      .select("*")
      .eq("booking_offer_id", id)
      .order("created_at", { ascending: false });
    setDocs((data ?? []) as CaseDocument[]);
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push(`/auth/login?next=/documents/${id}`);
        return;
      }
      const { data: b } = await supabase
        .from("booking_offers")
        .select("*, firms(name), cases(id, legal_need)")
        .eq("id", id)
        .single();
      if (!b) {
        setError("Booking not found.");
        setLoading(false);
        return;
      }
      setBooking(b as BookingOffer);
      const { data: t } = await supabase
        .from("transactions")
        .select("*")
        .eq("booking_offer_id", id)
        .maybeSingle();
      // Vault unlocks only when payment status is PAID (SUCCESS).
      setLocked(t?.payment_status !== "SUCCESS");
      await refreshDocs(supabase);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !booking || !booking.cases) return;
    setError("");
    setNotice("");
    setUploading(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push(`/auth/login?next=/documents/${id}`);
      return;
    }
    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`"${file.name}" rejected â€” only PDF and images (JPG/PNG/WebP) are allowed.`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError(`"${file.name}" rejected â€” max file size is 10MB.`);
        continue;
      }
      const path = `${booking.case_id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("case-documents")
        .upload(path, file, { contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        continue;
      }
      const { error: insErr } = await supabase.from("case_documents").insert({
        case_id: booking.case_id,
        booking_offer_id: id,
        uploader_id: userData.user.id,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (insErr) setError(insErr.message);
    }
    await refreshDocs(supabase);
    setUploading(false);
    e.target.value = "";
  }

  async function onDelete(doc: CaseDocument) {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    const supabase = createClient();
    await supabase.storage.from("case-documents").remove([doc.storage_path]);
    const { error: delErr } = await supabase.from("case_documents").delete().eq("id", doc.id);
    if (delErr) setError(delErr.message);
    else await refreshDocs(supabase);
  }

  async function download(doc: CaseDocument) {
    const supabase = createClient();
    const { data, error: sgErr } = await supabase.storage
      .from("case-documents")
      .createSignedUrl(doc.storage_path, 60);
    if (sgErr) {
      setError(sgErr.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <>
      <SiteNav />
      <main className="legal-wrap" style={{ paddingTop: 40, paddingBottom: 70, maxWidth: 720 }}>
        <Link href="/bookings" className="legal-tiny">â† Back to my requests</Link>
        <div className="legal-eyebrow" style={{ marginTop: 14 }}>Document vault</div>
        <h1 style={{ letterSpacing: -2, margin: "10px 0" }}>Case documents.</h1>
        {loading && <div className="legal-empty" style={{ marginTop: 20 }}>Loadingâ€¦</div>}

        {!loading && locked && (
          <div className="legal-notice" style={{ marginTop: 18 }}>
            ðŸ”’ The document vault unlocks after your payment is confirmed (status PAID).{" "}
            {booking?.status === "ACCEPTED" && (
              <Link href={`/checkout/${id}`}>Complete payment â†’</Link>
            )}
          </div>
        )}

        {!loading && !locked && booking && (
          <>
            <p className="legal-tiny" style={{ marginTop: 8 }}>
              Consultation with <strong>{booking.firms?.name}</strong> on{" "}
              {formatDateTime(booking.offered_time)} â€” schedule locked âœ…. Upload PDFs or images so your
              firm can review them before the meeting.
            </p>

            <div className="legal-panel" style={{ marginTop: 16 }}>
              <div className="legal-eyebrow">Checklist â€” before you upload</div>
              {DOCUMENT_CHECKLIST.map((item) => (
                <label
                  key={item.key}
                  style={{
                    display: "flex", gap: 10, alignItems: "center",
                    padding: "9px 0", borderBottom: "1px solid var(--line)",
                    fontSize: 13, cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!checked[item.key]}
                    onChange={(e) =>
                      setChecked((c) => ({ ...c, [item.key]: e.target.checked }))
                    }
                  />
                  <span style={{ textDecoration: checked[item.key] ? "line-through" : "none", opacity: checked[item.key] ? 0.55 : 1 }}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>

            <div className="legal-panel" style={{ marginTop: 16 }}>
              <div className="legal-eyebrow">Upload files (PDF / JPG / PNG / WebP Â· max 10MB)</div>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={onUpload}
                disabled={uploading}
                style={{ marginTop: 12, fontSize: 13 }}
              />
              {uploading && <p className="legal-tiny" style={{ marginTop: 8 }}>Uploadingâ€¦</p>}
            </div>

            {error && <div className="legal-notice">{error}</div>}
            {notice && <div className="legal-notice">{notice}</div>}

            <div className="legal-panel" style={{ marginTop: 16 }}>
              <div className="legal-eyebrow">Uploaded documents ({docs.length})</div>
              {docs.length === 0 && (
                <p className="legal-tiny" style={{ marginTop: 10 }}>
                  Nothing uploaded yet. Your firm will see files here once uploaded.
                </p>
              )}
              {docs.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: 13,
                  }}
                >
                  <div>
                    <strong>{d.mime_type === "application/pdf" ? "ðŸ“„" : "ðŸ–¼ï¸"} {d.file_name}</strong>
                    <div className="legal-tiny">
                      {d.size_bytes ? `${(d.size_bytes / 1024).toFixed(0)} KB Â· ` : ""}
                      {formatDateTime(d.created_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="legal-outlinebtn" onClick={() => download(d)}>View</button>
                    {d.uploader_id === booking.client_id && (
                      <button className="legal-outlinebtn" onClick={() => onDelete(d)}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}