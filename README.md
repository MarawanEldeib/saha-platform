# Saha Platform

Saha is a multilingual racquet-sports facility platform for players and facility operators in Egypt, Malaysia, Qatar, and the United Arab Emirates.

## Product scope

1. **Players** discover facilities and compare available offers.
2. **Business users** onboard a facility and manage listing details.
3. **Admins** review facility submissions and send outreach campaigns.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Supabase (PostgreSQL, Auth, Storage, RLS)
- next-intl (English/German)
- Tailwind CSS + Radix UI

## Restore locally

1. Install Node.js 20+.
2. Install dependencies:

```bash
npm ci
```

3. Create a local env file from the template:

```bash
cp .env.example .env.local
```

4. Fill environment variables in `.env.local`.
5. Start development server:

```bash
npm run dev
```

App runs at `http://localhost:3000` and redirects to locale routes (`/en`, `/de`).

## Environment variables

See `.env.example` for required keys.

## Scripts

- `npm run dev` — start dev server
- `npm run lint` — run ESLint
- `npm run build` — production build
- `npm run start` — run production server

## Database

SQL migrations are under `supabase/migrations/`.

- `001_initial_schema.sql` — full schema + RLS policies + helper functions
- `003_add_rejection_reason.sql` — facility review metadata
- `20260222_sport_suggestions.sql` — onboarding sport suggestions
- `20260506_launch_scope.sql` — launch-country and focused-sports restrictions

## Key app structure

- `src/app/[locale]/` — locale-prefixed routes
- `src/app/[locale]/(auth)/` — login/register/reset/2FA
- `src/app/[locale]/dashboard/` — business dashboard
- `src/app/[locale]/admin/` — admin panel
- `src/lib/supabase/` — typed Supabase clients
- `src/lib/validations.ts` — shared Zod schemas
- `messages/` — i18n dictionaries
