# Saha — Architecture (one-pager)

This is the short version. For full context see [PROJECT_REPORT.md](../PROJECT_REPORT.md) and [SAHA-ARCHITECTURE-REVIEW.md](SAHA-ARCHITECTURE-REVIEW.md). For ops playbooks see [RUNBOOK_STRIPE.md](RUNBOOK_STRIPE.md) and [RUNBOOK_ADMIN.md](RUNBOOK_ADMIN.md).

## What it is

UAE-first court-booking platform for racket sports (Padel, Tennis, Squash, Badminton, Pickleball). Players discover and book courts, owners list facilities and accept Stripe Connect payouts (10% platform fee), admins approve listings and monitor the platform.

## Topology

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser / Mobile web                            │
│                                                                         │
│   /[locale]/...    /dashboard (owner)    /admin (super admin)           │
│      Player UI         Owner UI               Admin UI                  │
│                                                                         │
│  Bilingual EN/AR · CSP · HSTS · client state via React 19 + RHF         │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ HTTPS · SameSite=Lax cookies
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                Vercel — Next.js 16 App Router (Fluid Compute)           │
│                                                                         │
│   Server Components · Server Actions · Route Handlers · proxy.ts        │
│                                                                         │
│   ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────────┐    │
│   │ Server      │  │ Route       │  │ Cron (vercel.json)           │    │
│   │ Actions     │  │ Handlers    │  │  reminder-emails  daily 07:00│    │
│   │ (mutations) │  │ (Stripe wh, │  │  mark-no-shows    daily 23:00│    │
│   │             │  │  bookings   │  │    └─ chains review-prompts  │    │
│   │             │  │  export,    │  │                              │    │
│   │             │  │  Stripe API)│  │                              │    │
│   └──────┬──────┘  └──────┬──────┘  └──────────────┬───────────────┘    │
└──────────┼────────────────┼────────────────────────┼────────────────────┘
           │ service-role   │ anon-key + RLS         │ admin client
           │ (admin client) │                        │
           ▼                ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Supabase                                   │
│                                                                         │
│   Postgres + RLS  ·  Auth (JWT)  ·  Storage (avatars, facility-images)  │
│                                                                         │
│   PostGIS · pg_trgm · audit_log · stripe_events (idempotency)           │
└──────────┬───────────────────────────────────────────┬──────────────────┘
           │                                           │
           ▼                                           ▼
┌─────────────────────────┐                ┌─────────────────────────────┐
│   Stripe Connect        │                │ Twilio  · Resend            │
│   (Express, AED, 10%    │                │ WhatsApp  · Email           │
│    application fee)     │                │                             │
└─────────────────────────┘                └─────────────────────────────┘
```

## Key invariants

- **Service-role key never reaches the browser.** All mutations go through Server Actions or Route Handlers. The admin client (`src/lib/supabase/admin.ts`) is only used in cron, webhooks, and a small set of admin-scoped server actions.
- **RLS is the security boundary**, not the API layer. Every table has policies. The escape hatch is `createAdminClient()` which is logged when used in mutating paths.
- **Stripe is the source of truth for money.** We never touch card data. Player pays → 90% transferred to owner via `transfer_data` + 10% application fee → platform account.
- **Webhooks are idempotent** via `public.stripe_events(id PK, type, received_at)`. Stripe retries are no-ops after the first delivery.
- **Owners can have multiple facilities** since SAH-65; the active facility is selected via the `saha_facility_id` cookie validated against `owner_id` on every dashboard read.
- **Reviews require a completed booking** (RLS + UI guard). Stops drive-by fake reviews and competitor sabotage.
- **Audit log** captures every admin/cancel/refund/no-show transition with actor, role, IP, user-agent, JSON metadata. Append-only, admin-readable.
- **Country defaults to AE.** Multi-currency exists at the DB layer (`facilities.currency`); per-region Stripe accounts are tracked in [SAH-106](https://linear.app/saha-platform/issue/SAH-106).

## Data — the 16 tables that matter

```text
                    ┌──────────────┐
                    │ auth.users   │
                    └──────┬───────┘
                           │ 1:1 (trigger)
                           ▼
                    ┌──────────────┐
                    │  profiles    │  role · phone · no_show_count
                    └──┬───────────┘
                  owner│       player
                       ▼
            ┌──────────────────┐
            │   facilities     │
            │  slug · currency │
            │  stripe_account  │
            └──┬───────┬───────┘
               │       │
        sports │       │ courts
               ▼       ▼
   ┌─────────────────┐ ┌──────────┐
   │ facility_sports │ │  courts  │
   └─────────────────┘ └────┬─────┘
                            │
                            ▼
                    ┌──────────────────┐    ┌──────────────┐
                    │ court_availability│    │  reviews     │ (1 per user/facility)
                    └────────┬─────────┘    └──────────────┘
                             │
                             ▼
                    ┌──────────────────┐    ┌──────────────┐
                    │   bookings       │───►│  payments    │
                    │  qr_code_token   │    │  stripe ids  │
                    │  status          │    └──────────────┘
                    │  num_players     │
                    │  reminder_sent   │
                    │  review_prompt   │
                    └──────┬───────────┘
                           │
                  guests   ▼
                  ┌──────────────────┐
                  │  booking_guests  │ (split-pay stub for SAH-92)
                  └──────────────────┘
```

Plus `events`, `audit_log`, `stripe_events`, `matchmaking_posts`, `facility_hours`, `facility_images`, `sports`.

## Routing

- `/[locale]/...` — public routes (map, facilities, events, community, bookings).
- `/[locale]/f/[slug]` — branded facility URL (SAH-89).
- `/[locale]/events/[id]` — public event detail (SAH-107).
- `/[locale]/dashboard/...` — owner workspace, redirects admins to `/admin`.
- `/[locale]/admin/...` — super-admin panel with its own sidebar (SAH-108).
- `/api/stripe/{webhook,connect,disconnect,account-session}` — Stripe integration.
- `/api/cron/{reminder-emails,mark-no-shows}` — scheduled jobs.

## Trust boundaries

| From → To | Auth | Authorization |
|---|---|---|
| Browser → Server Action | Supabase JWT cookie | `auth.getUser()` + RLS |
| Browser → Route Handler (`/api/...`) | Supabase JWT cookie OR `Bearer CRON_SECRET` | Per-route guard |
| Stripe → `/api/stripe/webhook` | `Stripe-Signature` header verified | Whitelisted event types only |
| Vercel Cron → `/api/cron/*` | `Bearer CRON_SECRET` | Cron-only |
| Server Action → Postgres | Cookie-bound user | RLS policies |
| Webhook/Cron → Postgres | Service role key | Bypasses RLS — used sparingly |

## Where to look

- **Booking flow**: `src/app/[locale]/dashboard/actions.ts` (`createBookingAndCheckoutAction`, `cancelBookingAction`, `ownerCancelBookingAction`).
- **Webhook handlers**: `src/app/api/stripe/webhook/route.ts`.
- **RLS / DB schema**: `supabase/migrations/` (read in order — initial + the dated incremental files).
- **i18n**: `messages/en.json`, `messages/ar.json`, `src/i18n/`.
- **Active facility helper**: `src/lib/facility-context.ts`.
- **Audit logging**: `src/lib/audit.ts`.

---

*Updated: 2026-05-09. Replace this doc on any major architectural change. The companion long-form is `PROJECT_REPORT.md`.*
