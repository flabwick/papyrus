-- Fix Database Migration - Add missing stream_files table and stream_items_view
-- This addresses the "relation stream_items_view does not exist" error

-- First, check if files table exists (referenced by stream_files)
-- If it doesn't exist, create a basic files table
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    file_path VARCHAR(700) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT DEFAULT 0,
    file_hash VARCHAR(64),
    mime_type VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns that the application expects
ALTER TABLE files ADD COLUMN IF NOT EXISTS file_type VARCHAR(20);
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE files ADD COLUMN IF NOT EXISTS processing_status VARCHAR(50) DEFAULT 'pending';

-- Add PDF-specific metadata columns
ALTER TABLE files ADD COLUMN IF NOT EXISTS pdf_page_count INTEGER;
ALTER TABLE files ADD COLUMN IF NOT EXISTS pdf_title VARCHAR(500);
ALTER TABLE files ADD COLUMN IF NOT EXISTS pdf_author VARCHAR(255);
ALTER TABLE files ADD COLUMN IF NOT EXISTS pdf_subject VARCHAR(500);
ALTER TABLE files ADD COLUMN IF NOT EXISTS pdf_creator VARCHAR(255);
ALTER TABLE files ADD COLUMN IF NOT EXISTS pdf_producer VARCHAR(255);
ALTER TABLE files ADD COLUMN IF NOT EXISTS pdf_version VARCHAR(10);
ALTER TABLE files ADD COLUMN IF NOT EXISTS pdf_encrypted BOOLEAN DEFAULT false;

-- Add EPUB-specific metadata columns
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_title VARCHAR(500);
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_author VARCHAR(255);
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_publisher VARCHAR(255);
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_language VARCHAR(20);
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_isbn VARCHAR(50);
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_publication_date DATE;
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_description TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_chapter_count INTEGER;
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_has_images BOOLEAN DEFAULT false;
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_has_toc BOOLEAN DEFAULT false;
ALTER TABLE files ADD COLUMN IF NOT EXISTS epub_subjects JSONB;

-- Add common file metadata columns
ALTER TABLE files ADD COLUMN IF NOT EXISTS content_preview TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS text_length INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS cover_image_path VARCHAR(700);

-- Update file_type from mime_type where possible
UPDATE files SET file_type = 
    CASE 
        WHEN mime_type = 'application/pdf' THEN 'pdf'
        WHEN mime_type = 'application/epub+zip' THEN 'epub'
        WHEN file_name LIKE '%.pdf' THEN 'pdf'
        WHEN file_name LIKE '%.epub' THEN 'epub'
        ELSE 'unknown'
    END
WHERE file_type IS NULL;

-- Create stream_files table
CREATE TABLE IF NOT EXISTS stream_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Remove file-related columns from cards table if they exist (cleanup)
ALTER TABLE cards DROP COLUMN IF EXISTS file_id;
ALTER TABLE cards DROP COLUMN IF EXISTS is_file_card;
ALTER TABLE cards DROP COLUMN IF EXISTS file_viewer_expanded;

-- Remove file card type from cards (files are no longer cards)
UPDATE cards SET card_type = 'saved' WHERE card_type = 'file';

-- Create the missing stream_items_view
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

-- Add indexes for files table
CREATE INDEX IF NOT EXISTS idx_files_library_id ON files(library_id);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(file_path);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(file_hash);
CREATE INDEX IF NOT EXISTS idx_files_type ON files(file_type);

-- Add indexes for PDF metadata
CREATE INDEX IF NOT EXISTS idx_files_pdf_author ON files(pdf_author) WHERE file_type = 'pdf';
CREATE INDEX IF NOT EXISTS idx_files_pdf_pages ON files(pdf_page_count) WHERE file_type = 'pdf';

-- Add indexes for EPUB metadata
CREATE INDEX IF NOT EXISTS idx_files_epub_author ON files(epub_author) WHERE file_type = 'epub';
CREATE INDEX IF NOT EXISTS idx_files_epub_publisher ON files(epub_publisher) WHERE file_type = 'epub';
CREATE INDEX IF NOT EXISTS idx_files_epub_language ON files(epub_language) WHERE file_type = 'epub';

-- Comments for documentation
COMMENT ON TABLE stream_files IS 'Manages file references in streams - files and cards are separate entities';
COMMENT ON COLUMN stream_files.position IS 'Position in stream alongside cards (shared position space)';
COMMENT ON FUNCTION get_next_stream_position(UUID) IS 'Gets next available position accounting for both cards and files';
COMMENT ON FUNCTION shift_stream_positions(UUID, INTEGER, INTEGER) IS 'Shifts both card and file positions when inserting items';
COMMENT ON VIEW stream_items_view IS 'Unified view of all stream items (cards and files) for easy querying';

SELECT 'Database migration completed successfully! stream_items_view and stream_files table created with all required columns.' AS status;
