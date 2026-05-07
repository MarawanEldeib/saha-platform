# Database Schema

Supabase PostgreSQL with PostGIS. All tables have Row Level Security (RLS) enabled.

## Core Tables

| Table | Description |
| --- | --- |
| `profiles` | One row per user. Extends `auth.users`. Stores `role`, `display_name`, `avatar_url`. Created automatically via PostgreSQL trigger on sign-up. |
| `sports` | Reference table of racket sports: Padel, Tennis, Squash, Badminton, Pickleball. |
| `facilities` | Facility listings. Name, address, city, PostGIS geography point, approval status. |
| `facility_sports` | Many-to-many join: facilities ↔ sports. |
| `facility_hours` | Operating hours per day of week (0=Mon, 6=Sun). Has `open_time`, `close_time`, `is_closed`. |
| `facility_images` | Ordered gallery images. URLs pointing to Supabase Storage `facility-images` bucket. |
| `reviews` | User reviews (1–5 stars + comment). UNIQUE constraint on `(facility_id, user_id)`. |
| `events` | Facility events requiring admin approval before going public. |
| `matchmaking_posts` | Community board — players looking for training partners. |

## Booking System Tables (pending — SAH-12)

These need to be created via migration:

| Table | Description |
| --- | --- |
| `courts` | Individual courts within a facility (name, sport, capacity, price_per_hour). |
| `court_availability` | Slots set by facility owner (date, start_time, end_time, is_booked). |
| `bookings` | Player reservations. Has `qr_code_token` (UUID) for check-in. |
| `payments` | Stripe payment records linked to bookings. |

## Tables to Remove (cleanup — SAH-6, SAH-7, SAH-9)

| Table | Reason |
| --- | --- |
| `student_discounts` | Platform is no longer student-focused |
| `legal_documents` | Feature was never completed |

## Enums

| Enum | Values |
| --- | --- |
| `user_role` | `user`, `business`, `admin` |
| `facility_status` | `pending`, `active`, `suspended` |
| `event_status` | `pending`, `approved`, `rejected` |
| `skill_level` | `beginner`, `intermediate`, `advanced` |

## Geospatial

The `facilities` table has a `GEOGRAPHY(POINT, 4326)` column with a GIST spatial index. A custom function `facilities_within_radius(lat, lng, radius_km, sport_filter)` powers map search.

## Security Functions

Two `SECURITY DEFINER` functions for safe RLS role checks:

- `public.is_admin()` — returns boolean
- `public.get_user_role()` — returns the caller's role string

## Migrations

Located in `supabase/migrations/`. Run in order. When adding a migration, also update `src/types/database.ts`.
