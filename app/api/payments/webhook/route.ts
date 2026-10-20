import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookSignature } from "@/lib/payments";
import type { PaymentStatus } from "@/lib/legalink";

// POST /api/payments/webhook
// Provider-agnostic payment confirmation endpoint.
// Real gateways (Midtrans, Xendit, ...) call this with a signed payload; the
// demo checkout calls it directly to simulate a successful VA transfer.
// On SUCCESS the transaction is flipped, which unlocks the document vault
// (vault RLS checks payment_status = 'SUCCESS').
export async function POST(request: NextRequest) {
  let payload: { orderId?: string; virtualAccountNo?: string; status?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const signature = request.headers.get("x-signature");
  if (!verifyWebhookSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const orderId = payload.orderId ?? payload.virtualAccountNo;
  const rawStatus = (payload.status ?? "").toUpperCase();
  if (!orderId || !["SUCCESS", "FAILED"].includes(rawStatus)) {
    return NextResponse.json(
      { error: "orderId (booking_offer_id) and status (SUCCESS|FAILED) are required" },
      { status: 400 },
    );
  }
  const status = rawStatus as PaymentStatus;

  // Service-role client bypasses RLS so the status flip works even though
  // no UPDATE policy exists for authenticated users on transactions.
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_SECRET_KEY is not configured on the server" },
      { status: 503 },
    );
  }

  // Look up the transaction by booking id (orderId) or VA number.
  let query = supabase.from("transactions").select("id, payment_status");
  if (/^\d{12,}$/.test(orderId)) {
    query = query.eq("virtual_account_no", orderId);
  } else {
    query = query.eq("booking_offer_id", orderId);
  }
  const { data: txn, error: findError } = await query.maybeSingle();
  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!txn) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }
  if (txn.payment_status === "SUCCESS") {
    // Idempotent: already settled.
    return NextResponse.json({ ok: true, alreadySettled: true });
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      payment_status: status,
      paid_at: status === "SUCCESS" ? new Date().toISOString() : null,
    })
    .eq("id", txn.id)
    .eq("payment_status", "PENDING"); // guard against racing updates

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status });
}