"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRange } from "@/lib/legalink";

// Homepage hero carousel: shows one recommended firm at a time with
// arrow navigation (wraps around) plus dots and a 1 / N counter.
export type CarouselFirm = {
  id: number;
  name: string;
  initials: string;
  logo_url?: string | null;
  area?: string | null;
  practice_area: string;
  complexity: string;
  operating_hours?: string | null;
  description: string;
  tags?: string[] | null;
  price_min: number;
  price_max: number;
  google_rating?: number | null;
  in_house_rating?: number | null;
  review_count?: number | null;
  is_featured?: boolean | null;
  is_verified?: boolean | null;
};

export function RecommendationCarousel({ firms }: { firms: CarouselFirm[] }) {
  const [index, setIndex] = useState(0);
  if (firms.length === 0) return null;

  // Wrap-around index (also guards against stale state).
  const i = ((index % firms.length) + firms.length) % firms.length;
  const f = firms[i];
  const go = (delta: number) => setIndex((prev) => (prev + delta + firms.length) % firms.length);

  return (
    <div>
      <div className="legal-match" style={{ display: "block", marginTop: 10 }} key={f.id}>
        <div className="legal-match-head">
          {f.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.logo_url} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
          ) : (
            <div className="legal-firmmark">{f.initials}</div>
          )}
          <div>
            <strong>
              {f.name}
              {f.is_verified && (
                <span className="legal-tag" style={{ marginLeft: 6, background: "#1a7f37", color: "#ffffff" }}>Verified</span>
              )}
              {f.is_featured && (
                <span className="legal-tag" style={{ marginLeft: 6, background: "var(--gold)", color: "var(--on-gold)" }}>Featured</span>
              )}
            </strong>
            <small>
              {f.area ? `${f.area} · ` : ""}{f.practice_area} · {f.complexity} complexity
              {f.operating_hours ? ` · ${f.operating_hours}` : ""}
            </small>
          </div>
          <div className="price">{formatRange(f.price_min, f.price_max)}<small>estimated range</small></div>
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--on-gold-muted)",
            margin: "8px 0",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {f.description}
        </p>
        <div className="legal-match-foot">
          {(f.tags ?? []).slice(0, 2).map((t) => (<span className="legal-tag" key={t}>{t}</span>))}
          <span className="legal-tag">★ {f.google_rating ? Number(f.google_rating).toFixed(1) : "New"}</span>
          {f.in_house_rating != null && (
            <span className="legal-tag">★ Legal!nk {Number(f.in_house_rating).toFixed(1)} ({f.review_count})</span>
          )}
          <Link href={`/firms/${f.id}`} className="legal-tag" style={{ marginLeft: "auto" }}>
            View profile →
          </Link>
        </div>
      </div>

      {firms.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <button
            type="button"
            className="legal-outlinebtn"
            style={{ padding: "6px 14px", lineHeight: 1 }}
            onClick={() => go(-1)}
            aria-label="Previous recommended firm"
          >
            ←
          </button>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {firms.map((dot, idx) => (
              <button
                key={dot.id}
                type="button"
                aria-label={`Show ${dot.name}`}
                onClick={() => setIndex(idx)}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  background: idx === i ? "var(--on-gold)" : "var(--on-gold-muted)",
                  opacity: idx === i ? 1 : 0.45,
                }}
              />
            ))}
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "var(--on-gold-muted)", marginLeft: 6 }}>
              {i + 1} / {firms.length}
            </span>
          </div>
          <button
            type="button"
            className="legal-outlinebtn"
            style={{ padding: "6px 14px", lineHeight: 1 }}
            onClick={() => go(1)}
            aria-label="Next recommended firm"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
