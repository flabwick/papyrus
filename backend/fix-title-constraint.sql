-- Fix title column to allow NULL values for unsaved cards
-- This addresses the NOT NULL constraint issue

-- Remove NOT NULL constraint from title column
ALTER TABLE cards ALTER COLUMN title DROP NOT NULL;

-- Update the unique constraint to exclude NULL titles
-- First drop the existing unique constraint if it exists
DO $$
BEGIN
    -- Drop existing unique constraints that might conflict
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_brain_title' 
        AND table_name = 'cards'
    ) THEN
        ALTER TABLE cards DROP CONSTRAINT unique_brain_title;
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'cards_brain_id_title_key' 
        AND table_name = 'cards'
    ) THEN
        ALTER TABLE cards DROP CONSTRAINT cards_brain_id_title_key;
    END IF;
END $$;

-- Add partial unique constraint that only applies when title is not NULL
CREATE UNIQUE INDEX IF NOT EXISTS unique_brain_title_not_null 
ON cards (brain_id, title) 
WHERE title IS NOT NULL;

SELECT 'Title constraint fix completed - cards can now have NULL titles' as status;