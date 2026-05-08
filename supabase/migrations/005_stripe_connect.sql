-- Add Stripe Connect account ID to facilities (SAH-16)
ALTER TABLE public.facilities
ADD COLUMN stripe_account_id TEXT;
