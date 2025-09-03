-- Cards to Pages Migration Script
-- Renames all card references to page throughout the database schema
-- Run this script to migrate from card-based to page-based terminology

-- Begin transaction to ensure atomicity
BEGIN;

-- Step 1: Drop foreign key constraints that reference cards table
-- These will be recreated with new names after table rename

-- Drop constraints on stream_cards table
ALTER TABLE stream_cards DROP CONSTRAINT IF EXISTS stream_cards_card_id_fkey;
ALTER TABLE stream_cards DROP CONSTRAINT IF EXISTS unique_stream_card_position; -- old name
ALTER TABLE stream_cards DROP CONSTRAINT IF EXISTS stream_cards_stream_id_position_key; -- new name

-- Drop constraints on card_links table  
ALTER TABLE card_links DROP CONSTRAINT IF EXISTS card_links_source_card_id_fkey;
ALTER TABLE card_links DROP CONSTRAINT IF EXISTS card_links_target_card_id_fkey;

-- Drop constraints on cards table itself
ALTER TABLE cards DROP CONSTRAINT IF EXISTS unique_library_title;

-- Step 2: Drop indexes that will need to be recreated
DROP INDEX IF EXISTS idx_cards_library_id;
DROP INDEX IF EXISTS idx_cards_title;
DROP INDEX IF EXISTS idx_cards_file_path;
DROP INDEX IF EXISTS idx_cards_file_hash;
DROP INDEX IF EXISTS idx_cards_active;
DROP INDEX IF EXISTS idx_cards_type;
DROP INDEX IF EXISTS idx_cards_brain_wide;
DROP INDEX IF EXISTS idx_cards_stream_specific;
DROP INDEX IF EXISTS idx_cards_type_library;

DROP INDEX IF EXISTS idx_card_links_source;
DROP INDEX IF EXISTS idx_card_links_target;
DROP INDEX IF EXISTS idx_card_links_text;
DROP INDEX IF EXISTS idx_card_links_position;
DROP INDEX IF EXISTS idx_card_links_valid;

DROP INDEX IF EXISTS idx_stream_cards_stream_id;
DROP INDEX IF EXISTS idx_stream_cards_card_id;
DROP INDEX IF EXISTS idx_stream_cards_position;
DROP INDEX IF EXISTS idx_stream_cards_ai_context;
DROP INDEX IF EXISTS idx_stream_cards_depth;

-- Step 3: Drop triggers that reference cards table
DROP TRIGGER IF EXISTS update_cards_updated_at ON cards;

-- Step 4: Rename tables
ALTER TABLE cards RENAME TO pages;
ALTER TABLE card_links RENAME TO page_links;
ALTER TABLE stream_cards RENAME TO stream_pages;

-- Step 5: Rename columns in pages table (formerly cards)
ALTER TABLE pages RENAME COLUMN card_type TO page_type;

-- Step 6: Update check constraints
ALTER TABLE pages DROP CONSTRAINT IF EXISTS cards_card_type_check;
ALTER TABLE pages ADD CONSTRAINT pages_page_type_check CHECK (page_type IN ('saved', 'file', 'unsaved'));

-- Step 7: Rename columns in page_links table (formerly card_links)
ALTER TABLE page_links RENAME COLUMN source_card_id TO source_page_id;
ALTER TABLE page_links RENAME COLUMN target_card_id TO target_page_id;

-- Step 8: Rename columns in stream_pages table (formerly stream_cards)
ALTER TABLE stream_pages RENAME COLUMN card_id TO page_id;

-- Step 9: Update references in cards table to streams (if streams still exist)
-- Note: The cards table references streams(id) via stream_specific_id, this doesn't need renaming
-- since we're only changing "card" to "page", not "stream" to anything else

-- Step 10: Recreate foreign key constraints with new names
ALTER TABLE stream_pages ADD CONSTRAINT stream_pages_page_id_fkey 
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE;

ALTER TABLE page_links ADD CONSTRAINT page_links_source_page_id_fkey 
    FOREIGN KEY (source_page_id) REFERENCES pages(id) ON DELETE CASCADE;

ALTER TABLE page_links ADD CONSTRAINT page_links_target_page_id_fkey 
    FOREIGN KEY (target_page_id) REFERENCES pages(id) ON DELETE CASCADE;

-- Recreate unique constraints
ALTER TABLE pages ADD CONSTRAINT unique_library_title UNIQUE (library_id, title) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE stream_pages ADD CONSTRAINT unique_stream_page UNIQUE (stream_id, page_id);
ALTER TABLE stream_pages ADD CONSTRAINT unique_stream_page_position UNIQUE (stream_id, position);

-- Step 11: Recreate indexes with new names
CREATE INDEX idx_pages_library_id ON pages(library_id);
CREATE INDEX idx_pages_title ON pages(library_id, title);
CREATE INDEX idx_pages_file_path ON pages(file_path);
CREATE INDEX idx_pages_file_hash ON pages(file_hash);
CREATE INDEX idx_pages_active ON pages(is_active);
CREATE INDEX idx_pages_type ON pages(page_type);
CREATE INDEX idx_pages_brain_wide ON pages(is_brain_wide);
CREATE INDEX idx_pages_stream_specific ON pages(stream_specific_id);
CREATE INDEX idx_pages_type_library ON pages(library_id, page_type);

CREATE INDEX idx_page_links_source ON page_links(source_page_id);
CREATE INDEX idx_page_links_target ON page_links(target_page_id);
CREATE INDEX idx_page_links_text ON page_links(link_text);
CREATE INDEX idx_page_links_position ON page_links(source_page_id, position_in_source);
CREATE INDEX idx_page_links_valid ON page_links(is_valid);

CREATE INDEX idx_stream_pages_stream_id ON stream_pages(stream_id);
CREATE INDEX idx_stream_pages_page_id ON stream_pages(page_id);
CREATE INDEX idx_stream_pages_position ON stream_pages(stream_id, position);
CREATE INDEX idx_stream_pages_ai_context ON stream_pages(stream_id, is_in_ai_context);
CREATE INDEX idx_stream_pages_depth ON stream_pages(stream_id, depth);

-- Step 12: Update the trigger function to reference pages instead of cards
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Auto-convert unsaved to saved when title is added (for pages table only)
    IF TG_TABLE_NAME = 'pages' THEN
        -- Auto-convert unsaved to saved when title is added
        IF OLD.page_type = 'unsaved' AND NEW.title IS NOT NULL AND NEW.title != '' AND 
           (OLD.title IS NULL OR OLD.title = '') THEN
            NEW.page_type = 'saved';
            NEW.is_brain_wide = true;
            NEW.stream_specific_id = NULL;
        END IF;
        
        -- Ensure consistency rules for stream-specific pages
        IF NEW.page_type = 'unsaved' AND NEW.stream_specific_id IS NULL THEN
            RAISE EXCEPTION 'Unsaved pages must have stream_specific_id';
        END IF;
        
        -- Library-wide pages should not have stream restrictions
        IF NEW.is_brain_wide = true AND NEW.stream_specific_id IS NOT NULL THEN
            NEW.stream_specific_id = NULL;
        END IF;
        
        -- Only unsaved pages can have stream restrictions
        IF NEW.page_type != 'unsaved' AND NEW.stream_specific_id IS NOT NULL THEN
            NEW.stream_specific_id = NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Step 13: Recreate triggers with new names
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 14: Update any views that might exist (check for stream_items_view)
-- Drop and recreate if it exists
DROP VIEW IF EXISTS stream_items_view CASCADE;

-- Check if workspaces table exists and update references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspaces') THEN
        -- Update any workspace-related references if they exist
        -- This is a placeholder - adjust based on actual workspace schema
        NULL;
    END IF;
END
$$;

-- Commit the transaction
COMMIT;

-- Display success message
SELECT 'Cards to Pages migration completed successfully!' as migration_status;