-- File Cards Module - Database Schema Extensions
-- Migration to add comprehensive file support for PDF and EPUB file cards

-- Files table - stores file metadata and processing information
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(10) NOT NULL CHECK (file_type IN ('pdf', 'epub', 'txt', 'md', 'other')),
    file_size BIGINT NOT NULL,
    file_path VARCHAR(700) NOT NULL, -- actual file system path
    file_hash VARCHAR(64), -- SHA-256 hash for sync detection
    upload_method VARCHAR(20) DEFAULT 'web_upload' CHECK (upload_method IN ('web_upload', 'ssh_import', 'ide_upload')),
    
    -- PDF-specific metadata (nullable for non-PDF files)
    pdf_page_count INTEGER,
    pdf_title VARCHAR(500),
    pdf_author VARCHAR(255),
    pdf_subject VARCHAR(500),
    pdf_creator VARCHAR(255),
    pdf_producer VARCHAR(255),
    pdf_version VARCHAR(10),
    pdf_encrypted BOOLEAN DEFAULT false,
    
    -- EPUB-specific metadata (nullable for non-EPUB files)
    epub_title VARCHAR(500),
    epub_author VARCHAR(255),
    epub_publisher VARCHAR(255),
    epub_language VARCHAR(20),
    epub_isbn VARCHAR(50),
    epub_publication_date DATE,
    epub_description TEXT,
    epub_chapter_count INTEGER,
    epub_has_images BOOLEAN DEFAULT false,
    epub_has_toc BOOLEAN DEFAULT false,
    epub_subjects JSONB,
    
    -- Common file metadata
    content_preview TEXT, -- first 500 characters for quick display
    word_count INTEGER DEFAULT 0,
    text_length INTEGER DEFAULT 0,
    processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'complete', 'error')),
    processing_error TEXT,
    cover_image_path VARCHAR(700), -- for EPUB covers
    
    -- Timestamps
    file_created_at TIMESTAMP WITH TIME ZONE,
    file_modified_at TIMESTAMP WITH TIME ZONE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(brain_id, file_path), -- prevent duplicate file paths per brain
    CHECK (file_size > 0)
);

-- Add foreign key constraint to existing cards table file_id column
-- (assuming it exists based on schema.sql line 49)
ALTER TABLE cards ADD CONSTRAINT fk_cards_file_id 
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;

-- Add new columns to cards table for file card support
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_file_card BOOLEAN DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS file_viewer_expanded BOOLEAN DEFAULT false; -- track expand state per card

-- Indexes for files table
CREATE INDEX idx_files_brain_id ON files(brain_id);
CREATE INDEX idx_files_type ON files(file_type);
CREATE INDEX idx_files_path ON files(file_path);
CREATE INDEX idx_files_hash ON files(file_hash);
CREATE INDEX idx_files_status ON files(processing_status);
CREATE INDEX idx_files_name ON files(brain_id, file_name);
CREATE INDEX idx_files_uploaded ON files(uploaded_at);

-- Indexes for PDF metadata (for search and filtering)
CREATE INDEX idx_files_pdf_author ON files(pdf_author) WHERE file_type = 'pdf';
CREATE INDEX idx_files_pdf_pages ON files(pdf_page_count) WHERE file_type = 'pdf';

-- Indexes for EPUB metadata (for search and filtering)  
CREATE INDEX idx_files_epub_author ON files(epub_author) WHERE file_type = 'epub';
CREATE INDEX idx_files_epub_publisher ON files(epub_publisher) WHERE file_type = 'epub';
CREATE INDEX idx_files_epub_language ON files(epub_language) WHERE file_type = 'epub';

-- Index for file cards in cards table
CREATE INDEX idx_cards_file_card ON cards(is_file_card) WHERE is_file_card = true;

-- Update timestamp trigger for files table
CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- File processing helper functions
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

-- Function to get file metadata summary
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

-- View for file cards with complete metadata
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

-- Storage calculation update for brains (include file sizes)
CREATE OR REPLACE FUNCTION update_brain_storage_usage(brain_uuid UUID)
RETURNS VOID AS $$
DECLARE
    total_size BIGINT;
BEGIN
    -- Calculate total storage from cards and files
    SELECT COALESCE(
        (SELECT SUM(file_size) FROM cards WHERE brain_id = brain_uuid AND file_size > 0) +
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
COMMENT ON TABLE files IS 'Stores comprehensive metadata for PDF and EPUB files uploaded to brains';
COMMENT ON COLUMN files.content_preview IS 'First 500 characters of extracted text for quick display';
COMMENT ON COLUMN files.processing_status IS 'Status of file processing: pending, processing, complete, error';
COMMENT ON COLUMN files.cover_image_path IS 'Path to extracted EPUB cover image file';
COMMENT ON VIEW file_cards_view IS 'Complete view of file cards with all metadata for efficient querying';
COMMENT ON FUNCTION get_file_display_title(files) IS 'Returns appropriate display title based on extracted metadata or filename';
COMMENT ON FUNCTION get_file_metadata_summary(files) IS 'Returns JSONB summary of file metadata for API responses';