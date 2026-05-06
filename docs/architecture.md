# Architecture

## Overview

Saha is a Next.js App Router application. All data fetching happens in React Server Components. Mutations go through Next.js Server Actions. The browser never receives raw Supabase credentials.

```text
Browser
  └── Next.js (Vercel)
        ├── React Server Components  ← data fetching
        ├── Server Actions           ← mutations (forms, approvals)
        └── Route Handlers           ← webhooks (Stripe), API endpoints
              └── Supabase (PostgreSQL + PostGIS + Auth + Storage)
                    └── Resend (transactional email)
```

## Key Patterns

### Supabase Client Factories

Three clients, each used in a specific context:

| File | Used in | Notes |
| --- | --- | --- |
| `src/lib/supabase/server.ts` | Server Components, Server Actions | Uses cookies for session |
| `src/lib/supabase/client.ts` | Client Components only | Browser session |
| `src/lib/supabase/admin.ts` | Server Actions that need elevated access | Uses service role key — never expose to client |

### Server Actions

All mutations are in `actions.ts` files co-located with their route. They return `{ success: true }` or `{ error: string }`. Never throw — errors bubble up as return values.

### i18n

All routes are prefixed with `[locale]` (e.g. `/en/map`). `next-intl` handles routing via `src/i18n/routing.ts`. Translation strings live in `messages/en.json`. German is disabled for now — the `de.json` file exists but locale is not registered.

### Auth Protection

`src/middleware.ts` handles both i18n routing and auth guards. `/dashboard/*` and `/admin/*` redirect to `/en/login` if no session exists.

### Database Types

`src/types/database.ts` is manually maintained — not auto-generated. When you add a migration, update this file too.

## Future Architecture Considerations

- **Expo mobile app** — planned post-Phase 1. Will share TypeScript types and Supabase client from a monorepo structure (`/apps/web`, `/apps/mobile`, `/packages/shared`).
- **Infrastructure migration** — post-MVP, evaluate Cloudflare Pages + Workers + Neon for better UAE latency. Tracked in SAH-49.
