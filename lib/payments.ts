// Legal!nk V2 Ã¢â‚¬â€ Virtual Account / QRIS payment helpers.
//
// Provider abstraction: the default provider is "mock", which generates
// deterministic-looking VA numbers locally so the whole booking Ã¢â€ â€™ payment Ã¢â€ â€™
// document-vault flow can be exercised without external credentials.
// To wire a real gateway (Midtrans, Xendit, Ã¢â‚¬Â¦) later:
//   1. set NEXT_PUBLIC_PAYMENT_PROVIDER=midtrans (etc.) in .env.local
//   2. implement createVirtualAccount() / verifyWebhookSignature() below
// The webhook route (/api/payments/webhook) is provider-agnostic: it accepts
// { virtualAccountNo | orderId, status } and flips the transaction row.

import { PLATFORM_FEE_RATE, type BankCode, type PaymentMethod } from "./legalink";

export type { BankCode, PaymentMethod };

export const SUPPORTED_BANKS: { code: BankCode; label: string; prefix: string }[] = [
  { code: "BCA", label: "BCA Virtual Account", prefix: "3901" },
  { code: "Mandiri", label: "Mandiri Virtual Account", prefix: "8908" },
  { code: "BRI", label: "BRI Virtual Account", prefix: "1322" },
  { code: "BNI", label: "BNI Virtual Account", prefix: "9885" },
];

export type FeeBreakdown = {
  totalAmount: number;
  platformFeeAmount: number;
  firmPayoutAmount: number;
};

// 20% platform software/service fee recorded on every transaction.
export function computeFees(consultationFee: number): FeeBreakdown {
  const platformFeeAmount = Math.round(consultationFee * PLATFORM_FEE_RATE);
  return {
    totalAmount: consultationFee,
    platformFeeAmount,
    firmPayoutAmount: consultationFee - platformFeeAmount,
  };
}

// Mock VA number: bank prefix + timestamp-derived block + checksum digits.
export function generateVirtualAccountNo(bank: BankCode): string {
  const prefix = SUPPORTED_BANKS.find((b) => b.code === bank)?.prefix ?? "3901";
  const stamp = Date.now().toString().slice(-10);
  let checksum = 0;
  for (const ch of stamp) checksum = (checksum + Number(ch)) % 10;
  return `${prefix}${stamp}${checksum}`;
}

export function isQris(method: PaymentMethod): boolean {
  return method === "QRIS";
}

// Placeholder for real gateway signature verification (e.g. Midtrans SHA512).
// Mock provider accepts any payload so the demo simulate button always works.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function verifyWebhookSignature(_payload: unknown, _signature: string | null): boolean {
  const provider = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ?? "mock";
  if (provider === "mock") return true;
  return false; // real providers must implement proper verification
}