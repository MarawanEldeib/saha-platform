# Cookie strategy

> **Status:** note-to-future-self (SAH-122). Saha is light on cookies today — this document captures the current footprint and the planned additions so we don't re-research the landscape when we have real users.

## Cookies in use today

| Cookie | Purpose | Required? |
|--------|---------|-----------|
| `sb-<project>-auth-token` | Supabase session — keeps users signed in across pages | **Yes** — without it every navigation re-prompts login |
| `saha_facility_id` | For owners with multiple facilities (SAH-65) — which one they're managing in the dashboard | **Yes** for multi-facility owners |
| `_vercel_analytics` | Visitor analytics (auto-set by `<Analytics />`) | Optional |

Locale lives in the URL (`/en` / `/ar`), most state is server-rendered, and there's no cart/wishlist surface — so the cookie footprint is intentionally small.

## Planned additions (sorted by ROI)

### 1. "Welcome back" personalization

**Cookie:** last-searched `sport` + `city`. Homepage shows featured facilities for that combo on return visits.

- **Effort:** ~1 hour
- **Benefit:** returning users see relevant courts immediately instead of a generic homepage. Real conversion lift.

### 2. Recently-viewed facilities

**Cookie:** array of last 5 facility IDs the user viewed.

- **Effort:** ~2 hours
- **Benefit:** "Continue browsing" rail. Pick-up-where-you-left-off retention nudge.

### 3. Resume abandoned booking

**Cookie:** `{ availability_id, num_players }` if a user picked a slot but didn't pay.

- **Effort:** ~3 hours
- **Benefit:** 15-25% recovery rate is typical for abandoned-checkout flows. Direct revenue impact.

### 4. First-visit onboarding tooltip

**Cookie:** marks a user as having seen the "how to book" walkthrough.

- **Effort:** ~2 hours
- **Benefit:** clearer onboarding for new players, doesn't annoy returning ones.

### 5. A/B test bucket assignment

**Cookie:** sticky variant ID so a user sees the same homepage version each visit.

- **Effort:** ~half day (when we actually need it)
- **Benefit:** only matters once we have enough traffic to A/B test homepage / pricing display.

## Legal angle (do not skip)

UAE PDPL and EU GDPR require **consent for non-essential cookies**. The two we have today are "strictly necessary" — no consent needed. Anything from #1-#5 above tips us into "functional" territory and we should add a consent banner first.

**Banner cost:** ~half day. Mandatory before #1-#5 ship.

## Recommendation

**Skip all of this until we have real users.** As of 2026-05-10 only one seeded facility exists in production — none of these mechanisms help with one venue. Revisit when:

- ~10+ active facilities
- ~100+ regular players
- Real abandoned-checkout funnel data to optimize against

When that day comes, ship in this order: cookie banner → #1 → #3 → #2 → #4. Skip #5 until traffic is large enough to A/B test meaningfully.

## Build sequence

| Step | Effort | Trigger |
|------|--------|---------|
| Cookie consent banner | ~half day | Before any non-essential cookie ships |
| #1 Welcome-back personalization | ~1 h | First return-visitor data |
| #3 Resume abandoned booking | ~3 h | Once payment funnel has visible drop-off |
| #2 Recently viewed | ~2 h | Once browse-funnel data justifies it |
| #4 Onboarding tooltip | ~2 h | When player count makes onboarding noise worth optimizing |
| #5 A/B bucketing | ~half day | When traffic supports statistical tests |
