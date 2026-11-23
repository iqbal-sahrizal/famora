-- Migration 0001: Extensions, internal schema, and shared trigger helpers
-- Safe, additive-only migration.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Dedicated internal schema for security/RLS helpers (not exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS famora;

-- Shared updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION famora.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
