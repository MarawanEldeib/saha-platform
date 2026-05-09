# Saha — Senior Engineering & Security Review

**Reviewer**: Senior Full-Stack Engineer / Security Architect (acting on behalf of Marawan)
**Date**: 2026-05-08
**Scope**: Full codebase audit — Next.js 16 frontend, Supabase backend, Stripe Connect, Twilio, Resend, Vercel infra
**Review type**: Brutally honest. This is a blueprint review, not a hype piece.

---

## 0. Executive Summary (read this first)

Saha is in a far better shape architecturally than 90% of MVPs at this stage — the bones (Next.js App Router, Supabase + RLS, Stripe Connect, next-intl, Twilio, server actions everywhere, no service-role key on client) are right. **But there are 4 production-blocking bugs and ~12 high-severity gaps that will burn money, leak data, or stall growth.**

**The 4 bugs that block public launch** (fix this week, in this order):

1. **Pricing exploit — booking total is computed from client-supplied start/end times.** A user can book a 1-hour slot and pay for 6 minutes. (`src/app/[locale]/dashboard/actions.ts:466`)
2. **Map is broken in production.** Migration `20260507140000_drop_student_discounts.sql` dropped the table but the `facilities_within_radius` function still references it. Every map RPC call now errors. (`src/app/[locale]/map/page.tsx:83`)
3. **Stripe Connect silent fallback.** If owner onboarding is incomplete and the transfer fails, the code silently retries the checkout WITHOUT routing money to the owner — payments land in the platform account with no audit trail, no notification, and the owner thinks they got paid. (`actions.ts:569–576`)
4. **GDPR delete function will wipe the user base.** `gdpr_delete_expired_accounts()` deletes every user whose `updated_at < now() - 30 days`. That's everyone who hasn't logged in for a month. (`001_initial_schema.sql:514`)

**The 4 strategic decisions that determine whether Saha scales**:

1. **Move to Stripe Connect Standard or full Custom**, not Express, for UAE — Express has gaps on KYC handover and dispute flow that will hit you at ~50 facilities.
2. **Add a verified booking → review flow** before public marketing — currently anyone can spam reviews on any facility.
3. **Decide owner-payout cadence and dispute policy NOW** — not in production. Refund logic is partial and customer-friendly only (24h window for player; no equivalent for owner cancellations).
4. **Multi-tenancy (multi-facility per owner) is needed before chains sign up.** Currently a hard blocker for any chain operator (e.g., Just Padel, Padel Pro). The `eq("owner_id").single()` pattern is everywhere — refactoring this later is much harder than fixing it now (~1.5 days work).

**Business reality check**: the product is well-built for one-court mom-and-pop facilities, but the buyer you actually need (Padel chain operators, hotel sports clubs) needs multi-venue, branded booking pages, no-show penalties, recurring bookings, and a finance module. None of that exists. **You are 4–6 weeks away from a chain-ready product.** Plan accordingly — single-facility owners alone will not move the needle in UAE.

The detailed analysis below covers Gap Analysis (§1), Security Review (§2), Feature Assessment (§3), and a phased Action Plan (§4).

---

## 1. Gap Analysis & Unclear Areas

### 1.1 Pricing & money flow — multiple unresolved holes

#### Gap 1.1.a — Server trusts client-supplied times
**File**: `src/app/[locale]/dashboard/actions.ts:466–518`
The action signature is `createBookingAndCheckoutAction(availabilityId, courtId, date, startTime, endTime, numPlayers)`. The server uses `startTime`/`endTime` from the client to compute price (`durationHours = ((eh*60+em) - (sh*60+sm)) / 60`) and writes them to `bookings`. **The server never checks that these match the row in `court_availability` referenced by `availabilityId`.**

**Why it's a problem**: a malicious player intercepts the action call, keeps `availabilityId` for a 1-hour slot but submits `start_time=18:00, end_time=18:06`. They get charged for 6 minutes of court time and the slot is locked — owner loses revenue and the slot.

**Fix (2h work)**:
```ts
const { data: slot } = await supabase
  .from("court_availability")
  .select("id, start_time, end_time, date, court_id, is_booked")
  .eq("id", availabilityId)
  .single();
if (!slot || slot.is_booked) return { error: "Slot unavailable" };
if (slot.court_id !== courtId) return { error: "Invalid request" };
// Use slot.start_time, slot.end_time, slot.date — NOT the client values
```

#### Gap 1.1.b — Stripe Connect silent fallback to platform account
**File**: `actions.ts:569–576`
```ts
try { session = await getStripe().checkout.sessions.create(sessionParams); }
catch {
  delete sessionParams.payment_intent_data;  // strip transfer_data
  session = await getStripe().checkout.sessions.create(sessionParams);
}
```
If the owner's connected account isn't ready (KYC incomplete, deauthorized, restricted), the catch block strips `transfer_data` and creates the session anyway. The player pays — but the funds land in your platform account, not the owner's.

**Why it's a problem**:
1. **Legally exposed**: you're collecting money on behalf of a third party with no contractual right to hold it.
2. **No one knows**: owner sees "confirmed booking" in dashboard, expects money, none arrives. Player gets confirmation. Mismatch only surfaces at month-end.
3. **Reverse manual transfer is a nightmare** — you'd need to find these and `transfers.create()` post-hoc.

**Fix**:
```ts
const account = await getStripe().accounts.retrieve(stripeAccountId);
if (!account.charges_enabled || !account.details_submitted) {
  return { error: "This facility is not yet ready to receive payments. Please try again shortly." };
}
// proceed with transfer_data — no try/catch fallback
```
Block the booking entirely. Notify both player and owner.

#### Gap 1.1.c — Owner cancellation ≠ player refund
**File**: `actions.ts:687` (`cancelBookingAction`) is player-only.
RLS allows facility owners to UPDATE bookings. There is no action that handles "owner cancels a booking" — meaning if an owner sets a booking to cancelled (manually via SQL or future UI), the player's money is not refunded automatically and the slot isn't released.

**Fix**: build `ownerCancelBookingAction(bookingId, reason)` that issues a full refund regardless of the 24h window, releases the slot, sends WhatsApp + email apology, and logs to an `audit_log` table.

#### Gap 1.1.d — No payout dashboard for owners
Owners cannot see: revenue this week/month, fees taken, expected next payout, refund volume, no-show count. This is the #1 thing an owner asks before signing up. Currently they have to log into Stripe to find anything — but Express dashboard is hidden and limited.

**Fix**: build `/dashboard/finance` showing aggregations from `payments` joined to `bookings`. Use the Stripe `account_session` route you already have to embed Stripe-hosted payouts component.

#### Gap 1.1.e — No invoice / VAT-compliant receipt
UAE VAT compliance requires a Tax Invoice with TRN, dated, with line items. Stripe Checkout receipts are not legally sufficient. You will eventually need to either (a) collect each owner's TRN and generate invoices server-side, or (b) make the owner responsible (and document it in T&Cs).

#### Gap 1.1.f — Currency hardcoded to AED
`actions.ts:514`, multiple places. KSA expansion = SAR; Egypt = EGP. Build a `facilities.currency` column now (with default 'AED') so you don't have to backfill later.

#### Gap 1.1.g — Refund window is one-way generous
24h cutoff is player-friendly but creates owner abuse: player books peak-hour Friday slot at 17:00 Thursday, blocking it for 23 hours, then cancels at 17:01 Friday with full refund. Slot is now unbookable. **Add**: cancellation fee for >24h-but-<48h cancellations, OR a small non-refundable booking fee.

---

### 1.2 Booking lifecycle — incomplete state machine

| State | Trigger | Currently handled? |
|---|---|---|
| `pending` | Booking created | ✅ |
| `confirmed` | Stripe webhook `checkout.session.completed` | ✅ |
| `cancelled` | Player cancels OR session expires | ✅ |
| `completed` | Player checked in by owner | ✅ (manual button only) |
| `no_show` | Time passed, no check-in | ❌ **No automation** |

**Why it's a problem**: `no_show` is critical for owner trust (penalty / blacklist). With no nightly job marking `confirmed` bookings whose `date < today` and `status = 'confirmed'` as `no_show`, you cannot enforce no-show penalties or even surface metrics.

**Fix**: cron job `mark-no-shows` runs at 03:00 daily — finds confirmed bookings from yesterday with no check-in, sets status to `no_show`, increments a `profiles.no_show_count` (new column). Three no-shows → temporary ban from booking.

### 1.3 Webhook gaps

`src/app/api/stripe/webhook/route.ts` only handles two events:

| Event | Handled? | Should be |
|---|---|---|
| `checkout.session.completed` | ✅ | ✅ |
| `checkout.session.expired` | ✅ | ✅ |
| `payment_intent.payment_failed` | ❌ | Required — release slot, notify player |
| `charge.refunded` | ❌ | Required — sync `payments.status` if refund issued from Stripe dashboard |
| `account.updated` (Connect) | ❌ | Required — track when owner finishes onboarding (`charges_enabled`) |
| `payout.failed` | ❌ | Required — alert ops |
| `charge.dispute.created` | ❌ | Required — pause facility, notify ops |
| `account.application.deauthorized` | ❌ | Required — when owner disconnects |

**Bigger issue**: webhook is **not idempotent**. Stripe retries on 5xx. If a retry fires after we already updated the booking, we'd send the WhatsApp + email confirmation twice. Need `stripe_events` table with `event.id` PK and INSERT before processing.

### 1.4 Reminder cron is broken

`src/app/api/cron/reminder-emails/route.ts:23` selects:
```ts
profiles(display_name, email:id, phone)
```
This is a PostgREST aliasing bug — `email:id` aliases the `id` column AS `email`. It does not fetch the actual email (which lives in `auth.users`, not `profiles`). The send block at line 42 (`if (profile?.email)`) will then send emails TO a UUID-shaped string. Resend will reject most of these but log noise either way.

Also: `createClient()` is the cookie-bound server client. Cron has no cookies → no user → RLS will hide rows. **The cron has likely never sent a reminder.** Switch to `createAdminClient()` and fetch email via `supabase.auth.admin.getUserById()`.

### 1.5 Sports list mismatch
- DB seed: 5 sports (Padel, Tennis, Squash, Badminton, Pickleball).
- `PROJECT_REPORT.md`: "20 sport categories".
- UAE customer expectation: also Football (5-a-side), Basketball, Cricket nets, Volleyball, Table Tennis.

Decide and fix the docs. If staying narrow (racket sports), **say so as a positioning choice**, don't drift.

### 1.6 Multi-facility per owner is a hard blocker

`eq("owner_id", user.id).single()` appears at 6+ places. A chain owner (e.g., a hotel group with 4 venues) cannot use Saha. This is the buyer who matters in UAE. Refactor to:

- Add `current_facility_id` to a session/cookie or last-used tracking.
- All dashboard pages take `?facility={id}` query param.
- Top-of-dashboard facility switcher.

Estimate: **1.5 days of focused work**, before there's more code depending on the single-facility assumption.

### 1.7 Reviews can be written by anyone authenticated

`reviews_insert_authenticated` policy: `auth.uid() IS NOT NULL AND user_id = auth.uid()`. No requirement that the user has a `completed` booking at this facility. Competitor sabotage / fake-review attacks are trivial.

**Fix**: change RLS:
```sql
CREATE POLICY "reviews_insert_after_booking" ON public.reviews
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM public.bookings b
            JOIN public.courts c ON c.id = b.court_id
            WHERE c.facility_id = facility_id
              AND b.player_id = auth.uid()
              AND b.status = 'completed')
  );
```

### 1.8 Auth & onboarding gaps

- **No 2FA option** — even for admins. Critical when admin role can approve/reject facilities, view PII, and (eventually) refund.
- **Password policy is weak**: only `min(8)`. No complexity check.
- **No email verification gate before booking** — a bad actor can sign up with a typo'd email, book, and the confirmation goes to the typo address.
- **No "resend confirmation email" flow** if Supabase email confirm is enabled.
- **Phone numbers (used for WhatsApp) are not verified.** A user can put `+971501234567` (someone else's number) and that person receives all their booking confirmations and reminders. This is both a privacy leak and a harassment vector.
- **No account deletion UI** for users — only a (broken) GDPR cron.

### 1.9 Storage RLS hole

`facility_images_bucket_insert`:
```sql
CREATE POLICY ... FOR INSERT WITH CHECK (
  bucket_id = 'facility-images' AND auth.uid() IS NOT NULL
);
```
**Any authenticated user can write to any folder in `facility-images`.** Should be:
```sql
WITH CHECK (
  bucket_id = 'facility-images' AND
  auth.uid()::TEXT = (storage.foldername(name))[1]
)
```
The `avatars` bucket already does this correctly — copy the pattern.

Additionally: no MIME or size enforcement at the Supabase Storage layer. Front-end validation is bypassable. A 4 GB file would happily upload. Add a Storage policy for `(metadata->>'size')::int < 5000000`.

### 1.10 Schema/code drift

- `facilities.country` defaults to `'Germany'` (legacy; product is UAE-first).
- `legal_documents` table is gone (migration `20260507130000_drop_legal_documents.sql`) but `PROJECT_REPORT.md` still lists it.
- `email_campaigns` dropped (`20260507120000`) but referenced in docs.
- `student_discounts` dropped — but `facilities_within_radius()` still references it. **Map will throw at runtime** the moment anyone uses the old function.

Run `supabase gen types` again and align docs with reality.

### 1.11 Booking guests & matchmaking are half-built

- `booking_guests` table exists, no flow uses it. The "split cost between players" UI in `BookingShareActions` shares a link but doesn't actually create guests.
- `matchmaking_posts` exists but there's no notification or messaging system — a user posts and waits, with no way to be told someone responded.

Decide: ship the half-feature properly or remove the table to reduce surface area.

### 1.12 Operational gaps

- **No audit log** for admin actions (approve / reject / refund). Compliance and dispute defence needs this.
- **No monitoring / error tracking** (no Sentry, no Datadog, no Vercel Agent integration).
- **No tests** — zero unit, integration, or E2E. Every refactor is a roll of the dice.
- **No staging environment visible** — deploys go straight to prod. Combined with no tests = high risk.
- **No CI checks beyond build** — lint isn't run, no typecheck job.
- **No structured logging**: `console.error` only, no correlation IDs, no per-request trace.
- **`PROJECT_REPORT.md` is wildly out of date** (says German + students; product is UAE Arabic + sports). Replace it.

---

## 2. End-to-End Security Review

### 2.1 Threat model

**Assets**:
- Player PII: email, phone, display name, avatar.
- Booking history (sensitive — reveals frequency, locations).
- Payment data (handled by Stripe; we don't store cards).
- Owner financial data (revenue, payouts).
- Admin role (massive blast radius).

**Adversaries**:
- Drive-by attacker (credential stuffing, scraping).
- Malicious user (price manipulation, fake reviews, account takeover via WhatsApp hijack).
- Malicious owner (review-bombing competitors, fee manipulation).
- Insider (staff with admin role).

### 2.2 Zero-Trust posture: scorecard

| Principle | Status | Notes |
|---|---|---|
| Verify explicitly | 🟡 Partial | All server actions check `auth.getUser()`. RLS adds defence-in-depth. **But**: server actions trust client-supplied `start_time`/`end_time` (Gap 1.1.a). |
| Least privilege | 🟡 Partial | Service-role key only used in `createAdminClient`. **But**: `createAdminClient()` is used in `webhook/route.ts` to bypass RLS — required, but the pattern of "use admin to escape RLS" is sprinkled. |
| Assume breach | 🔴 Fail | No audit log, no anomaly alerting, no rate limit, no WAF, no Vercel BotID, no Stripe Radar tuning. |
| Strong authentication | 🔴 Fail | No 2FA, weak password policy, no device fingerprinting, no anomalous-login detection. |
| Encrypt in transit | 🟢 Pass | TLS by default on Vercel + Supabase. |
| Encrypt at rest | 🟢 Pass | Supabase Postgres + Storage. |
| Network segmentation | 🟡 Partial | Supabase RLS is the segmentation. No private network — everything talks over public TLS. |

**Net**: **C-grade**. Not insecure, but not Zero Trust either. Production-grade for an MVP, brittle for a payment-handling product.

### 2.3 Specific vulnerabilities (sorted by severity)

#### 🔴 CRITICAL

1. **Pricing manipulation** — Gap 1.1.a above. Direct revenue loss.
2. **Storage bucket cross-user write** — Gap 1.9. A user can overwrite another facility's images. Reputational damage, defacement.
3. **GDPR cron destroys data** — Gap 1.10. Fix before scheduling pg_cron.
4. **No Stripe webhook idempotency** — duplicate confirmations possible.
5. **Connect silent fallback collects funds without authorisation** — Gap 1.1.b. Possibly a regulatory issue (PSP rules in UAE).

#### 🟠 HIGH

6. **No rate limiting**. Endpoints particularly exposed:
   - `/login` — credential stuffing.
   - `/forgot-password` — email enumeration / mailbombing.
   - `/api/stripe/connect` POST — Stripe API spam (rate-limited by Stripe but you'll get throttled).
   - Booking creation — slot squatting.
   - Review submission.
   **Fix**: add Upstash rate-limit + Vercel BotID. Sample policy: 5 login attempts / 15 min / IP, 3 password resets / hour / email, 30 bookings / day / user.

7. **Reviews without booking** — Gap 1.7.

8. **Phone number used for WhatsApp without verification** — Gap 1.8. OTP via Twilio Verify before saving phone.

9. **No CSP / security headers**. Add to `next.config.ts`:
   ```ts
   async headers() {
     return [{
       source: "/(.*)",
       headers: [
         { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
         { key: "X-Frame-Options", value: "DENY" },
         { key: "X-Content-Type-Options", value: "nosniff" },
         { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
         { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
         { key: "Content-Security-Policy", value: "..." },  // generate per-route
       ],
     }];
   }
   ```

10. **Mapbox token is `NEXT_PUBLIC_*` and exposed**. Fine, but **lock it to your domain** in Mapbox dashboard ("URL restrictions"). Otherwise stolen-token bills can be 5-figures.

11. **No protection against image content abuse**. Owner uploads explicit/illegal imagery → public bucket → indexable. **Fix**: integrate AWS Rekognition Moderation or Cloudflare Images with content moderation.

#### 🟡 MEDIUM

12. **Information disclosure via geocoding**. Mapbox call from `actions.ts:23` runs server-side — fine — but the formatted query includes user-typed address. Logging that anywhere = PII leak.

13. **No CAPTCHA on registration**. Bots will create accounts. Vercel BotID is one click.

14. **Admin role escalation via raw user metadata**. The `handle_new_user` trigger trusts `raw_user_meta_data->>'role'`. A user could in theory POST to Supabase Auth with `role=admin` in metadata. This is gated by Supabase Auth, but to be safe, force role to `'user'` in the trigger and only allow `'business'` via the registration form (you already enforce this in Zod, but DB should not trust metadata):
    ```sql
    CREATE OR REPLACE FUNCTION public.handle_new_user() ... AS $$
    BEGIN
      INSERT INTO public.profiles (id, role, display_name)
      VALUES (
        NEW.id,
        CASE
          WHEN NEW.raw_user_meta_data->>'role' = 'business' THEN 'business'::public.user_role
          ELSE 'user'::public.user_role
        END,
        ...
      );
    END;
    $$;
    ```
    Admins should only be promoted via admin tooling, never via metadata.

15. **No CSRF tokens on `/api/stripe/connect` POST**. SameSite=Lax cookies + auth checks mostly mitigate, but adding an explicit anti-CSRF check (Next.js `headers()` Origin/Referer comparison) hardens this.

16. **Twilio + Resend secrets on every fluid-compute instance** — fine for now, but rotate keys regularly and consider Vercel's encrypted env scoping.

17. **No PII redaction in logs**. `console.log(profile.phone)` would emit a phone number to Vercel logs. Add a redactor or use Pino with redaction config.

18. **`auth.admin.getUserById` in webhook returns full user object**. Fine in admin context, but minimise — only fetch what you need.

#### 🟢 LOW (still fix)

19. **`gen_random_uuid()` for `qr_code_token`** — predictable enough that a determined attacker could enumerate tokens for revenue scraping. Use a 256-bit random opaque token instead, or sign it.

20. **Discounts / events page caches publicly** — could leak draft data if RLS slips. Tag pages with `revalidate = 0` for sensitive ones.

21. **No content moderation on text fields** (matchmaking message, review comment, event description, facility description). Add a basic profanity filter (bad-words npm) and a manual flag/report mechanism.

22. **Supabase keys are sometimes prefixed `NEXT_PUBLIC_` correctly** — anon key is intentionally public, that's fine. But document this clearly so nobody adds the service-role key with the public prefix by mistake.

### 2.4 Compliance posture

- **UAE PDPL (Personal Data Protection Law, Federal Decree-Law No. 45 of 2021)** — applies to your processing of UAE residents' data. Required: purpose limitation, opt-in consent, breach notification within 72h, DSR (delete/access). You have neither a privacy policy that names PDPL nor a tested DSR process.
- **PCI DSS scope** — Stripe Checkout keeps you in **SAQ-A**. Don't break that by ever touching card data on your side. You currently don't — keep it that way.
- **GDPR** — only relevant if you market to EU residents. Currently the cookie banner suggests you do — but the product is UAE. Strip GDPR theatre or do it properly.

---

## 3. Feature Assessment

### 3.1 Add (in order of ROI)

| # | Feature | Why | Effort |
|---|---|---|---|
| 1 | **Multi-facility per owner** | Required to onboard chains (the buyers who matter). | 1.5 days |
| 2 | **Owner finance dashboard** (revenue, fees, payouts, refunds) | #1 question every owner asks before signing up. | 2 days |
| 3 | **No-show penalty system + reliability score** | Owners' biggest pain point. Cron + 1 column + 1 UI. | 2 days |
| 4 | **Verified booking → review pipeline** | Kills fake-review risk; differentiates from Google Maps reviews. | 4 hours |
| 5 | **Recurring bookings ("every Tuesday 8pm for 4 weeks")** | The #1 booking-tool feature for league players. Doubles bookings/user. | 3 days |
| 6 | **Booking modifications** (player can move slot if both old + new are free, owner-allowed) | Reduces refunds + saves slot revenue. | 2 days |
| 7 | **Branded booking pages per facility** (`/saha.ae/just-padel-jbr` style direct links) | Owners share to their Instagram → free user acquisition. | 1 day |
| 8 | **WhatsApp OTP for phone verification (Twilio Verify)** | Closes the WhatsApp-hijack hole. | 0.5 day |
| 9 | **Group booking + cost-split via Stripe Payment Links per guest** | Real implementation of the half-built `booking_guests`. | 3 days |
| 10 | **Loyalty / wallet credit** (10 bookings → 1 free hour) | Retention. Builds owner stickiness. | 2 days |
| 11 | **In-app messaging for matchmaking** | The board is dead without it. | 4 days (or use Stream Chat). |
| 12 | **Push notifications via web push + WhatsApp template messages** | Reminder + post-game review prompt. | 2 days |
| 13 | **Sentry + Vercel Agent + structured logging** | Observability is non-negotiable for a payment product. | 1 day |
| 14 | **Audit log table + admin action UI** | Compliance + ops debugging. | 1 day |
| 15 | **Tests** — at minimum: a Vitest unit suite for `actions.ts` and a Playwright E2E for "book → pay → cancel → refund". | The booking flow is too important to ship untested. | 3 days |

### 3.2 Remove or simplify

| # | What | Why |
|---|---|---|
| 1 | **`matchmaking_posts` table or its UI** | It's half-built and currently does nothing useful. Either ship messaging properly (Add #11) or remove the table. |
| 2 | **`booking_guests` table** | Same — implement properly or remove. |
| 3 | **GDPR theatre + cookie banner** | If you're not actually marketing to EU residents, this banner just confuses UAE users and adds friction. Replace with PDPL-correct banner. |
| 4 | **`student_discounts` references in docs / function** | Already dropped from DB; clean up code + function. |
| 5 | **Locale auto-detection complexity** if it isn't yet stable | Just default to Arabic for `.ae` traffic and English elsewhere; let users toggle. Don't over-engineer. |
| 6 | **Recharts dependency** if analytics page isn't shipping value | 200KB bundle hit. Replace with simple `<svg>` sparklines until you actually have enough data to chart. |
| 7 | **`facilities.country` column** | Until you expand to KSA/Egypt, just hard-code "AE" everywhere. Re-add when you actually need it. |
| 8 | **Public events page** | Until you have ≥5 active facilities posting events, it shows empty state and looks dead. Hide from nav until populated. |
| 9 | **Imprint page** (`/imprint`) | German/EU concept (Impressum). Doesn't apply in UAE; might confuse locals. Remove or replace with "Contact". |

### 3.3 Strategic / business assessment

#### What's the actual product?
You have **three half-products in one repo**:

1. **Court booking SaaS for owners** (Stripe Connect, courts, availability, hours, finance) — the paid product.
2. **Facility directory for players** (map, reviews, search) — a marketing layer.
3. **Community matchmaking + events** — engagement/retention layer.

This is fine — but **(1) is what monetises**. (2) and (3) only matter if they drive bookings to (1). Right now (3) doesn't drive anything because matchmaking has no messaging. Decide: are (2) and (3) supporting flywheels or distractions for the next 8 weeks?

**Recommendation**: until you have **30 active facilities and 2k MAU players**, kill matchmaking, double down on (1) + (2). After that, revisit (3) with a real social design.

#### Pricing & unit economics
You take 10% as platform fee. UAE court bookings average AED 80–200/hr. So per booking, you net AED 8–20. **You need ~50 bookings/day across the platform to clear AED 25k/month gross.** That requires ~30 active facilities @ 1.5 bookings/day. That's a 6–9 month grind. Plan runway accordingly.

A 10% fee is **on the high end** for booking platforms (Padel Connect / Playtomic charge 4–7% in many markets). You can defend it with WhatsApp confirmations + reminders + finance dashboard, but expect price pushback from chain owners. Have a **tiered fee** ready: 10% for solo facilities, 6% for chains with >3 venues paying a monthly platform fee.

#### Go-to-market reality
- **Cold-email / cold-call facility owners** is the only thing that works for sub-50 customers. WhatsApp + in-person visits to the top 30 padel/tennis venues in Dubai/AD will convert better than any digital ad.
- **Player-side acquisition is virally tied to owner side** — players come because their court is on Saha. Don't spend on player ads until you have ≥10 quality venues live.
- **Defensibility** is weak: anyone with 4 weeks and a Supabase account can clone this. Your moat will be (a) **WhatsApp-first UX**, (b) **chain-tier features** (multi-venue, recurring, league management), (c) **owner relationship + finance trust**. Build for (b) and (c).

#### Risks
- **Competitor risk**: Playtomic just entered MENA (active in KSA, expanding to UAE). They have a 10× larger product. Your only real angle is **localisation and UAE-first ops**. Lean into that — Arabic, AED, WhatsApp, Eid/Ramadan-aware scheduling, prayer-time-aware slot generation.
- **Owner churn**: if a facility has even one bad payout dispute, they leave and tell five other owners. Finance trust is existential.
- **Regulatory**: Stripe Connect Express is fine for UAE, but if you scale, you may need to register as a payment facilitator yourself. Get a UAE fintech lawyer on retainer at AED 50k+ MRR.

---

## 4. Phased Action Plan

### Phase 0 — Hotfix (this week, before any marketing)

**Goal**: stop the bleeding. Nothing else.

| # | Task | File(s) | Owner | Time |
|---|---|---|---|---|
| 0.1 | Fix pricing exploit — server reads slot, ignores client times | `actions.ts:466` | Marawan | 2h |
| 0.2 | Fix Stripe Connect fallback — block booking if `charges_enabled=false` | `actions.ts:569` | Marawan | 2h |
| 0.3 | Fix `facilities_within_radius` — drop `discount_only` param + `student_discounts` join | new migration + `map/page.tsx` | Marawan | 1h |
| 0.4 | Fix `gdpr_delete_expired_accounts` — gate on `deletion_requested_at` column | migration | Marawan | 1h |
| 0.5 | Fix storage `facility_images_bucket_insert` — scope to user folder | migration | Marawan | 0.5h |
| 0.6 | Make webhook idempotent — `stripe_events` table | new migration + `webhook/route.ts` | Marawan | 2h |
| 0.7 | Fix reminder cron — use admin client, fetch real email | `cron/reminder-emails/route.ts` | Marawan | 2h |
| 0.8 | Lock Mapbox token to domain | Mapbox dashboard | Marawan | 15min |

**Total: ~1.5 days.**

### Phase 1 — Foundations (week 2–3)

**Goal**: production-grade observability, auth hardening, multi-facility.

| # | Task | Time |
|---|---|---|
| 1.1 | Add Sentry + Vercel Agent + structured logging | 1 day |
| 1.2 | Add Upstash rate-limiting on auth + booking + review endpoints | 1 day |
| 1.3 | Add security headers + CSP via `next.config.ts` | 0.5 day |
| 1.4 | Add Vercel BotID on register/login/forgot | 0.5 day |
| 1.5 | Add WhatsApp OTP (Twilio Verify) for phone | 0.5 day |
| 1.6 | Add 2FA (TOTP) for admin role | 1 day |
| 1.7 | **Multi-facility per owner refactor** | 1.5 days |
| 1.8 | Add `audit_log` table and admin action logging | 1 day |
| 1.9 | Add complete Stripe webhook handlers (`account.updated`, `dispute.created`, `payment_intent.payment_failed`, `charge.refunded`) | 1 day |
| 1.10 | Tighten review-insert RLS to require completed booking | 1h |
| 1.11 | Replace `country` default; clean up legacy schema/code (`student_discounts`, `legal_documents`, `email_campaigns`) | 0.5 day |

**Total: ~9 days.**

### Phase 2 — Owner-essential features (week 4–5)

**Goal**: features that make a facility owner stay.

| # | Task | Time |
|---|---|---|
| 2.1 | Owner finance dashboard (revenue, fees, payouts, refunds) | 2 days |
| 2.2 | No-show automation + cron + reliability score | 2 days |
| 2.3 | Owner-initiated cancellation with auto-refund | 1 day |
| 2.4 | Booking modifications (player moves slot) | 2 days |
| 2.5 | Branded booking pages (slug per facility) | 1 day |
| 2.6 | VAT-compliant invoice generation (TRN + PDF) | 2 days |

**Total: ~10 days.**

### Phase 3 — Player retention (week 6–8)

**Goal**: features that increase bookings/user.

| # | Task | Time |
|---|---|---|
| 3.1 | Recurring bookings | 3 days |
| 3.2 | Group booking + Stripe Payment Links per guest | 3 days |
| 3.3 | Wallet credit / loyalty | 2 days |
| 3.4 | Verified-booking review flow + post-game review prompt | 1 day |
| 3.5 | Web push + WhatsApp templated reminders | 2 days |
| 3.6 | Decide: ship matchmaking properly OR remove tables | 4 days OR 1h |

**Total: ~11–14 days.**

### Phase 4 — Scale & test (week 9–10)

| # | Task | Time |
|---|---|---|
| 4.1 | Vitest unit suite for `actions.ts` (target: cover pricing + cancellation + Stripe paths) | 2 days |
| 4.2 | Playwright E2E: book → pay (Stripe test mode) → cancel → refund | 1.5 days |
| 4.3 | CI: lint + typecheck + test job on every PR via GitHub Actions | 0.5 day |
| 4.4 | Staging environment on Vercel preview + separate Supabase project | 1 day |
| 4.5 | Replace `PROJECT_REPORT.md` with current architecture; document Stripe ops runbook + admin runbook | 1 day |
| 4.6 | Load test booking flow (k6 or Artillery) — target: 50 concurrent bookings without race | 1 day |

**Total: ~7 days.**

### Phase 5 — Geographic / chain expansion (week 11+)

| # | Task |
|---|---|
| 5.1 | Multi-currency (AED, SAR, EGP, OMR) — `facilities.currency` column |
| 5.2 | Per-region Stripe Connect accounts (UAE/SA/EG have different KYC) |
| 5.3 | League / tournament management |
| 5.4 | Facility-staff sub-accounts (front-desk role) |
| 5.5 | Public API for chain owners' existing tools |

### Sequencing logic
- Phase 0 must finish before any new marketing or onboarding.
- Phase 1 blocks Phase 2 (need observability before shipping fast).
- Phase 1.7 (multi-facility) blocks Phase 2.1 (finance is per-facility).
- Phase 4 should run **in parallel** with Phase 2 + 3 — don't leave it to the end.

### Key milestones / checkpoints
- **End of week 1**: Phase 0 done. Safe to onboard real owners.
- **End of week 3**: 5 paying facilities live, observability green.
- **End of week 5**: Owner finance dashboard live → first chain owner conversation.
- **End of week 8**: First chain operator (3+ venues) signed.
- **End of week 10**: 30 facilities, full test coverage on payment paths, Sentry < 0.1% error rate.

### Dependencies & blockers
- Stripe webhook secret must be in Vercel env (`STRIPE_WEBHOOK_SECRET`) — currently flagged as pending in your memory file.
- Twilio WhatsApp business approval (sandbox → production) — submit application now, takes 2–4 weeks.
- Supabase pg_cron for the no-show cron — verify enabled.
- Decide on monitoring stack (Sentry vs Vercel-native) before Phase 1.

---

## 5. Closing notes (brutally honest)

**What's good**: the architecture is right. Server actions everywhere, RLS for defence-in-depth, no service-role on client, Stripe Connect with `transfer_data`, Twilio for WhatsApp, Resend for email. You skipped the trap of using SaaS-on-rails (Bubble / Glide) and you skipped the trap of inventing your own auth. You're in the top quartile of MVPs at this stage.

**What's not**: you have 4 production-blocking bugs and have not yet built any of the chain-tier features that determine whether the product makes money. You're optimising for shipping features when you should be optimising for **payment correctness, observability, and chain readiness**.

**The one thing I'd do tomorrow**: spend the day on Phase 0 hotfixes. Don't ship a single new feature until those are merged. The pricing exploit and Connect fallback are not theoretical — they will be discovered. The cost of fixing them now (4 hours combined) is 100× lower than the cost of a finance reconciliation incident.

**The thing nobody is asking but matters most**: **Who owns ops?** Right now Marawan is engineer, ops, and finance. The first refund dispute that lands at 11pm on a Friday will be a problem. Decide who's on call, who handles owner finance disputes, who answers WhatsApp customer support — write it down, share it with the team. This is more important than another feature.

Good luck. The product is closer than the bug list makes it look.

— Senior FS / Sec Architect review, on behalf of Marawan
