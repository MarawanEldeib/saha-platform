# Saha — Future infrastructure migration plan

> **Status:** post-MVP planning artifact (SAH-49). Saha runs on Vercel + Supabase today and will stay there until UAE user validation. This document captures the candidate destinations and the trade-offs so we can make a data-driven move when it's time, not a panic move.

## Triggers — when do we revisit this?

We migrate **only** when at least one of these is true:

- **Cost** — Vercel or Supabase bill crosses ~$300/mo with no clear path to flatten
- **Latency** — UAE p95 page loads stay above 1.5s after we've optimized everything in-app (caching, ISR, image sizes)
- **Throughput** — Supabase connection limits or function execution caps actually bite (sustained 429s, timeouts)
- **Compliance** — UAE PDPL or a customer mandates data residency in-region (Vercel/Supabase regions don't include AE today; closest are Frankfurt + Mumbai)

If none of those are firing: **do not migrate.** Vercel + Supabase is a productive, well-supported stack. Migration is multi-month engineering risk.

## Candidate stacks

### Option A — Cloudflare Pages + Workers + Neon + R2 + Auth.js

**The original plan from when SAH-49 was filed.** Cheapest at scale, edge-native, but biggest engineering lift.

| Component | Today | Migrate to | Why |
|-----------|-------|------------|-----|
| Hosting + edge | Vercel | Cloudflare Pages + Workers | Cloudflare has a Dubai PoP — UAE traffic stays in-region. Workers cheaper than Vercel Functions at scale. |
| Postgres | Supabase | Neon | Serverless Postgres, scale-to-zero. ~⅓ the cost of Supabase at our projected size. Branching for preview DBs is a real productivity win. |
| Object storage | Supabase Storage | Cloudflare R2 | Zero egress fees (huge win for image-heavy facility pages). S3-compatible API. |
| Auth | Supabase Auth | Auth.js (NextAuth) | Decoupled from the DB so we can keep Auth wherever Cloudflare-friendly. |
| Realtime / RLS | Supabase | Manual / Hasura / PostgREST | Big loss — RLS is doing real work today (see `feedback_linear_ticket_status.md` for examples). Replacement requires application-layer authz. |

**Cost estimate at 100k MAU:** ~$80-120/mo Cloudflare + ~$40 Neon + ~$10 R2 + Auth.js free = **~$150/mo**. Vercel + Supabase at the same scale is **~$400-500/mo**.

**Engineering cost:** ~6-8 weeks. RLS rewrite is the biggest item — every policy needs an application-layer equivalent + thorough testing.

### Option B — AWS (bzo's suggestion)

**The "production-grade" alternative.** Enterprise-friendly, region-rich (UAE Central in Dubai is GA), but heaviest ops burden.

| Component | Today | Migrate to | Why |
|-----------|-------|------------|-----|
| Hosting + edge | Vercel | CloudFront + S3 (static) + ECS Fargate or Lambda (server) | UAE region (`me-central-1`) means in-region everything. CloudFront has Dubai edge. |
| Postgres | Supabase | RDS Postgres (Multi-AZ) | Battle-tested. Backup / restore tooling far ahead of Neon. ~$50-150/mo for a small instance. |
| Object storage | Supabase Storage | S3 | Egress costs apply (worse than R2) but operational maturity is unmatched. |
| Auth | Supabase Auth | Cognito **or** Auth.js | Cognito is full-featured but has a steep config curve. Auth.js + RDS is simpler. |
| Realtime / RLS | Supabase | Postgres RLS via RDS + custom WS server | RLS works on RDS — same policies port directly. Realtime needs a self-hosted layer (not trivial). |

**Cost estimate at 100k MAU:** ~$200-400/mo depending on Lambda vs Fargate, instance size, NAT egress. Generally **2-3× Cloudflare** but with better data residency and enterprise procurement story.

**Engineering cost:** ~8-12 weeks. AWS ops overhead is real — Terraform, IAM, VPC design, monitoring setup. Not appropriate unless the team has AWS experience or hires for it.

### Option C — Hybrid: Cloudflare front + AWS RDS back

**Pragmatic middle ground.** Keep RLS by keeping Postgres, get edge benefits from Cloudflare.

- Cloudflare Pages + Workers for hosting + edge
- AWS RDS (Multi-AZ, `me-central-1`) for Postgres — RLS works, policies port directly
- Cloudflare R2 for object storage
- Auth.js wired to RDS

**Cost:** ~$180-250/mo at 100k MAU. **Engineering cost:** ~4-6 weeks. Lowest-risk path because the DB layer (which is doing the heavy lifting today via RLS) doesn't get rewritten.

## Recommendation

**Stay on Vercel + Supabase until a trigger fires.** When one does:

1. If **cost** is the trigger → start with **Option C** (Cloudflare + RDS). Smallest blast radius, RLS preserved, Postgres is the proven layer.
2. If **latency** is the trigger → also Option C, but add a Mumbai or Dubai read replica to RDS first. Migrate hosting to Cloudflare to get the Dubai edge PoP.
3. If **compliance** is the trigger → **Option B** (full AWS in `me-central-1`). Data residency requires both compute and storage in-region; Cloudflare-only doesn't satisfy strict residency reads.
4. If we hire someone with **deep AWS ops experience** → Option B becomes more attractive because the ops overhead drops.

**Avoid Option A (full Cloudflare + Neon).** The RLS rewrite alone is multi-week and removes a security layer that's caught real bugs (SAH-115, SAH-127, SAH-128). Loss > gain unless the cost delta is decisive at scale.

## Pre-migration checklist (when the time comes)

- [ ] Snapshot the trigger metric — record the exact pain we're solving for.
- [ ] Inventory every Supabase feature in use: Auth, Storage, Realtime, RLS policies, Edge Functions, cron jobs.
- [ ] Map each to the destination stack. Anything without a 1:1 replacement gets a custom-build estimate.
- [ ] Run a load test on the new stack with anonymized prod data before any user-facing cutover.
- [ ] Plan a read-only rollback window (DNS TTL low, data sync replayable).
- [ ] Migrate dev/staging first; run for ≥2 weeks before touching production.

## What we are NOT migrating

- **Stripe Connect** — works the same regardless of host. Stays.
- **Resend** — transactional email, host-agnostic. Stays.
- **Mapbox** — geocoding API + tiles, host-agnostic. Stays.
- **Sentry** — observability, host-agnostic. Stays.

## Where this lives going forward

This document is the source of truth for "where could we move and why." Update it when:

- A new candidate stack appears (e.g. Vercel ships AE region — that would change the whole calculation)
- A trigger threshold is crossed (record the date + metric here so we have history)
- A migration actually runs (prune obsolete options, lock in the chosen path)

Closes SAH-49.
