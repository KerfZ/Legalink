"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COMPLEXITIES, LEGAL_NEEDS, parseMapsCoordinates, type Firm } from "@/lib/legalink";

// Shared onboarding / profile-edit form for law firm listings.
// mode="create" inserts a new unpublished listing (admin approval required).
// mode="edit"   updates the caller's own listing (owner_id match via RLS).

const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_DOC_SIZE = 5 * 1024 * 1024; // 5MB
const LOGO_BUCKET = "firm-logos";

type Props = {
  mode: "create" | "edit";
  initial?: Firm | null;
  onSaved?: () => void;
};

export function FirmProfileForm({ mode, initial, onSaved }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Map coordinates (controlled so "paste a Maps link" / geolocation can fill them).
  const [lat, setLat] = useState(initial?.lat != null ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial?.lng != null ? String(initial.lng) : "");
  const [mapsInput, setMapsInput] = useState("");
  const [coordError, setCoordError] = useState("");

  // File uploads.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  function useMyLocation() {
    setCoordError("");
    if (!navigator.geolocation) {
      setCoordError("Geolocation is not supported by this browser. Paste a Google Maps link instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      () => setCoordError("Could not read your location. Paste a Google Maps link instead."),
    );
  }

  function applyMapsInput() {
    const coords = parseMapsCoordinates(mapsInput);
    if (!coords) {
      setCoordError("Could not parse coordinates. Paste a Google Maps link or a 'lat, lng' value.");
      return;
    }
    setCoordError("");
    setLat(String(coords.lat));
    setLng(String(coords.lng));
    setMapsInput("");
  }

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!LOGO_TYPES.includes(f.type)) {
      setError("Logo must be a JPG, PNG, or WebP image.");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_LOGO_SIZE) {
      setError("Logo must be smaller than 2MB.");
      e.target.value = "";
      return;
    }
    setError("");
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  }

  function onDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!DOC_TYPES.includes(f.type)) {
      setError("Credentials must be a PDF, JPG, PNG, or WebP file.");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_DOC_SIZE) {
      setError("Credential file must be smaller than 5MB.");
      e.target.value = "";
      return;
    }
    setError("");
    setDocFile(f);
  }

  // Uploads go to the caller's own folder: {user_id}/name-<ts>.<ext>
  // (storage policy enforces foldername[1] = auth.uid()).
  async function uploadToStorage(file: File, subfolder: string): Promise<string> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Session expired. Please log in again.");
    const ext = (file.name.split(".").pop() ?? "file").toLowerCase().replace(/[^a-z0-9]/g, "") || "file";
    const path = `${userData.user.id}/${subfolder}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Session expired. Please log in again.");
      const form = new FormData(e.currentTarget);
      const tags = String(form.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      let logoUrl = String(form.get("logo_url") ?? "") || null;
      if (logoFile) logoUrl = await uploadToStorage(logoFile, "logo");

      let credentialsUrl = initial?.credentials_url ?? null;
      if (docFile) credentialsUrl = await uploadToStorage(docFile, "credentials");

      const record = {
        name: String(form.get("name")),
        initials: String(form.get("initials") || "L"),
        practice_area: String(form.get("practice_area")),
        complexity: String(form.get("complexity")),
        price_min: Number(form.get("price_min")),
        price_max: Number(form.get("price_max")),
        description: String(form.get("description")),
        tags,
        history: String(form.get("history")),
        area: String(form.get("area")),
        office_address: String(form.get("office_address")),
        logo_url: logoUrl,
        google_rating: form.get("google_rating") ? Number(form.get("google_rating")) : null,
        contact_name: String(form.get("contact_name") ?? ""),
        contact_email: String(form.get("contact_email") ?? ""),
        contact_phone: String(form.get("contact_phone") ?? ""),
        operating_hours: String(form.get("operating_hours") ?? ""),
        lat: lat.trim() !== "" && !Number.isNaN(Number(lat)) ? Number(lat) : null,
        lng: lng.trim() !== "" && !Number.isNaN(Number(lng)) ? Number(lng) : null,
        credentials_url: credentialsUrl,
      };

      if (mode === "create") {
        const { error: err } = await supabase.from("firms").insert({
          owner_id: userData.user.id,
          created_by: userData.user.id,
          ...record,
          is_published: false, // admin approval required
        });
        if (err) throw new Error(err.message);
        router.push("/firm/dashboard");
        return;
      }

      const { error: err } = await supabase
        .from("firms")
        .update(record)
        .eq("owner_id", userData.user.id);
      if (err) throw new Error(err.message);
      setNotice("Profile saved.");
      onSaved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const currentLogo = logoPreview ?? initial?.logo_url ?? null;

  return (
    <form onSubmit={onSubmit} className="legal-panel" style={{ marginTop: 20 }}>
      <div className="legal-field"><label>FIRM NAME</label><input name="name" required defaultValue={initial?.name ?? ""} placeholder="e.g. North &amp; Co. Legal" /></div>
      <div className="legal-field"><label>INITIALS (LOGO FALLBACK)</label><input name="initials" defaultValue={initial?.initials ?? ""} placeholder="N&amp;C" /></div>

      <div className="legal-field">
        <label>FIRM LOGO (JPG / PNG / WEBP, MAX 2MB)</label>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onLogoChange} />
        {currentLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentLogo} alt="Logo preview" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", marginTop: 8 }} />
        )}
        <input name="logo_url" defaultValue={!logoFile && initial?.logo_url ? initial.logo_url : ""} placeholder="...or paste an image URL" style={{ marginTop: 8 }} />
      </div>

      <div className="legal-field"><label>AREA / CITY</label><input name="area" required defaultValue={initial?.area ?? ""} placeholder="e.g. Jakarta Selatan" /></div>
      <div className="legal-field"><label>OFFICE ADDRESS (FOR IN-PERSON VISITS)</label><textarea name="office_address" defaultValue={initial?.office_address ?? ""} placeholder="Street, city..." /></div>

      <div className="legal-field">
        <label>WORKING HOURS</label>
        <input name="operating_hours" defaultValue={initial?.operating_hours ?? ""} placeholder="e.g. Mon-Fri: 09:00 - 17:00" />
      </div>

      <div className="legal-field">
        <label>MAP LOCATION (OPTIONAL - PIN FOR GOOGLE MAPS LINKS)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <input
            value={mapsInput}
            onChange={(e) => setMapsInput(e.target.value)}
            placeholder="Paste a Google Maps link or 'lat, lng'"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button type="button" className="legal-outlinebtn" onClick={applyMapsInput}>Set from link</button>
          <button type="button" className="legal-outlinebtn" onClick={useMyLocation}>Use my location</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" aria-label="Latitude" />
          <input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" aria-label="Longitude" />
        </div>
        {coordError && <p className="legal-tiny" style={{ color: "#b42318", margin: "6px 0 0" }}>{coordError}</p>}
      </div>

      <div className="legal-field">
        <label>MAIN PRACTICE AREA</label>
        <select name="practice_area" required defaultValue={initial?.practice_area ?? ""}>
          {LEGAL_NEEDS.filter((n) => n !== "Not sure yet").map((n) => (<option key={n}>{n}</option>))}
        </select>
      </div>
      <div className="legal-field">
        <label>TYPICAL CASE COMPLEXITY HANDLED</label>
        <select name="complexity" required defaultValue={initial?.complexity ?? ""}>
          {COMPLEXITIES.map((c) => (<option key={c}>{c}</option>))}
        </select>
      </div>
      <div className="legal-field"><label>PRICE MIN (IDR)</label><input name="price_min" type="number" min={0} required defaultValue={initial?.price_min ?? ""} /></div>
      <div className="legal-field"><label>PRICE MAX (IDR)</label><input name="price_max" type="number" min={0} required defaultValue={initial?.price_max ?? ""} /></div>
      <div className="legal-field"><label>SHORT DESCRIPTION</label><textarea name="description" required defaultValue={initial?.description ?? ""} placeholder="Who you help and how..." /></div>
      <div className="legal-field"><label>TAGS (comma separated)</label><input name="tags" defaultValue={(initial?.tags ?? []).join(", ")} placeholder="SME-friendly, Fixed-scope" /></div>
      <div className="legal-field"><label>BRIEF HISTORY / BACKGROUND</label><textarea name="history" required defaultValue={initial?.history ?? ""} placeholder="Founded year, team size, notable experience..." /></div>
      <div className="legal-field"><label>GOOGLE REVIEW SCORE (0.0-5.0, OPTIONAL)</label><input name="google_rating" type="number" step="0.1" min={0} max={5} defaultValue={initial?.google_rating ?? ""} placeholder="4.6" /></div>

      <div className="legal-field">
        <label>LICENSE / CREDENTIAL DOCUMENT (STR / SK, PDF OR IMAGE, MAX 5MB)</label>
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={onDocChange} />
        {docFile && <p className="legal-tiny" style={{ margin: "6px 0 0" }}>{docFile.name}</p>}
        {!docFile && initial?.credentials_url && (
          <p className="legal-tiny" style={{ margin: "6px 0 0" }}>
            On file - <a href={initial.credentials_url} target="_blank" rel="noopener noreferrer">view current document</a>
          </p>
        )}
      </div>

      <div className="legal-field"><label>CONTACT PERSON</label><input name="contact_name" defaultValue={initial?.contact_name ?? ""} /></div>
      <div className="legal-field"><label>CONTACT EMAIL</label><input name="contact_email" type="email" defaultValue={initial?.contact_email ?? ""} /></div>
      <div className="legal-field"><label>CONTACT PHONE</label><input name="contact_phone" defaultValue={initial?.contact_phone ?? ""} /></div>

      {error && <div className="legal-notice">{error}</div>}
      {notice && <div className="legal-notice">{notice}</div>}
      <button className="legal-primary legal-full" style={{ marginTop: 16 }} disabled={loading} type="submit">
        {loading ? "Saving..." : mode === "create" ? "Submit for review" : "Save profile"}
      </button>
    </form>
  );
}
