// Legal!nk V2 — shared types & helpers

export type Firm = {
  id: number;
  owner_id?: string | null;
  name: string;
  initials: string;
  practice_area: string;
  complexity: "Low" | "Medium" | "High";
  price_min: number;
  price_max: number;
  description: string;
  tags: string[];
  history: string;
  area?: string | null;
  office_address?: string | null;
  logo_url?: string | null;
  google_rating?: number | null;
  is_featured?: boolean | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_published: boolean;
  created_at?: string;
  // joined from firm_ratings view
  in_house_rating?: number | null;
  review_count?: number | null;
};

export type Severity = "Low" | "Medium" | "High";
export type BudgetValue = "lt1m" | "1m-3m" | "3m-5m" | "gt5m";
export type ConsultMode = "ONLINE" | "OFFLINE";

export type CaseRecord = {
  id: string;
  user_id: string;
  nickname: string;
  legal_need: string;
  severity: Severity;
  budget_range: BudgetValue;
  details: string;
  preferred_time?: string | null;
  mode: ConsultMode;
  created_at?: string;
};

export type BookingStatus = "PENDING" | "OFFER_SENT" | "ACCEPTED" | "REJECTED";

export type BookingOffer = {
  id: string;
  case_id: string;
  firm_id: number;
  client_id: string;
  status: BookingStatus;
  offered_time?: string | null;
  offered_price?: number | null;
  meeting_details?: string | null;
  created_at?: string;
  responded_at?: string | null;
  firms?: Firm | null;
  cases?: CaseRecord | null;
};

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED";
export type PaymentMethod = "VA" | "QRIS";
export type BankCode = "BCA" | "Mandiri" | "BRI" | "BNI";

export type Transaction = {
  id: string;
  booking_offer_id: string;
  client_id: string;
  total_amount: number;
  platform_fee_amount: number;
  firm_payout_amount: number;
  payment_method: PaymentMethod;
  bank?: BankCode | null;
  virtual_account_no?: string | null;
  payment_status: PaymentStatus;
  paid_at?: string | null;
  created_at?: string;
};

export type CaseDocument = {
  id: string;
  case_id: string;
  booking_offer_id?: string | null;
  uploader_id: string;
  file_name: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at?: string;
};

export type FirmReview = {
  id: string;
  firm_id: number;
  client_id: string;
  booking_offer_id: string;
  rating: number;
  comment?: string | null;
  created_at?: string;
};

export const LEGAL_NEEDS = [
  "Business contracts",
  "Licensing",
  "Civil disputes",
  "Property",
  "Family law",
  "Not sure yet",
] as const;

export const SEVERITIES = ["Low", "Medium", "High"] as const;
// firms.complexity uses the same three values
export const COMPLEXITIES = SEVERITIES;

export const BUDGET_RANGES = [
  { value: "lt1m", label: "< Rp 1M", min: 0, max: 1000000 },
  { value: "1m-3m", label: "Rp 1M - 3M", min: 1000000, max: 3000000 },
  { value: "3m-5m", label: "Rp 3M - 5M", min: 3000000, max: 5000000 },
  { value: "gt5m", label: "Rp 5M+", min: 5000000, max: Number.MAX_SAFE_INTEGER },
] as const;

export const CONSULT_MODES = [
  { value: "ONLINE", label: "Online (Video Call)" },
  { value: "OFFLINE", label: "Offline (In-Person Office Visit)" },
] as const;

export const DOCUMENT_CHECKLIST = [
  { key: "identity", label: "Identity document (KTP / passport)" },
  { key: "case_docs", label: "Case-related contracts or documents" },
  { key: "evidence", label: "Supporting evidence (letters, screenshots, photos)" },
  { key: "power_of_attorney", label: "Power of attorney (surat kuasa), if applicable" },
  { key: "other", label: "Anything else relevant to your case" },
] as const;

// Platform takes a 20% software/service fee on each transaction.
export const PLATFORM_FEE_RATE = 0.2;

// Budget overlap logic for the new tiers:
// lt1m = firm starts below 1M; adjacent tiers overlap at the edges; gt5m = firm reaches above 5M.
export function matchesBudget(
  firm: Pick<Firm, "price_min" | "price_max">,
  budget: string,
): boolean {
  if (budget === "all") return true;
  if (budget === "lt1m") return firm.price_min < 1000000;
  if (budget === "1m-3m") return firm.price_max >= 1000000 && firm.price_min <= 3000000;
  if (budget === "3m-5m") return firm.price_max >= 3000000 && firm.price_min <= 5000000;
  if (budget === "gt5m") return firm.price_max > 5000000;
  return true;
}

export function budgetLabel(value: string): string {
  return BUDGET_RANGES.find((b) => b.value === value)?.label ?? value;
}

export function modeLabel(mode: string): string {
  return mode === "OFFLINE"
    ? "Offline (In-Person Office Visit)"
    : "Online (Video Call)";
}

export function severityRank(s: string): number {
  return SEVERITIES.indexOf(s as Severity);
}

// 0–9 match score used to rank marketplace recommendations for a saved case intake.
export function recommendationScore(firm: Firm, c: CaseRecord): number {
  let score = 0;
  if (c.legal_need && c.legal_need !== "Not sure yet" && firm.practice_area === c.legal_need)
    score += 3;
  if (firm.complexity === c.severity) score += 2;
  else if (Math.abs(severityRank(firm.complexity) - severityRank(c.severity)) === 1) score += 1;
  if (matchesBudget(firm, c.budget_range)) score += 2;
  if (firm.is_featured) score += 1;
  if ((firm.google_rating ?? 0) >= 4.5) score += 1;
  return score;
}

export function formatRp(n: number): string {
  const m = n / 1000000;
  const str = m.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  return `Rp${str}m`;
}

export function formatRange(min: number, max: number): string {
  return `${formatRp(min)}–${formatRp(max)}`;
}

export function formatFullRp(n: number): string {
  return `Rp${n.toLocaleString("id-ID")}`;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function bookingStatusLabel(s: BookingStatus): string {
  switch (s) {
    case "PENDING":
      return "Awaiting firm response";
    case "OFFER_SENT":
      return "Offer received";
    case "ACCEPTED":
      return "Accepted";
    case "REJECTED":
      return "Rejected";
  }
}