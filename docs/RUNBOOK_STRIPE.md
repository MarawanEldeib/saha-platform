# Runbook — Stripe operations

Practical playbook for the situations that *will* happen on Saha. Every section assumes you have access to the Stripe Dashboard for the platform account and can read the `audit_log` and `payments` tables in Supabase.

---

## 1. Owner says "I didn't get my payout"

### Diagnose

1. Open Stripe Dashboard → Connect → Accounts → find the owner's connected account by email or `stripe_account_id`.
2. Check **Payouts** tab.
   - If a payout exists and is `paid`, the bank likely posted late — show them the trace id and end the conversation.
   - If a payout exists and is `failed`, see §5.
   - If no payout exists, check the dates of charges + Stripe's payout schedule for that account (default 7-day rolling). If they're within window, that's normal — explain.
3. If the connected account shows `charges_enabled=false`, no payouts will issue. Owner needs to finish onboarding. Send them to `/dashboard/facility` → "Connect Stripe".
4. Check `audit_log` for `stripe.account.deauthorized` rows for this account — owner may have unlinked.

### Resolve

- Onboarding incomplete → tell owner to complete it in the dashboard.
- Deauthorized → tell owner to reconnect; existing pending bookings stay attached.
- Bank rejected → see §5.
- Stuck in transfer → contact Stripe support with the transfer id and PaymentIntent id.

---

## 2. Player disputes a charge / chargeback

A `charge.dispute.created` webhook fires when a player files a chargeback through their bank. We log it but never auto-refund.

### Diagnose

1. Pull the dispute id from `audit_log` (action `stripe.dispute.created`). Metadata has the linked facility.
2. Open the dispute in Stripe Dashboard → Disputes → find by id.
3. Decide whether to **accept** or **contest**:
   - Accept = refund + lose dispute fee. Right answer when the player is correct or fighting it isn't worth the time.
   - Contest = upload evidence (booking confirmation, QR scan timestamp from the audit log proving check-in, owner statement). Worth it for confirmed-completed bookings where the player is gaming the system.

### Resolve

- Always reach the owner first. Their account takes the financial hit; we keep our 10% only if we win.
- Keep a copy of the booking detail page (PDF/screenshot) plus relevant `audit_log` rows as evidence.
- After resolution, leave a comment in the corresponding facility's audit log via SQL — there's no UI yet.

---

## 3. Refund issued from Stripe Dashboard (not via our cancel flow)

Happens when ops issues a refund manually. The `charge.refunded` webhook handler picks it up and:

- Sets `payments.status='refunded'` for the matching `stripe_payment_intent_id`.
- Sets `bookings.status='cancelled'`.
- Logs `payment.refunded.via_stripe_dashboard` to `audit_log`.

If the slot was on a future date, **manually release it** via SQL:

```sql
UPDATE court_availability ca
SET is_booked = false
FROM bookings b
WHERE b.id = '<booking_id>' AND b.availability_id = ca.id;
```

(We don't auto-release on the dashboard-refund path because dashboard refunds are sometimes partial corrections rather than cancellations — we want a human to confirm.)

---

## 4. Webhook outage

If `/api/stripe/webhook` is down, Stripe will retry for ~3 days. Symptoms: bookings stuck in `pending`, customers reporting "I paid but it says pending".

### Diagnose

1. Stripe Dashboard → Developers → Webhooks → check delivery status. Failed deliveries are listed.
2. Look at Vercel function logs for `/api/stripe/webhook` — usually a timeout or a Supabase outage.

### Resolve

1. Fix the underlying cause (deploy + monitor).
2. In Stripe Dashboard → Webhooks → click each failed event → **Resend**. The webhook is idempotent (`stripe_events` dedup), so re-sending an already-processed event is a no-op.
3. For events older than the 3-day retry window, manually reconcile:

```sql
-- Find pending bookings older than 30 minutes whose Stripe session is paid.
SELECT b.id, p.stripe_checkout_session_id
FROM bookings b
JOIN payments p ON p.booking_id = b.id
WHERE b.status = 'pending' AND b.created_at < now() - INTERVAL '30 minutes';
```

Then for each, retrieve the session via Stripe API and either re-trigger the webhook delivery or run an admin SQL update. Document each manual fix in `audit_log` with action `stripe.manual_reconcile`.

---

## 5. Payout failed

`payout.failed` webhook fires when the bank rejects (account closed, name mismatch, frozen, etc.). We audit-log + console.error but cannot auto-fix.

### Resolve

1. Find the failure code in `audit_log` (most common: `account_closed`, `incorrect_account_holder_name`, `bank_account_unverifiable`).
2. Email the owner immediately. Stripe also notifies them but our message should explain Saha's side.
3. Tell them to update their bank details in their Stripe Express dashboard (link from `/dashboard/facility`).
4. Once they update, Stripe automatically retries within 24h. Monitor `audit_log` for the next `payout.created` / `payout.paid`.

---

## 6. Owner deauthorized our app

`account.application.deauthorized` fires. The handler clears `facilities.stripe_account_id`. Existing confirmed bookings remain valid (player already paid), but new bookings fall through the SAH-68 readiness guard and return "facility not yet ready to receive payments."

### Resolve

- Reach out to the owner. Find out if it's intentional (leaving the platform) or accidental.
- If accidental: walk them through reconnecting via `/dashboard/facility`.
- If intentional: pause the facility (`UPDATE facilities SET status='suspended' WHERE id='...'`) so it doesn't appear on the map. Process refunds for any future bookings via the owner-cancellation action.

---

## 7. Reconciliation (monthly)

End of each month, eyeball:

- Stripe **Payouts** total per connected account vs. our `payments.amount` sum for that month.
- Platform fees: our `application_fee_amount` total in Stripe vs. (sum of bookings × 10%) — should match within rounding.
- Disputes: count of `audit_log` rows with action `stripe.dispute.created` vs. dispute volume in Stripe Dashboard.

Discrepancies usually trace back to a webhook miss — see §4.

---

*Last updated: 2026-05-09.*
