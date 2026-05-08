# Saha Platform — Project Report

> **Saha** is a court-booking platform for racket sports in the UAE — Padel, Tennis, Squash, Badminton, Pickleball.
> It connects players with local sports facilities, lets facility owners list courts, manage availability, and accept payments via Stripe Connect, and gives admins approval queues + an audit log.

The previous version of this file described a German student-focused product. That was the legacy positioning. Reality is UAE-first sports-booking. Anything below reflects the current state of `master`.

---

## 1. Product

| Audience | What they get |
|---|---|
| Players | Discover nearby courts, filter by sport, view ratings, book a slot, pay via Stripe, receive WhatsApp + email confirmations, scan a QR code at check-in |
| Facility owners | Onboard via 3-step flow, manage courts + availability + hours + photos, accept Stripe Connect payouts (10% platform fee), see a finance dashboard, cancel + refund bookings |
| Admins | Approve / reject facility applications and events, view platform-wide audit log |

Geography: UAE first. Multi-region (KSA, EG, OM) is tracked in [SAH-103](https://linear.app/saha-platform/issue/SAH-103) (currency) and [SAH-106](https://linear.app/saha-platform/issue/SAH-106) (per-region Stripe).

Languages: English + Arabic. RTL is set on `<html dir="rtl">` for `ar`.

---

## 2. Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript 5) |
| Database | Supabase Postgres (PostGIS + pg_trgm) |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage — `facility-images`, `avatars` |
| Payments | Stripe Connect (Express, AED, 10% application fee + transfer_data) |
| Email | Resend |
| WhatsApp | Twilio |
| Map | MapLibre GL + CARTO basemaps + Mapbox Geocoding |
| i18n | next-intl |
| Deployment | Vercel + Vercel Cron + GitHub Actions CI |

---

## 3. Architecture (high level)

```
Browser
  │
  │ HTTPS
  ▼
Vercel (Next.js — App Router, Server Actions, Route Handlers)
  │            │             │
  │            │             ▼
  │            │       /api/stripe/webhook ──► Stripe
  │            ▼
  │      /api/cron/*  (reminder-emails, mark-no-shows)
  ▼
Supabase
  ├── Postgres + RLS
  ├── Auth
  └── Storage
```

- All mutations go through Server Actions or Route Handlers — the browser never holds the service-role key.
- Auth runs through `@supabase/ssr` middleware (`src/proxy.ts`) which refreshes JWT cookies and gates `/admin` and `/dashboard`.
- RLS is the security boundary, not the API layer. Every table has policies; the only escape hatch is `createAdminClient()` which is used in webhook handlers, cron, and a handful of admin actions.
- Stripe is the source of truth for money. We never touch card data.

---

## 4. Database (current)

Active tables in production:

| Table | Purpose |
|---|---|
| `profiles` | Mirror of `auth.users` with role + display name + phone + `no_show_count` + `deletion_requested_at` |
| `facilities` | The sports venue. Owns slug (branded URL), Stripe Connect account id, geocoded `location`. Status pending/active/suspended |
| `facility_sports` | M:N join — facility ↔ sport |
| `facility_hours` | Open/close times per day-of-week |
| `facility_images` | Storage paths in `facility-images` bucket, ordered |
| `courts` | Individual courts inside a facility, with sport, capacity, price/hour |
| `court_availability` | Bookable slots, with `is_booked` |
| `bookings` | Player reservations, status enum (pending/confirmed/cancelled/completed/no_show), QR token, total price |
| `payments` | Stripe payment intent + checkout session ids, status (pending/succeeded/failed/refunded) |
| `booking_guests` | Stub for future split-pay flow ([SAH-92](https://linear.app/saha-platform/issue/SAH-92)) |
| `events` | Facility events submitted for admin approval |
| `matchmaking_posts` | Community board ([SAH-96](https://linear.app/saha-platform/issue/SAH-96) — kill-or-ship pending) |
| `reviews` | One-per-user-per-facility, INSERT requires a completed booking (RLS) |
| `sports` | Reference table — Padel, Pickleball, Tennis, Squash, Badminton |
| `stripe_events` | Webhook idempotency dedup table |
| `audit_log` | Append-only record of admin + cancellation + system actions |

Dropped (kept around for migration history): `student_discounts`, `legal_documents`, `email_campaigns`.

Geospatial: `facilities.location GEOGRAPHY(POINT, 4326)` with a GIST index. `facilities_within_radius(lat, lng, radius_km, sport_filter)` returns active facilities sorted by distance.

---

## 5. Routes

### Public

- `/` — root redirect to default locale.
- `/[locale]` — home / landing.
- `/[locale]/map` — interactive map.
- `/[locale]/facilities/[id]` — canonical facility detail (UUID).
- `/[locale]/f/[slug]` — branded facility URL — same content, slug-based.
- `/[locale]/community` — matchmaking board.
- `/[locale]/events` — public approved events.
- `/[locale]/booking/[token]` — guest preview by QR token.

### Auth

- `/[locale]/login`, `/register`, `/forgot-password`, `/reset-password`.

### Player

- `/[locale]/account`, `/account/settings`.
- `/[locale]/bookings`, `/bookings/[id]`.

### Owner / business

- `/[locale]/dashboard` — overview.
- `/[locale]/dashboard/onboarding` — 3-step setup.
- `/[locale]/dashboard/facility` — manage facility (incl. branded link card).
- `/[locale]/dashboard/courts`.
- `/[locale]/dashboard/availability`.
- `/[locale]/dashboard/bookings` — bookings + revenue, owner cancel button.
- `/[locale]/dashboard/checkin` — staff/owner QR check-in.
- `/[locale]/dashboard/events`.
- `/[locale]/dashboard/settings`.

### Admin

- `/[locale]/admin` — overview.
- `/[locale]/admin/facilities` + `/[id]` — approval queue.
- `/[locale]/admin/events` + `/[id]`.

### API / cron / webhooks

- `/api/stripe/webhook` — full event coverage (see §6).
- `/api/stripe/connect`, `/disconnect`, `/account-session`.
- `/api/bookings/export` — owner CSV.
- `/api/cron/reminder-emails` — daily 07:00 UTC.
- `/api/cron/mark-no-shows` — daily 23:00 UTC (03:00 GST).

---

## 6. Stripe webhook coverage

| Event | Handled |
|---|---|
| `checkout.session.completed` | mark booking `confirmed`, mark slot booked, mark payment `succeeded`, send WhatsApp + email |
| `checkout.session.expired` | mark booking `cancelled`, release slot |
| `payment_intent.payment_failed` | mark payment `failed`, cancel booking, release slot |
| `charge.refunded` | sync `payments.status='refunded'`, mark booking `cancelled`, audit log |
| `account.updated` | audit log (Connect onboarding completion) |
| `account.application.deauthorized` | clear `facilities.stripe_account_id`, audit log — owner must reconnect |
| `payout.failed` | audit log + console.error |
| `charge.dispute.created` | audit log with linked facility id, ops follow-up |

All webhook events are idempotent via `stripe_events` dedup table.

---

## 7. Security posture (current)

- All tables have RLS. Service-role key only loads inside admin/cron/webhook handlers.
- `handle_new_user` trigger never elevates to admin from user metadata. Admin promotion is SQL-only.
- Reviews require a completed booking before INSERT (RLS).
- `facility-images` bucket INSERT/UPDATE/DELETE scoped to facility owner.
- HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP set in `next.config.ts`.
- `gdpr_delete_expired_accounts()` only deletes users who explicitly requested deletion ≥30 days ago.
- Audit log of every admin and cancellation action.
- Booking creation now reads slot times from the DB — never trusts client-supplied times.
- Stripe Connect requires `charges_enabled && details_submitted` before letting a booking through. No silent fallback to platform.

Open follow-ups (Linear): rate limiting ([SAH-76](https://linear.app/saha-platform/issue/SAH-76)), Sentry ([SAH-75](https://linear.app/saha-platform/issue/SAH-75)), Vercel BotID ([SAH-78](https://linear.app/saha-platform/issue/SAH-78)), admin 2FA ([SAH-80](https://linear.app/saha-platform/issue/SAH-80)), WhatsApp OTP ([SAH-79](https://linear.app/saha-platform/issue/SAH-79)).

---

## 8. Local dev

```
git clone https://github.com/MarawanEldeib/saha-platform.git
cd saha-platform
npm install
cp .env.example .env.local   # fill in Supabase + Stripe + Twilio + Resend + Mapbox keys
npm run dev
```

Required env vars (see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `RESEND_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`

---

## 9. Operations

Runbooks:

- [docs/RUNBOOK_STRIPE.md](docs/RUNBOOK_STRIPE.md) — payouts, refunds, disputes, deauthorization, webhook outage.
- [docs/RUNBOOK_ADMIN.md](docs/RUNBOOK_ADMIN.md) — facility approval, suspension, PII deletion, admin 2FA recovery.
- [docs/SAHA-ARCHITECTURE-REVIEW.md](docs/SAHA-ARCHITECTURE-REVIEW.md) — full senior FS / security review (May 2026).

CI: `.github/workflows/ci.yml` runs lint + typecheck + build on every PR and on master pushes.

Cron: managed via `vercel.json` — reminder-emails (daily 07:00 UTC), mark-no-shows (daily 23:00 UTC).

---

*Last refreshed: 2026-05-09. Update this doc on any change to stack, schema, or routing — staleness has bitten us before.*
