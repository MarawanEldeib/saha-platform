# Deployment Guide

## Production Stack

| Service | Purpose |
| --- | --- |
| Vercel | Hosting (Next.js 16, Fluid Compute) |
| Supabase | Database, Auth, Storage |
| Stripe + Stripe Connect | Payments + per-facility payouts |
| Resend | Transactional email |
| Twilio Verify + WhatsApp | Phone OTP + booking confirmations/reminders |
| Mapbox | Map tiles (used through MapLibre GL) |
| Upstash Redis | Rate limiting (sliding-window) |
| Sentry | Error tracking + source maps |
| Vercel Analytics | Web vitals + traffic |

## Production URLs

- Primary: [sahasports.vercel.app](https://sahasports.vercel.app)
- Legacy alias (307 → primary): `saha-platform.vercel.app`
- Custom domain `saha.ae` planned — not yet attached.

## First Deploy to Vercel

If you're setting up a fresh deployment from scratch.

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Link the project

```bash
vercel login
vercel link
```

Pick the existing `saha` project (Vercel team `marawans-projects-568c78f5`).

### 3. Pull existing env vars to local

```bash
npm run env:pull
```

This writes `.env.local` from Vercel's "Development" environment. The shared-secrets workflow is documented in [OPS.md](../OPS.md) under SAH-50.

### 4. Deploy

Master pushes auto-deploy to production via the GitHub integration. To deploy manually from the CLI:

```bash
vercel --prod
```

## Environment Variables

The full list lives in `.env.example`. Set every variable in Vercel Dashboard → Project Settings → Environment Variables, scoped to **Development**, **Preview**, and **Production** as appropriate.

### Required for the app to boot

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never exposed to the browser
- `NEXT_PUBLIC_APP_URL` — different per environment (e.g. `https://sahasports.vercel.app` in prod, `http://localhost:3000` in dev)
- `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET` — matches the webhook endpoint registered in Stripe Dashboard
- `RESEND_API_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN` — URL-restricted in the Mapbox dashboard ([OPS.md SAH-74](../OPS.md))

### Required in production

- `CRON_SECRET` — `Authorization: Bearer <CRON_SECRET>` is enforced on every `/api/cron/*` route
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_WHATSAPP_FROM` — phone OTP + WhatsApp messages
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — rate limiting (auth, booking, public API)

### Optional but recommended

- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` — error tracking + source maps
- `SENTRY_ORG`, `SENTRY_PROJECT` — Sentry build integration

## Vercel Cron Jobs

Configured in `vercel.json`:

| Path | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/reminder-emails` | Daily 07:00 UTC | Email + WhatsApp 24h-out reminders |
| `/api/cron/mark-no-shows` | Daily 23:00 UTC | Flip un-checked-in confirmed bookings to `no_show`; chains review prompts |
| `/api/cron/review-prompts` | Triggered by mark-no-shows | Email completed-booking players for reviews |

Each route requires `Authorization: Bearer $CRON_SECRET`.

## Branch Strategy

- `master` is the only long-lived branch — merging deploys to production via the Vercel GitHub integration.
- Feature branches deploy to preview URLs (`*.vercel.app`) automatically.
- `staging` environment + branch is tracked in [OPS.md SAH-100](../OPS.md) (manual setup pending).

## Database Migrations

Migrations are **not** applied automatically on deploy. They are run manually:

```bash
supabase db push
```

Or paste SQL into Supabase Dashboard → SQL Editor for one-offs. See [docs/database.md](database.md) for the schema reference.

## Source-map Upload

Sentry source maps are uploaded during the Vercel build when `SENTRY_AUTH_TOKEN` is set. Builds without the token still succeed — uploads are silently skipped (see `next.config.ts`).
