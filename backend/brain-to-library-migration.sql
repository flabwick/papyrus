-- Brain to Library Migration
-- Renames all brain references to library throughout the database schema

-- Begin transaction to ensure atomic migration
BEGIN;

-- Rename tables
ALTER TABLE IF EXISTS brains RENAME TO libraries;
ALTER TABLE IF EXISTS stream_files RENAME CONSTRAINT stream_files_file_id_fkey TO stream_files_file_id_fkey_temp;

-- Update column references in all tables
ALTER TABLE IF EXISTS libraries RENAME COLUMN brain_id TO library_id;
ALTER TABLE IF EXISTS cards RENAME COLUMN brain_id TO library_id;
ALTER TABLE IF EXISTS files RENAME COLUMN brain_id TO library_id;
ALTER TABLE IF EXISTS streams RENAME COLUMN brain_id TO library_id;

-- Update foreign key constraints
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_brain_id_fkey;
ALTER TABLE cards ADD CONSTRAINT cards_library_id_fkey FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE;

ALTER TABLE files DROP CONSTRAINT IF EXISTS files_brain_id_fkey;
ALTER TABLE files ADD CONSTRAINT files_library_id_fkey FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE;

ALTER TABLE streams DROP CONSTRAINT IF EXISTS streams_brain_id_fkey;
ALTER TABLE streams ADD CONSTRAINT streams_library_id_fkey FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE;

-- Update unique constraints
ALTER TABLE libraries DROP CONSTRAINT IF EXISTS brains_user_id_name_key;
ALTER TABLE libraries ADD CONSTRAINT libraries_user_id_name_key UNIQUE(user_id, name);

ALTER TABLE streams DROP CONSTRAINT IF EXISTS streams_brain_id_name_key;
ALTER TABLE streams ADD CONSTRAINT streams_library_id_name_key UNIQUE(library_id, name);

ALTER TABLE cards DROP CONSTRAINT IF EXISTS unique_brain_title;
ALTER TABLE cards ADD CONSTRAINT unique_library_title UNIQUE (library_id, title) DEFERRABLE INITIALLY DEFERRED;

-- Update indexes
DROP INDEX IF EXISTS idx_brains_user_id;
CREATE INDEX IF NOT EXISTS idx_libraries_user_id ON libraries(user_id);

DROP INDEX IF EXISTS idx_brains_folder_path;
CREATE INDEX IF NOT EXISTS idx_libraries_folder_path ON libraries(folder_path);

DROP INDEX IF EXISTS idx_cards_brain_id;
CREATE INDEX IF NOT EXISTS idx_cards_library_id ON cards(library_id);

DROP INDEX IF EXISTS idx_cards_title;
CREATE INDEX IF NOT EXISTS idx_cards_title ON cards(library_id, title);

DROP INDEX IF EXISTS idx_cards_type_brain;
CREATE INDEX IF NOT EXISTS idx_cards_type_library ON cards(library_id, card_type);

DROP INDEX IF EXISTS idx_streams_brain_id;
CREATE INDEX IF NOT EXISTS idx_streams_library_id ON streams(library_id);

DROP INDEX IF EXISTS idx_files_brain_id;
CREATE INDEX IF NOT EXISTS idx_files_library_id ON files(library_id);

-- Update functions that reference brain
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Auto-convert unsaved to saved when title is added (for cards table only)
    IF TG_TABLE_NAME = 'cards' THEN
        -- Auto-convert unsaved to saved when title is added
        IF OLD.card_type = 'unsaved' AND NEW.title IS NOT NULL AND NEW.title != '' AND 
           (OLD.title IS NULL OR OLD.title = '') THEN
            NEW.card_type = 'saved';
            NEW.is_brain_wide = true;
            NEW.stream_specific_id = NULL;
        END IF;
        
        -- Ensure consistency rules for stream-specific cards
        IF NEW.card_type = 'unsaved' AND NEW.stream_specific_id IS NULL THEN
            RAISE EXCEPTION 'Unsaved cards must have stream_specific_id';
        END IF;
        
        -- Library-wide cards should not have stream restrictions
        IF NEW.is_brain_wide = true AND NEW.stream_specific_id IS NOT NULL THEN
            NEW.stream_specific_id = NULL;
        END IF;
        
        -- Only unsaved cards can have stream restrictions
        IF NEW.card_type != 'unsaved' AND NEW.stream_specific_id IS NOT NULL THEN
            NEW.stream_specific_id = NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Update triggers
DROP TRIGGER IF EXISTS update_brains_updated_at ON libraries;
CREATE TRIGGER update_libraries_updated_at BEFORE UPDATE ON libraries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Recreate the stream_items_view with updated table/column references
DROP VIEW IF EXISTS stream_items_view;
CREATE OR REPLACE VIEW stream_items_view AS
SELECT 
    stream_id,
    position,
    depth,
    is_collapsed,
    added_at,
    'card' as item_type,
    id as item_id,
    NULL::UUID as file_id,
    id as card_id
FROM stream_cards
UNION ALL
SELECT 
    stream_id,
    position,
    depth,
    is_collapsed,
    added_at,
    'file' as item_type,
    id as item_id,
    file_id,
    NULL::UUID as card_id
FROM stream_files
ORDER BY stream_id, position;

-- Update comments
COMMENT ON TABLE libraries IS 'Knowledge bases containing cards and files (renamed from brains)';
COMMENT ON COLUMN cards.library_id IS 'Reference to the library this card belongs to';
COMMENT ON COLUMN files.library_id IS 'Reference to the library this file belongs to';
COMMENT ON COLUMN streams.library_id IS 'Reference to the library this stream belongs to';

COMMIT;

SELECT 'Brain to Library migration completed successfully!' AS status;