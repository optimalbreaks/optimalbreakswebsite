-- ============================================
-- OPTIMAL BREAKS — Artist Extended Fields
-- Adds real_name, labels_founded, key_releases
-- Run after 005_storage_media.sql
-- ============================================

ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS real_name TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS labels_founded TEXT[] DEFAULT '{}';
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS key_releases JSONB DEFAULT '[]';
