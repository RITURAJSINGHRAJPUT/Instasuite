# Email templates

Supabase stores auth email templates in its dashboard, not in this repo. These files are
the source of truth — edit here, then paste into
**Authentication → Emails → Templates** and save.

| File | Paste into | Live today? |
|---|---|---|
| `reset-password.html` | **Reset Password** | **Yes** — this is the one users actually receive |
| `invite-user.html` | **Invite user** | No — see below |

**Why "Reset Password" covers invites too.** `/api/admin/users` creates the account itself
and then mints a recovery link (`generateLink({ type: "recovery" })`), so a brand-new
teammate receives the *Reset Password* template, not the Invite one. That's why its copy
covers both "you forgot your password" and "you're setting one for the first time".
`invite-user.html` only becomes live if that route is switched to `inviteUserByEmail()`.

## Variables

Supabase renders Go templates. Available:

| Variable | Meaning |
|---|---|
| `{{ .ConfirmationURL }}` | The action link, including `redirect_to` |
| `{{ .Email }}` | Recipient's address |
| `{{ .SiteURL }}` | Project's configured Site URL |
| `{{ .Token }}` / `{{ .TokenHash }}` | 6-digit OTP / hash, if using code-based flows |

`{{ .ConfirmationURL }}` only lands on the right domain when **Authentication → URL
Configuration** is correct — Site URL `https://instasuite.click2pdf.in` and a redirect entry
of `https://instasuite.click2pdf.in/**`. Without the wildcard, Supabase silently rewrites the
redirect to the Site URL and the link goes to the wrong place.

## Why these templates look the way they do

The stock Supabase template is a heading, one sentence and a bare link — structurally
identical to a phishing mail, and it got filed as spam by Gmail. These are written for the
filter as much as the reader:

- **Table layout, inline CSS.** Mail clients strip `<style>` blocks.
- **No remote images, no web fonts.** Both are spam signals, and Gmail blocks images from
  unknown senders by default — an image-only header renders as an empty box.
- **The destination URL appears as visible text**, not only behind a button. A hidden
  destination is one of the strongest phishing signals, and it also rescues clients that
  strip buttons.
- **Enough prose** to fix the text-to-link ratio, and it says *why* the recipient got it.
- **Calm copy.** No caps, no exclamation marks, no "click here now".

## DNS (deliverability)

Already in place on `click2pdf.in`, verified:

- **DKIM** — `resend._domainkey.click2pdf.in`, signs `d=click2pdf.in`, so it aligns.
- **SPF** — on `send.click2pdf.in` (Resend's Return-Path, which is the domain SPF actually
  authenticates) → `include:amazonses.com ~all`.
- **DMARC** — `p=quarantine; adkim=r; aspf=r`, set by the registrar.

Worth adding on the **root** domain:

```
TXT  click2pdf.in   v=spf1 include:amazonses.com ~all
```

Safe: there is no existing root SPF to conflict with, root MX is Amazon SES inbound (not
Google Workspace), and Resend is unaffected because its Return-Path is the `send.` subdomain
with its own SPF. `~all` softfails rather than hard-rejecting.

⚠️ The stale `brevo-code` TXT record has no matching SPF include. If anything ever sends
through Brevo from this domain it will fail DMARC — and since the policy is `p=quarantine`,
that mail goes straight to spam.

## Testing

1. Send a reset to a Gmail address that has **never** marked this sender. An address where
   you already clicked "Report not spam" will inbox regardless and proves nothing.
2. In Gmail: **⋮ → Show original** → expect `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
3. Reputation on a new sending domain takes days of real sends to settle. Treat any single
   result as directional.
