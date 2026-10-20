import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;
  const raw = params?.error ?? "";

  // Map the most common causes to actionable guidance.
  let guidance = "Something went wrong while confirming your account.";
  if (raw === "No token hash or type") {
    guidance =
      "The confirmation link looks incomplete — this happens if the URL is opened directly or truncated. Open the latest confirmation email and click the link again, or resend it below.";
  } else if (/expired/i.test(raw)) {
    guidance =
      "This confirmation link has expired. Confirmation links are short-lived — request a fresh one from the sign-up success page.";
  } else if (/invalid/i.test(raw)) {
    guidance =
      "This link is invalid or was already used. If you just confirmed, try logging in directly.";
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">{guidance}</p>
      {raw && (
        <p className="mt-3 rounded-md bg-accent p-2 text-xs font-mono">
          Code error: {raw}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2 text-sm">
        <Link href="/auth/login" className="underline underline-offset-4">
          Back to login
        </Link>
        <Link href="/auth/sign-up-success" className="underline underline-offset-4">
          Resend confirmation email
        </Link>
      </div>
    </>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Account confirmation failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense>
                <ErrorContent searchParams={searchParams} />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}