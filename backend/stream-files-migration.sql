-- Stream Files Migration
-- Create table to manage file references in streams (separate from cards)

-- Create stream_files table
CREATE TABLE IF NOT EXISTS stream_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    depth INTEGER DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT false,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique position per stream
    CONSTRAINT unique_stream_file_position UNIQUE (stream_id, position),
    
    -- Ensure file can't be added to same stream twice
    CONSTRAINT unique_stream_file UNIQUE (stream_id, file_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stream_files_stream_id ON stream_files(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_files_file_id ON stream_files(file_id);
CREATE INDEX IF NOT EXISTS idx_stream_files_position ON stream_files(stream_id, position);

-- Function to get next available position in stream (accounting for both cards and files)
CREATE OR REPLACE FUNCTION get_next_stream_position(target_stream_id UUID)
RETURNS INTEGER AS $$
DECLARE
    max_card_pos INTEGER;
    max_file_pos INTEGER;
    next_pos INTEGER;
BEGIN
    -- Get max position from stream_cards
    SELECT COALESCE(MAX(position), -1) INTO max_card_pos
    FROM stream_cards 
    WHERE stream_id = target_stream_id;
    
    -- Get max position from stream_files
    SELECT COALESCE(MAX(position), -1) INTO max_file_pos
    FROM stream_files 
    WHERE stream_id = target_stream_id;
    
    -- Return the next available position
    next_pos := GREATEST(max_card_pos, max_file_pos) + 1;
    
    RETURN next_pos;
END;
$$ LANGUAGE plpgsql;

-- Function to shift positions when inserting at specific position
CREATE OR REPLACE FUNCTION shift_stream_positions(
    target_stream_id UUID, 
    insert_position INTEGER,
    shift_amount INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    -- Shift cards
    UPDATE stream_cards 
    SET position = position + shift_amount
    WHERE stream_id = target_stream_id AND position >= insert_position;
    
    -- Shift files
    UPDATE stream_files
    SET position = position + shift_amount
    WHERE stream_id = target_stream_id AND position >= insert_position;
END;
$$ LANGUAGE plpgsql;

-- Function to compact stream positions (remove gaps)
CREATE OR REPLACE FUNCTION compact_stream_positions(target_stream_id UUID)
RETURNS VOID AS $$
DECLARE
    item RECORD;
    new_position INTEGER := 0;
BEGIN
    -- Get all items (cards and files) in stream order
    FOR item IN (
        SELECT 'card' as item_type, id as item_id, position
        FROM stream_cards 
        WHERE stream_id = target_stream_id
        UNION ALL
        SELECT 'file' as item_type, id as item_id, position
        FROM stream_files
        WHERE stream_id = target_stream_id
        ORDER BY position
    ) LOOP
        -- Update position for each item
        IF item.item_type = 'card' THEN
            UPDATE stream_cards 
            SET position = new_position 
            WHERE id = item.item_id;
        ELSE
            UPDATE stream_files
            SET position = new_position 
            WHERE id = item.item_id;
        END IF;
        
        new_position := new_position + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Remove file-related columns from cards table (cleanup)
-- These were added incorrectly in previous migrations
ALTER TABLE cards DROP COLUMN IF EXISTS file_id;
ALTER TABLE cards DROP COLUMN IF EXISTS is_file_card;
ALTER TABLE cards DROP COLUMN IF EXISTS file_viewer_expanded;

-- Remove file card type from cards (files are no longer cards)
UPDATE cards SET card_type = 'saved' WHERE card_type = 'file';

-- Create view for stream items (mixed cards and files)
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

-- Comments for documentation
COMMENT ON TABLE stream_files IS 'Manages file references in streams - files and cards are separate entities';
COMMENT ON COLUMN stream_files.position IS 'Position in stream alongside cards (shared position space)';
COMMENT ON FUNCTION get_next_stream_position(UUID) IS 'Gets next available position accounting for both cards and files';
COMMENT ON FUNCTION shift_stream_positions(UUID, INTEGER, INTEGER) IS 'Shifts both card and file positions when inserting items';
COMMENT ON VIEW stream_items_view IS 'Unified view of all stream items (cards and files) for easy querying';

SELECT 'Stream files migration completed successfully!' AS status;