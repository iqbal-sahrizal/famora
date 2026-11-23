-- Migration 0033: Add locale preference (Indonesian 'id' default, English 'en') to member_preferences

ALTER TABLE public.member_preferences
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'id'
  CHECK (locale IN ('id', 'en'));
