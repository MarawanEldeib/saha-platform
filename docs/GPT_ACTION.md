# Saha — Custom GPT Setup (SAH-38)

Manual walkthrough for publishing Saha as a Custom GPT in the OpenAI GPT
Store. The technical prerequisite is the OpenAPI spec at
`/api/openapi.json` (shipped in SAH-35).

**Published GPT**: [chatgpt.com/g/g-69ff995c750c819189d6876a8584e8d0-saha](https://chatgpt.com/g/g-69ff995c750c819189d6876a8584e8d0-saha)

---

## Prerequisites

- ChatGPT Plus/Pro account (Custom GPTs aren't on the free tier).
- A version of the API deployed and reachable. Verify:
  ```
  curl https://sahasports.vercel.app/api/openapi.json
  ```

---

## Step-by-step

### 1. Create a new GPT

1. Visit https://chatgpt.com/gpts/editor
2. Click **Create**.
3. Switch to the **Configure** tab (skip the chat-style wizard — we'll
   paste exact values).

### 2. Identity

| Field | Value |
|---|---|
| **Name** | `Saha` |
| **Description** | `Find and book Padel, Tennis, Squash, Badminton, and Pickleball courts in the UAE. Powered by Saha. اكتشف واحجز ملاعب البادل والبيكلبول والتنس والإسكواش والبادمنتون في الإمارات.` |
| **Icon** | Upload `public/saha-logo-512.png` from the repo |

### 3. Instructions (system prompt)

Paste the contents of `prompts/gpt-action-system.md` from this repo (also
included verbatim below). Update versions when capabilities change.

### 4. Conversation starters

Add four prompts so users have something to click. Mix of English + Arabic
so the GPT advertises bilingual support visibly:
- `Find a padel court in Dubai for tomorrow evening`
- `What courts are open near me right now?`
- `ابحث عن ملعب بادل في دبي مساء الغد`
- `ما الملاعب المتاحة هذا الأسبوع؟`

### 5. Capabilities

- **Web Browsing**: ON (so it can render facility pages when linked)
- **DALL·E**: OFF
- **Code Interpreter**: OFF

### 6. Actions (the important part)

1. Click **Create new action**.
2. **Authentication**: leave as **None** — the read endpoints we ship
   today are public. (When SAH-118 lands, we'll switch to OAuth or API
   key for the booking action.)
3. **Schema**: paste this URL, then click **Import from URL**:
   ```
   https://sahasports.vercel.app/api/openapi.json
   ```
4. **Privacy policy**: enter
   ```
   https://sahasports.vercel.app/legal/privacy
   ```
   (or whichever URL you want OpenAI to surface — required for public
   GPTs).

### 7. Test inside the editor

In the right pane, send: `Find me a padel court in Dubai`. Watch the
**Actions** drawer — you should see an outbound `GET /api/v1/facilities`
call with the response. If it hits, you're done.

### 8. Publish

- **Sharing**: pick **Anyone with the link** for soft launch, or
  **Everyone (GPT Store)** when you're ready to list publicly.
- For the GPT Store listing: pick **Lifestyle** or **Productivity**
  category. UAE-specific tags help discoverability.

---

## What works today

- Search facilities by sport, city, geo radius
- Get facility details (hours, sports, photos, ratings)
- Look up open slots for a date

## What doesn't (yet)

- Booking creation — `POST /api/v1/bookings` returns 501. The GPT will
  read the error message and fall back to: "I found a slot for you. Open
  https://sahasports.vercel.app/{slug}/availability?date=… to book."
  Tracked in **SAH-118**.

When SAH-118 ships, come back here and:
1. Re-import the schema (Action → **Import from URL** again).
2. Switch **Authentication** to **OAuth** (Supabase) — settings live in
   Supabase Auth → Providers → Custom OAuth.
3. Update the system prompt to mention "I can book directly" instead of
   the deep-link fallback.

---

## Why no OAuth today

The original ticket asked for OAuth. We deferred that to SAH-118 because:
- The read endpoints are genuinely public — no PII, all RLS-gated to
  `status='active'` facilities.
- OAuth adds setup friction for the v1 launch (Supabase OAuth is real but
  needs JWKS exposure, redirect URI registration, etc.).
- Booking creation isn't shipped via API yet — there's nothing privileged
  to call.

When SAH-118 lands the booking endpoint, OAuth becomes useful in the
same change.
