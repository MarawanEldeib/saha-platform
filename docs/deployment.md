# Deployment Guide

## Production Stack

| Service | Purpose |
| --- | --- |
| Vercel | Hosting (Next.js) |
| Supabase | Database, Auth, Storage |
| Resend | Transactional email |
| Stripe | Payments (pending — SAH-16) |
| Twilio | WhatsApp notifications (pending — SAH-27) |
| Doppler | Secrets management (pending — SAH-53) |

## First Deploy to Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Link the project

```bash
vercel
```

Follow the prompts to link to your Vercel account and create a new project.

### 3. Add environment variables

In the Vercel dashboard → Project → Settings → Environment Variables, add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (set to your production domain)
- `RESEND_API_KEY`

### 4. Deploy

```bash
vercel --prod
```

### 5. Add team member

In Vercel dashboard → Project → Settings → Members, invite Abu Zar (abazeradamwork@gmail.com).

## Preview Deployments

Every push to any branch automatically creates a preview deployment. The preview URL is posted in GitHub PRs.

## Environment Tiers

| Tier | Branch | URL |
| --- | --- | --- |
| Local | any | http://localhost:3000 |
| Preview | any non-main | `*.vercel.app` auto URL |
| Production | main | your custom domain |

## Doppler (planned)

Once Doppler is set up (SAH-53), env vars will be managed centrally:

```bash
# Local development
doppler run -- npm run dev

# Both developers pull the same vars automatically
doppler setup
```

Doppler also syncs directly with Vercel so production secrets stay in one place.

## Database Migrations

Migrations are not automatically applied on deploy. Run them manually in the Supabase SQL Editor or via the Supabase CLI:

```bash
supabase db push
```

## Vercel Cron Jobs

Booking reminders (SAH-26) will use Vercel Cron. Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "0 * * * *" }
  ]
}
```
