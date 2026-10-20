"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export default function SignUpSuccessPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/marketplace`,
      },
    });
    if (err) setError(err.message);
    else setSent(true);
    setSending(false);
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Thank you for signing up!
              </CardTitle>
              <CardDescription>Check your email to confirm</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                You&apos;ve successfully signed up. Please check your email to
                confirm your account before signing in.
              </p>

              <form onSubmit={resend} className="flex flex-col gap-3">
                <p className="text-sm font-medium">
                  No email yet? Resend it:
                </p>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {error && <p className="text-sm text-red-500">{error}</p>}
                {sent && (
                  <p className="text-sm text-green-600">
                    Confirmation email sent — check your inbox (and spam).
                  </p>
                )}
                <Button type="submit" variant="outline" disabled={sending}>
                  {sending ? "Sending…" : "Resend confirmation email"}
                </Button>
              </form>

              <Link
                href="/auth/login"
                className="text-sm underline underline-offset-4"
              >
                Back to login
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}