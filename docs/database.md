# Database Schema

Supabase PostgreSQL with PostGIS. All tables have Row Level Security (RLS) enabled. The full source of truth is the `supabase/migrations/` folder — read them in order. This file is a quick reference.

## Identity & profiles

| Table | Description |
| --- | --- |
| `profiles` | One row per user. Extends `auth.users`. Auto-created via trigger on sign-up. Holds `role`, `display_name`, `avatar_url`, `phone`, `phone_verified`, `phone_verification_sid`, `no_show_count`. |

## Facility data

| Table | Description |
| --- | --- |
| `sports` | Reference table: Padel, Tennis, Squash, Badminton, Pickleball. |
| `facilities` | Listings. Holds `name`, `address`, `city`, `country`, PostGIS `location` point, `slug` (auto-generated), `currency`, `stripe_account_id`, `stripe_charges_enabled`, `status`. |
| `facility_sports` | Many-to-many join: facilities ↔ sports. |
| `facility_hours` | Operating hours per `day_of_week` (0=Mon, 6=Sun). |
| `facility_images` | Ordered gallery (`storage_path` in the `facility-images` Supabase bucket). |

## Booking system (SAH-12, shipped)

| Table | Description |
| --- | --- |
| `courts` | Individual courts within a facility (`name`, `sport_id`, `capacity`, `price_per_hour`, `is_active`). |
| `court_availability` | Time slots opened by owners (`date`, `start_time`, `end_time`, `is_booked`). The booking flow uses a conditional update on `is_booked` to prevent double-booking. |
| `bookings` | Player reservations. Columns of note: `qr_code_token`, `status` (pending/confirmed/cancelled/completed/no_show), `currency`, `total_price`, `num_players`, `move_count` (SAH-88), `recurring_group_id` (SAH-91), `reminder_sent_at`, `review_prompt_sent_at`. |
| `payments` | Stripe payment records linked to bookings (`stripe_payment_intent_id`, `stripe_checkout_session_id`, `amount`, `currency`, `status`). |
| `booking_guests` | Per-guest split-pay rows for SAH-92. Holds `share_amount`, `currency`, `payment_status`, `stripe_payment_link_id`, `stripe_payment_link_url`, `paid_at`. |

## Reviews & events

| Table | Description |
| --- | --- |
| `reviews` | 1–5 stars + comment. UNIQUE `(facility_id, user_id)`. RLS enforces "must have a completed booking". |
| `events` | Facility events that need admin approval before going public. |

## Loyalty wallet (SAH-93)

| Table | Description |
| --- | --- |
| `wallet_balances` | One row per user, `credit_aed` running total. |
| `wallet_transactions` | Append-only ledger (`booking_id`, signed `amount`, `kind` — earned/spent/refund). |

## Compliance & ops

| Table | Description |
| --- | --- |
| `audit_log` | Append-only record of admin/cancel/refund/no-show transitions with `actor_id`, `actor_role`, `action`, `target_type`, `target_id`, `metadata`, `ip`, `user_agent`. Admin-readable only. |
| `stripe_events` | Webhook idempotency. PK is the Stripe event id; second delivery is a no-op. |
| `vat_invoices` | UAE VAT-compliant tax invoices generated per booking (SAH-90). |

## Removed (cleanup migrations, May 2026)

| Table | Reason |
| --- | --- |
| `student_discounts` | Platform pivoted away from student-focused positioning (`20260507140000_drop_student_discounts.sql`). |
| `email_campaigns` | Outreach feature deprecated (`20260507120000_drop_email_campaigns.sql`). |
| `legal_documents` | Documentation flow simplified (`20260507130000_drop_legal_documents.sql`). |

`matchmaking_posts` is still in the schema but pending a kill-or-ship decision in [SAH-96](https://linear.app/saha-platform/issue/SAH-96).

## Enums

| Enum | Values |
| --- | --- |
| `user_role` | `user`, `business`, `admin` |
| `facility_status` | `pending`, `active`, `suspended` |
| `event_status` | `pending`, `approved`, `rejected` |
| `booking_status` | `pending`, `confirmed`, `cancelled`, `completed`, `no_show` |
| `payment_status` | `pending`, `succeeded`, `failed`, `refunded` |
| `skill_level` | `beginner`, `intermediate`, `advanced` (used by `matchmaking_posts`) |

## Geospatial

`facilities.location` is `GEOGRAPHY(POINT, 4326)` (WGS84) with a GIST index. The RPC `facilities_within_radius(lat, lng, radius_km, sport_filter, discount_only)` powers the map page and the public API's geo-search path.

## Security helpers

`SECURITY DEFINER` functions used inside RLS policies:

- `public.is_admin()` — boolean
- `public.get_user_role()` — string

## Storage buckets

| Bucket | Public? | Used for |
| --- | --- | --- |
| `facility-images` | Yes | Facility gallery photos |
| `avatars` | Yes | Player avatars |

## Migrations

Located in `supabase/migrations/`. Apply in order:

```bash
supabase db push
```

When you add a migration that changes a public table, regenerate types:

```bash
supabase gen types typescript --linked > src/types/database.ts
```
