# Instasuite

A multi-tenant tool for handling **Instagram Direct Messages with an AI assistant**.
A guest DMs one of your Instagram accounts, Claude drafts and sends a reply from
that account's script, and your team watches and takes over from a live inbox —
with role-based access so each teammate sees only what you allow.

Built for a restaurant group running several outlets, but the model is generic:
businesses → Instagram accounts → conversations, all tenant-scoped.

---

## What it does

- **AI auto-replies to Instagram DMs.** Each incoming message hits a signed webhook,
  is matched to the right account/business, and answered by Claude using that
  business's script (system prompt). Replies are concurrency-bounded and retried on
  transient failures.
- **Live inbox.** Conversations and messages stream in over Supabase Realtime — no
  refresh. Flip any conversation between **agent** (AI answers) and **human** (you
  answer) mode.
- **Businesses & accounts.** Connect Instagram accounts via Instagram Business Login
  (OAuth) or a pasted long-lived token. Tokens are encrypted at rest and auto-refreshed.
- **AI scripts.** Give each business a script; upload a `.txt`/`.md`/`.docx` and have
  Claude reformat it into the app's script shape.
- **Role-based access (RBAC).** Add teammates as `admin` / `manager` / `agent`, each
  scoped to a fixed set of features. Enforced server-side, not just hidden in the UI.
- **Usage & cost metering.** Every AI reply is logged with token cost; per-account and
  per-tenant rollups feed the Overview and Admin screens.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Styling | Tailwind CSS v4 (CSS-first, light/dark) |
| Data / Auth | Supabase — Postgres, Auth, Row-Level Security, Realtime |
| AI | Anthropic Claude (Opus 4.8) via `@anthropic-ai/sdk`, OpenRouter fallback |
| Messaging | Instagram Graph API (Instagram Login) |

## Roles

Access is capability-based; the source of truth is [`src/lib/permissions.ts`](src/lib/permissions.ts).

| Role | Overview | Inbox | Businesses | Scripts | Settings | Admin | Users |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **super_admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| **manager** | ✓ | ✓ | ✓ | ✓ | — | — | — |
| **agent** | — | ✓ | — | — | — | — | — |
| **client** (legacy tenant, own-scoped) | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |

Staff see the operator's data; a `client` tenant sees only its own. Every feature API
re-checks the caller's role, so hiding a nav link is never the only lock.

---

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project (Postgres + Auth)
- An Anthropic API key
- A Meta app with **Instagram** product added (for webhooks + Instagram Business Login)

### 1. Install

```bash
npm install
```

### 2. Environment

Create `.env.local` (never committed) with:

**Public (client bundle):**

| Var | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the deployment |

**Server-only secrets:**

| Var | What |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (bypasses RLS — server only) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_MODEL` | Model id (e.g. `claude-opus-4-8`) |
| `OPENROUTER_API_KEY` / `AI_MODEL` | Optional OpenRouter fallback |
| `INSTAGRAM_APP_ID` | Meta/Instagram app id (OAuth client id) |
| `META_APP_SECRET` | The **Instagram** app secret (OAuth client secret + webhook HMAC) |
| `INSTAGRAM_REDIRECT_URI` | Must exactly match the OAuth redirect registered in Meta |
| `INSTAGRAM_VERIFY_TOKEN` | Webhook verification token you choose |
| `TOKEN_ENCRYPTION_KEY` | 32-byte base64 key for AES-256-GCM token encryption — **never rotate in place; it decrypts every stored IG token** |
| `CRON_SECRET` | Bearer secret for the token-refresh cron |
| `MAX_CONCURRENT_REPLIES` | Simultaneous AI replies per instance (default `4`) |

### 3. Database

Apply the migrations in [`supabase/migrations/`](supabase/migrations/) in order
(`0001` → `0005`) via the Supabase SQL editor. They set up multi-tenant tables,
row-level security, the leads table, and the staff-role/RBAC layer.

### 4. Run

```bash
npm run dev      # http://localhost:3000
```

There is no public signup — the first super-admin is provisioned directly in Supabase,
and everyone else is added from the in-app **Users** page (which mints a one-time
password-setup link).

---

## Deployment

**Render is recommended** for this app. The reply throttle in
[`src/lib/queue.ts`](src/lib/queue.ts) is an *in-process* gate that bounds one
long-lived server — which is exactly Render's model (`next start`, single instance).
On serverless (Vercel) each webhook is an isolated invocation, so the gate can't bound
a burst. A [`render.yaml`](render.yaml) blueprint (web service + daily cron) is
included. Use the **Starter** plan, not free — free instances sleep and drop webhooks.

Vercel also works if your volume is low and bursts are rare; a `vercel.json` cron is
included. Note the concurrency gate becomes a no-op there.

After deploying, point your Instagram **webhook callback** and **OAuth redirect** at the
new domain, and set every env var above in the host's dashboard.

## Operations

See [`supabase/README.md`](supabase/README.md) for the token-refresh cron (long-lived
Instagram tokens expire after 60 days — schedule `POST /api/cron/refresh-tokens` daily)
and concurrency details.

## Architecture notes

- **`src/proxy.ts`** — Next.js 16's renamed middleware; gates every page/API behind a
  Supabase Auth session (public routes excluded via the matcher).
- **`src/lib/ownership.ts`** — `getContext()` is the single chokepoint that scopes data
  by tenant/role; every data route flows through it.
- **RLS is the safety net, not the only lock** — user-driven queries also carry an
  explicit ownership predicate, and `access_token` is never selected into a client response.

## Security

- Instagram access tokens are encrypted at rest (AES-256-GCM) and never returned to the browser.
- Webhooks are verified with the Instagram app secret (`X-Hub-Signature-256` HMAC).
- All secrets live in `.env.local` (gitignored). Never commit real keys; rotate any that leak.
