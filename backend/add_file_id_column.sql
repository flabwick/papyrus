-- Migration to add missing file_id column to cards table
-- This fixes the "column file_id of relation cards does not exist" error

-- Add file_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cards' AND column_name = 'file_id'
    ) THEN
        ALTER TABLE cards ADD COLUMN file_id UUID;
        RAISE NOTICE 'Added file_id column to cards table';
    ELSE
        RAISE NOTICE 'file_id column already exists in cards table';
    END IF;
END $$;

-- Add foreign key constraint to files table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'files') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'cards_file_id_fkey' AND table_name = 'cards'
        ) THEN
            ALTER TABLE cards ADD CONSTRAINT cards_file_id_fkey 
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added foreign key constraint for file_id';
        ELSE
            RAISE NOTICE 'Foreign key constraint for file_id already exists';
        END IF;
    ELSE
        RAISE NOTICE 'files table does not exist, skipping foreign key constraint';
    END IF;
END $$;
