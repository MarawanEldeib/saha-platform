# Saha Platform

Saha is a racket sports facility discovery and booking platform built for the UAE market. Players find and book Padel, Tennis, Squash, and Badminton courts. Facility owners list and manage their venues.

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js (App Router, React 19, TypeScript 5 strict) |
| Database | Supabase (PostgreSQL + PostGIS + Auth) |
| Styling | Tailwind CSS v4 |
| Forms | React Hook Form + Zod |
| Maps | Leaflet + React Leaflet |
| Email | Resend |
| i18n | next-intl (English — Arabic coming in Phase 3) |
| Hosting | Vercel |

## Local Development

### Prerequisites

- Node.js 20+
- A Supabase project

### Setup

```bash
git clone https://github.com/MarawanEldeib/saha-platform.git
cd saha-platform
npm install
cp .env.example .env.local
# Fill in .env.local with your Supabase and Resend credentials
npm run dev
```

Open [http://localhost:3000/en](http://localhost:3000/en).

### Environment Variables

See [.env.example](.env.example) for the full list. Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `RESEND_API_KEY`

### Database

Run migrations in order from `supabase/migrations/`. Enable PostGIS and pg_trgm extensions in your Supabase project (Settings → Extensions).

To make yourself an admin:

```sql
UPDATE public.profiles SET role = 'admin' WHERE id = '<your-user-uuid>';
```

## Project Structure

```text
src/
├── app/[locale]/           # All routes (i18n prefix)
│   ├── (auth)/             # Login, register, forgot/reset password
│   ├── map/                # Court discovery map
│   ├── facilities/[id]/    # Facility detail pages
│   ├── community/          # Player matchmaking board
│   ├── events/             # Public events listing
│   ├── dashboard/          # Facility owner portal
│   └── admin/              # Admin panel
├── components/             # Shared UI components
├── lib/supabase/           # Supabase client factories (server/client/admin)
└── types/database.ts       # TypeScript types for all DB tables
```

## User Roles

| Role | Access |
| --- | --- |
| `user` | Browse facilities, book courts, matchmaking board |
| `business` | Everything + facility management dashboard |
| `admin` | Everything + approval queues, platform admin |

## Docs

- [Architecture](docs/architecture.md)
- [Database Schema](docs/database.md)
- [Deployment Guide](docs/deployment.md)

## Task Tracking

All tasks are tracked in [Linear](https://linear.app/saha-platform).
