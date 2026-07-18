import type { Metadata } from "next";
import { LegalPage } from "../legal-layout";

export const metadata: Metadata = {
  title: "Terms of Service — mera-kaam",
  description: "Terms of Service for the mera-kaam Instagram DM assistant.",
};

const CONTACT = "utsavsingh612@gmail.com";
const APP = "Instasuite";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 14, 2026">
      <p>
        These Terms of Service govern your use of {APP} (the
        &quot;Service&quot;), an automated assistant that responds to Instagram
        direct messages on behalf of a connected business account. By interacting
        with a connected account, you agree to these terms.
      </p>

      <h2>The service</h2>
      <p>
        The Service uses the Instagram Messaging API and an AI model to generate
        automated replies. Replies are generated automatically and may not always
        be accurate. Do not rely on the Service for professional, legal, medical,
        or financial advice.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use the Service for any unlawful or abusive purpose</li>
        <li>Do not attempt to disrupt, overload, or reverse-engineer the Service</li>
        <li>Do not send content that violates Instagram&apos;s or Meta&apos;s policies</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any kind.
        We do not guarantee that the Service will be uninterrupted, error-free, or
        that AI-generated responses will be correct.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {APP} shall not be liable for any
        indirect, incidental, or consequential damages arising from your use of
        the Service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms from time to time. Continued use of the Service
        after changes constitutes acceptance of the revised terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
