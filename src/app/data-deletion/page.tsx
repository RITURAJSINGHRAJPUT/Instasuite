import type { Metadata } from "next";
import { LegalPage } from "../legal-layout";

export const metadata: Metadata = {
  title: "Data Deletion — mera-kaam",
  description: "How to request deletion of your data from mera-kaam.",
};

const CONTACT = "utsavsingh612@gmail.com";
const APP = "Instasuite";

export default function DataDeletionPage() {
  return (
    <LegalPage title="Data Deletion Instructions" updated="July 14, 2026">
      <p>
        {APP} stores the Instagram messages you exchange with a connected account
        along with your public profile details (name, username, profile picture,
        follower count) and your Instagram-scoped ID. You can request deletion of
        all of this data at any time.
      </p>

      <h2>How to request deletion</h2>
      <ul>
        <li>
          Email us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> with the subject
          line &quot;Data Deletion Request&quot;.
        </li>
        <li>
          Include the Instagram username you used to message the connected
          account so we can locate your data.
        </li>
      </ul>

      <h2>What happens next</h2>
      <p>
        Upon receiving your request, we will permanently delete your stored
        conversation history, message content, and profile information from our
        database within 30 days. We will confirm by email once the deletion is
        complete.
      </p>

      <h2>Contact</h2>
      <p>
        For any questions about data deletion, contact{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
