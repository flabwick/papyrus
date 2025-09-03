-- File Cards Module - Add Missing Columns Migration
-- Migration to add PDF and EPUB metadata columns to existing files table

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

-- Add columns to cards table for file card support if not exists
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_file_card BOOLEAN DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS file_viewer_expanded BOOLEAN DEFAULT false;

-- Add indexes for PDF metadata (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_files_pdf_author ON files(pdf_author) WHERE file_type = 'pdf';
CREATE INDEX IF NOT EXISTS idx_files_pdf_pages ON files(pdf_page_count) WHERE file_type = 'pdf';

-- Add indexes for EPUB metadata (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_files_epub_author ON files(epub_author) WHERE file_type = 'epub';
CREATE INDEX IF NOT EXISTS idx_files_epub_publisher ON files(epub_publisher) WHERE file_type = 'epub';
CREATE INDEX IF NOT EXISTS idx_files_epub_language ON files(epub_language) WHERE file_type = 'epub';

-- Add index for file cards in cards table
CREATE INDEX IF NOT EXISTS idx_cards_file_card ON cards(is_file_card) WHERE is_file_card = true;

-- File processing helper functions (recreate with proper column names)
CREATE OR REPLACE FUNCTION get_file_display_title(file_record files)
RETURNS TEXT AS $$
BEGIN
    -- Return appropriate title based on file type
    IF file_record.file_type = 'pdf' AND file_record.pdf_title IS NOT NULL THEN
        RETURN file_record.pdf_title;
    ELSIF file_record.file_type = 'epub' AND file_record.epub_title IS NOT NULL THEN
        RETURN file_record.epub_title;
    ELSE
        -- Clean up filename for display
        RETURN regexp_replace(
            regexp_replace(file_record.file_name, '\.[^.]*$', ''), -- remove extension
            '[-_]', ' ', 'g' -- replace dashes/underscores with spaces
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get file metadata summary (recreate with proper column names)
CREATE OR REPLACE FUNCTION get_file_metadata_summary(file_record files)
RETURNS JSONB AS $$
DECLARE
    metadata JSONB := '{}';
BEGIN
    -- Common metadata
    metadata := metadata || jsonb_build_object(
        'fileSize', file_record.file_size,
        'wordCount', file_record.word_count,
        'processingStatus', file_record.processing_status,
        'uploadedAt', file_record.uploaded_at
    );
    
    -- PDF-specific metadata
    IF file_record.file_type = 'pdf' THEN
        metadata := metadata || jsonb_build_object(
            'pageCount', file_record.pdf_page_count,
            'author', file_record.pdf_author,
            'title', file_record.pdf_title,
            'subject', file_record.pdf_subject,
            'encrypted', file_record.pdf_encrypted
        );
    END IF;
    
    -- EPUB-specific metadata
    IF file_record.file_type = 'epub' THEN
        metadata := metadata || jsonb_build_object(
            'author', file_record.epub_author,
            'title', file_record.epub_title,
            'publisher', file_record.epub_publisher,
            'language', file_record.epub_language,
            'isbn', file_record.epub_isbn,
            'chapterCount', file_record.epub_chapter_count,
            'hasImages', file_record.epub_has_images,
            'hasToc', file_record.epub_has_toc,
            'subjects', file_record.epub_subjects
        );
    END IF;
    
    RETURN metadata;
END;
$$ LANGUAGE plpgsql;

-- View for file cards with complete metadata (recreate with proper column names)
DROP VIEW IF EXISTS file_cards_view;
CREATE VIEW file_cards_view AS
SELECT 
    c.*,
    f.file_name,
    f.file_type,
    f.file_size,
    f.file_path,
    f.processing_status,
    get_file_display_title(f.*) as display_title,
    get_file_metadata_summary(f.*) as file_metadata,
    f.content_preview,
    f.cover_image_path,
    -- PDF fields
    f.pdf_page_count,
    f.pdf_author,
    f.pdf_title,
    -- EPUB fields  
    f.epub_author,
    f.epub_title,
    f.epub_publisher,
    f.epub_chapter_count,
    f.epub_description,
    f.epub_has_images,
    f.epub_has_toc
FROM cards c
JOIN files f ON c.file_id = f.id
WHERE c.is_file_card = true;

-- Update storage calculation function to include file sizes
CREATE OR REPLACE FUNCTION update_brain_storage_usage(brain_uuid UUID)
RETURNS VOID AS $$
DECLARE
    total_size BIGINT;
BEGIN
    -- Calculate total storage from cards and files
    SELECT COALESCE(
        (SELECT SUM(COALESCE(file_size, 0)) FROM cards WHERE brain_id = brain_uuid) +
        (SELECT SUM(file_size) FROM files WHERE brain_id = brain_uuid),
        0
    ) INTO total_size;
    
    UPDATE brains 
    SET storage_used = total_size,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = brain_uuid;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON COLUMN files.content_preview IS 'First 500 characters of extracted text for quick display';
COMMENT ON COLUMN files.cover_image_path IS 'Path to extracted EPUB cover image file';
COMMENT ON VIEW file_cards_view IS 'Complete view of file cards with all metadata for efficient querying';
COMMENT ON FUNCTION get_file_display_title(files) IS 'Returns appropriate display title based on extracted metadata or filename';
COMMENT ON FUNCTION get_file_metadata_summary(files) IS 'Returns JSONB summary of file metadata for API responses';

-- Print completion message
SELECT 'File Cards migration completed successfully!' AS status;