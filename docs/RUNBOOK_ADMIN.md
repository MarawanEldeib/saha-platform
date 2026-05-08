# Runbook — Admin operations

For the people on the Saha admin side. Assumes you have an admin role on the platform and read access to Supabase.

---

## 1. Approve a facility

A new facility submits onboarding → status `pending` → appears in `/admin/facilities`.

### Verify before approving

1. **Identity** — the business name on the form should match a real venue. Quick Google Maps check.
2. **Contact** — phone number is reachable (call / WhatsApp). Website resolves.
3. **Stripe** — the account is connected and `charges_enabled=true`. The booking flow now blocks if not, but check anyway so the owner doesn't waste time.
4. **Photos** — at least one upload, no random images.
5. **Sports** — selected sports actually match what the venue offers.

### Approve / reject

- **Approve** in the dashboard → status flips to `active`, facility appears on the map, owners can list courts.
- **Reject** — fill in the rejection reason. The owner sees this on their dashboard. Be specific so they can fix it.

Either action is recorded in `audit_log` (action `facility.approve` or `facility.reject`).

---

## 2. Suspend a facility (post-approval)

Reasons: ToS violation, repeated owner cancellations, dispute volume, fake reviews.

```sql
UPDATE public.facilities
SET status = 'suspended', rejection_reason = '<short reason>'
WHERE id = '<facility_id>';
```

Then log the action manually:

```sql
INSERT INTO public.audit_log (actor_id, actor_role, action, target_type, target_id, metadata)
VALUES (auth.uid(), 'admin', 'facility.suspend', 'facility', '<facility_id>',
        jsonb_build_object('reason', '<short reason>'));
```

A suspended facility is hidden from the public map and from bookings. Existing confirmed bookings are honoured (don't double-screw the player). For any future bookings on the facility, use `ownerCancelBookingAction` (or its admin equivalent) to refund + release.

---

## 3. PII deletion request (UAE PDPL / general)

A user emails asking for their data to be deleted.

1. Verify the request comes from the email on the account (don't accept "delete x@y.com" from another address).
2. Walk them through self-serve in `/account` — soft-delete just sets `profiles.deletion_requested_at = now()`, then 30 days later the cron `gdpr_delete_expired_accounts()` hard-deletes them.
3. If they need it sooner (legal demand), run:

```sql
UPDATE public.profiles SET deletion_requested_at = now() - INTERVAL '31 days'
WHERE id = '<user_id>';

SELECT public.gdpr_delete_expired_accounts();
```

This cascades through `auth.users` → `profiles` → bookings → reviews etc.

⚠️ **Don't delete a user with active bookings** without first cancelling + refunding them. Otherwise the player loses recourse on their existing bookings.

---

## 4. Promote a user to admin

Admins are not creatable via the registration form (SAH-84 hardened the trigger). Promotion is SQL-only:

```sql
UPDATE public.profiles SET role = 'admin' WHERE id = '<user_id>';

INSERT INTO public.audit_log (actor_id, actor_role, action, target_type, target_id, metadata)
VALUES (auth.uid(), 'admin', 'admin.promote', 'profile', '<user_id>', '{}');
```

A new admin should set up 2FA on first login (when SAH-80 lands).

---

## 5. Demote / revoke an admin

```sql
UPDATE public.profiles SET role = 'user' WHERE id = '<user_id>';

INSERT INTO public.audit_log (actor_id, actor_role, action, target_type, target_id, metadata)
VALUES (auth.uid(), 'admin', 'admin.demote', 'profile', '<user_id>', '{}');
```

Force a session refresh by deleting their refresh tokens via Supabase Auth admin API if you need it to take effect immediately:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
await createAdminClient().auth.admin.signOut("<user_id>");
```

---

## 6. Audit log review

```sql
-- Last 50 admin actions
SELECT created_at, actor_id, action, target_type, target_id, metadata
FROM public.audit_log
WHERE actor_role IN ('admin', 'system')
ORDER BY created_at DESC
LIMIT 50;

-- All actions on a specific facility
SELECT * FROM public.audit_log
WHERE target_type = 'facility' AND target_id = '<facility_id>'
ORDER BY created_at;

-- All cancellations in the last 7 days
SELECT * FROM public.audit_log
WHERE action LIKE 'booking.cancel%'
  AND created_at > now() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

Use these queries when investigating disputes or weird user reports.

---

## 7. Resetting a player's no-show count

If we marked someone as a no-show in error (e.g. owner forgot to scan QR), reset:

```sql
-- Flip the booking back to completed
UPDATE public.bookings SET status = 'completed' WHERE id = '<booking_id>' AND status = 'no_show';

-- Decrement counter
UPDATE public.profiles
SET no_show_count = GREATEST(no_show_count - 1, 0)
WHERE id = '<player_id>';

-- Document
INSERT INTO public.audit_log (actor_id, actor_role, action, target_type, target_id, metadata)
VALUES (auth.uid(), 'admin', 'booking.no_show.reverse', 'booking', '<booking_id>',
        jsonb_build_object('reason', '<reason>'));
```

---

## 8. Common SQL helpers

```sql
-- Find a user by email
SELECT u.id, u.email, p.role, p.display_name, p.no_show_count
FROM auth.users u JOIN public.profiles p ON p.id = u.id
WHERE u.email = '<email>';

-- Find a facility by name (case-insensitive partial)
SELECT id, name, slug, status, owner_id, stripe_account_id
FROM public.facilities
WHERE name ILIKE '%<part>%';

-- Pending facilities older than 7 days (chase or close)
SELECT id, name, city, created_at
FROM public.facilities
WHERE status = 'pending' AND created_at < now() - INTERVAL '7 days'
ORDER BY created_at;
```

---

*Last updated: 2026-05-09.*
