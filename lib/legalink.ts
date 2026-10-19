export type Firm = {
  id: number;
  name: string;
  initials: string;
  practice_area: string;
  complexity: "Low" | "Medium" | "High";
  price_min: number;
  price_max: number;
  description: string;
  tags: string[];
  history: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_published: boolean;
  created_at?: string;
};

export type CaseInput = {
  nickname: string;
  legal_need: string;
  complexity: string;
  budget_range: string;
  details: string;
};

export const LEGAL_NEEDS = [
  "Business contracts",
  "Licensing",
  "Civil disputes",
  "Property",
  "Family law",
  "Not sure yet",
] as const;

export const COMPLEXITIES = ["Low", "Medium", "High"] as const;

export const BUDGET_RANGES = [
  { value: "low", label: "Under Rp2 million", min: 0, max: 2000000 },
  { value: "mid", label: "Rp2–5 million", min: 2000000, max: 5000000 },
  { value: "high", label: "Rp5–10 million", min: 5000000, max: 10000000 },
  { value: "premium", label: "Rp10 million+", min: 10000000, max: Number.MAX_SAFE_INTEGER },
] as const;

// Prototype overlap logic: low = min<2m, mid = max>=2m && min<=5m, high = max>5m
export function matchesBudget(firm: Pick<Firm, "price_min" | "price_max">, budget: string): boolean {
  if (budget === "all") return true;
  if (budget === "low") return firm.price_min < 2000000;
  if (budget === "mid") return firm.price_max >= 2000000 && firm.price_min <= 5000000;
  if (budget === "high" || budget === "premium") return firm.price_max > 5000000;
  return true;
}

export function formatRp(n: number): string {
  const m = n / 1000000;
  const str = m.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  return `Rp${str}m`;
}

export function formatRange(min: number, max: number): string {
  return `${formatRp(min)}–${formatRp(max)}`;
}
