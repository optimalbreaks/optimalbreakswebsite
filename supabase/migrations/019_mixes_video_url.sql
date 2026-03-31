-- Add video_url column to mixes for embedded YouTube/video players
ALTER TABLE public.mixes ADD COLUMN IF NOT EXISTS video_url TEXT;
