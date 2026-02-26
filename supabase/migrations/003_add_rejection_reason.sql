-- =============================================================================
-- Migration 003: Add rejection_reason column to facilities
-- Allows admins to record why a facility listing was rejected/suspended.
-- =============================================================================

ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
