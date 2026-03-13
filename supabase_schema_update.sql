-- Run this script in your Supabase SQL Editor
-- This adds the necessary columns for dynamic Excel data and duplicate prevention

ALTER TABLE public.client_orders
ADD COLUMN IF NOT EXISTS import_hash text UNIQUE;

ALTER TABLE public.client_orders
ADD COLUMN IF NOT EXISTS raw_data jsonb;

-- Optional: if you already have existing duplicate rows and want to clean them up,
-- you would need to delete them before applying the UNIQUE constraint,
-- but adding the constraint like this is safe if import_hash is currently null for all rows.
