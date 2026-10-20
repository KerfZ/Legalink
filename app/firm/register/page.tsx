import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SignUpForm } from "@/components/sign-up-form";

// Dedicated law-firm registration (spec 2B). Sign-up creates the account with
// role='firm'; after email confirmation the user lands on /firm/onboarding to
// complete the full listing form (logo, hours, map location, credentials, ...).
export default function FirmRegisterPage() {
  return (
    <>
      <SiteNav />
      <main className="legal-wrap" style={{ paddingTop: 40, paddingBottom: 70, maxWidth: 640 }}>
        <div className="legal-eyebrow">Law firm registration</div>
        <h1 style={{ letterSpacing: -2, margin: "10px 0" }}>Register your firm on Legal!nk.</h1>
        <p className="legal-tiny">
          Create your provider account, then complete your listing: practice areas, price range,
          working hours, map location, logo, and license/credentials. Your listing goes live after
          an admin verifies your credentials.
        </p>
        <ul className="legal-tiny" style={{ lineHeight: 1.9, paddingLeft: 20, marginTop: 14 }}>
          <li>Receive full case intakes from matched clients</li>
          <li>Respond with counter-offers (confirmed time slot + consultation fee)</li>
          <li>Get paid via Virtual Account / QRIS with secure checkout</li>
          <li>Earn a Verified badge after credential review</li>
        </ul>
        <div style={{ marginTop: 20 }}>
          <SignUpForm initialRole="firm" />
        </div>
        <p className="legal-tiny" style={{ textAlign: "center", marginTop: 16 }}>
          Already registered? <Link href="/firm/onboarding">Complete your firm profile</Link>
        </p>
      </main>
    </>
  );
}
