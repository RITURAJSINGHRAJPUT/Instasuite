import type { Metadata } from "next";
import { LegalPage } from "../legal-layout";

export const metadata: Metadata = {
  title: "Privacy Policy — mera-kaam",
  description: "Privacy Policy for the mera-kaam Instagram DM assistant.",
};

const CONTACT = "utsavsingh612@gmail.com";
const APP = "Instasuite";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 14, 2026">
      <p>
        This Privacy Policy explains how {APP} (&quot;we&quot;, &quot;us&quot;)
        collects, uses, and protects information when you send messages to an
        Instagram account that is connected to our service. By messaging a
        connected Instagram account, you agree to the practices described here.
      </p>

      <h2>Information we collect</h2>
      <p>
        When you send a direct message to a connected Instagram account, we
        receive and store the following through the Instagram Messaging (Meta
        Graph) API:
      </p>
      <ul>
        <li>Your Instagram-scoped ID (IGSID)</li>
        <li>
          Public profile details: name, username, profile picture, and follower
          count
        </li>
        <li>
          Whether you follow the business account and whether the business
          account follows you
        </li>
        <li>The content and timestamps of the messages you exchange</li>
      </ul>
      <p>
        We do not collect your password, payment information, or any data beyond
        what Instagram provides for the conversation.
      </p>

      <h2>How we use your information</h2>
      <ul>
        <li>To generate and send automated replies to your messages</li>
        <li>
          To display conversations in a private dashboard used by the account
          owner
        </li>
        <li>To maintain conversation history and context for replies</li>
      </ul>

      <h2>How your information is shared</h2>
      <p>
        We do not sell your personal information. We share message content with
        the following processors solely to operate the service:
      </p>
      <ul>
        <li>
          <strong>Meta Platforms</strong> — to receive and send Instagram
          messages
        </li>
        <li>
          <strong>OpenRouter</strong> — to generate AI replies from message
          content
        </li>
        <li>
          <strong>Supabase</strong> — to securely store conversation and message
          data
        </li>
      </ul>

      <h2>Data retention</h2>
      <p>
        We retain conversation and message data for as long as needed to provide
        the service. You may request deletion of your data at any time (see
        below).
      </p>

      <h2>Data deletion</h2>
      <p>
        To request deletion of your data, follow the instructions on our{" "}
        <a href="/data-deletion">Data Deletion</a> page or email us at{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We will delete your stored
        conversation and profile data within 30 days.
      </p>

      <h2>Your rights</h2>
      <p>
        You may request access to, correction of, or deletion of your personal
        data by contacting us. You can also stop all data collection at any time
        by ceasing to message the connected account and blocking it on Instagram.
      </p>

      <h2>Contact</h2>
      <p>
        For any questions about this Privacy Policy, contact us at{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
