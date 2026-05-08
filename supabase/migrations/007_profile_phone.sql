-- Add phone number to profiles for WhatsApp notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
