-- PAPYRUS COMPLETE DATABASE SCHEMA
-- Creates the complete Papyrus system with proper terminology from scratch
-- Run this on a fresh 'papyrus' database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table - admin-only user management
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL CHECK (username ~ '^[a-zA-Z0-9-]+$' AND LENGTH(username) BETWEEN 3 AND 20),
    password_hash VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL, -- e.g., 'backend/storage/username'
    storage_quota BIGINT DEFAULT 1073741824, -- 1GB default in bytes
    storage_used BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Libraries table - knowledge bases containing pages
CREATE TABLE libraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    folder_path VARCHAR(600) NOT NULL, -- e.g., 'backend/storage/username/libraries/library-name'
    last_scanned_at TIMESTAMP WITH TIME ZONE,
    storage_used BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name) -- library names must be unique per user
);

-- Pages table - individual pieces of content (renamed from cards)
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    title VARCHAR(200),
    file_path VARCHAR(700), -- path to actual file in file system (nullable for manual pages)
    file_hash VARCHAR(64), -- SHA-256 hash for sync detection
    content_preview TEXT, -- first 500 chars for quick access
    file_size BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT true, -- false when file deleted (soft delete)
    last_modified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Page Type System fields
    page_type VARCHAR(20) DEFAULT 'saved' CHECK (page_type IN ('saved', 'file', 'unsaved')),
    is_library_wide BOOLEAN DEFAULT true,
    workspace_specific_id UUID, -- will reference workspaces(id)
    -- Title uniqueness only applies to saved pages with titles
    CONSTRAINT unique_library_title UNIQUE (library_id, title) DEFERRABLE INITIALLY DEFERRED
);

-- Files table - uploaded documents with comprehensive metadata
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    file_path VARCHAR(700) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT DEFAULT 0,
    file_hash VARCHAR(64),
    mime_type VARCHAR(100),
    file_type VARCHAR(20),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processing_status VARCHAR(50) DEFAULT 'pending',
    
    -- PDF-specific metadata columns
    pdf_page_count INTEGER,
    pdf_title VARCHAR(500),
    pdf_author VARCHAR(255),
    pdf_subject VARCHAR(500),
    pdf_creator VARCHAR(255),
    pdf_producer VARCHAR(255),
    pdf_version VARCHAR(10),
    pdf_encrypted BOOLEAN DEFAULT false,
    
    -- EPUB-specific metadata columns
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
    
    -- Common file metadata columns
    content_preview TEXT,
    word_count INTEGER DEFAULT 0,
    text_length INTEGER DEFAULT 0,
    cover_image_path VARCHAR(700),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Page Links table - comprehensive [[page-title]] tracking (renamed from card_links)
CREATE TABLE page_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    target_page_id UUID REFERENCES pages(id) ON DELETE CASCADE, -- nullable for broken links
    link_text VARCHAR(300) NOT NULL, -- exact text inside [[]]
    position_in_source INTEGER NOT NULL, -- character position in source content
    link_instance INTEGER NOT NULL DEFAULT 1, -- for multiple links to same page (1st, 2nd, etc)
    is_valid BOOLEAN DEFAULT false, -- true when target_page_id exists
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces table - temporary views of selected pages and files (renamed from streams)
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_favorited BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(library_id, name) -- workspace names must be unique per library
);

-- Add foreign key constraint for workspace_specific_id after workspaces table is created
ALTER TABLE pages ADD CONSTRAINT fk_pages_workspace_specific 
    FOREIGN KEY (workspace_specific_id) REFERENCES workspaces(id);

-- Workspace Pages table - many-to-many relationship between workspaces and pages
CREATE TABLE workspace_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0, -- display order within workspace
    depth INTEGER DEFAULT 0, -- nesting depth (0=top level, 1=nested, etc.)
    is_in_ai_context BOOLEAN DEFAULT false, -- per-workspace AI context selection
    is_collapsed BOOLEAN DEFAULT false, -- per-workspace collapsed state
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, page_id), -- page can only appear once per workspace
    UNIQUE(workspace_id, position) -- positions must be unique within workspace
);

-- Workspace Files table - many-to-many relationship between workspaces and files
CREATE TABLE workspace_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    depth INTEGER DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT false,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique position per workspace
    CONSTRAINT unique_workspace_file_position UNIQUE (workspace_id, position),
    
    -- Ensure file can't be added to same workspace twice
    CONSTRAINT unique_workspace_file UNIQUE (workspace_id, file_id)
);

-- CLI Sessions table - authentication tokens for CLI access
CREATE TABLE cli_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(128) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Web Sessions table - for express-session store
CREATE TABLE web_sessions (
    sid VARCHAR(128) PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create unified view for workspace items (pages and files together)
CREATE OR REPLACE VIEW workspace_items_view AS
SELECT 
    workspace_id,
    position,
    depth,
    is_collapsed,
    added_at,
    'page' as item_type,
    id as item_id,
    NULL::UUID as file_id,
    page_id
FROM workspace_pages
UNION ALL
SELECT 
    workspace_id,
    position,
    depth,
    is_collapsed,
    added_at,
    'file' as item_type,
    id as item_id,
    file_id,
    NULL::UUID as page_id
FROM workspace_files
ORDER BY workspace_id, position;

-- Indexes for performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_libraries_user_id ON libraries(user_id);
CREATE INDEX idx_libraries_folder_path ON libraries(folder_path);

CREATE INDEX idx_pages_library_id ON pages(library_id);
CREATE INDEX idx_pages_title ON pages(library_id, title);
CREATE INDEX idx_pages_file_path ON pages(file_path);
CREATE INDEX idx_pages_file_hash ON pages(file_hash);
CREATE INDEX idx_pages_active ON pages(is_active);
CREATE INDEX idx_pages_type ON pages(page_type);
CREATE INDEX idx_pages_library_wide ON pages(is_library_wide);
CREATE INDEX idx_pages_workspace_specific ON pages(workspace_specific_id);
CREATE INDEX idx_pages_type_library ON pages(library_id, page_type);

CREATE INDEX idx_files_library_id ON files(library_id);
CREATE INDEX idx_files_path ON files(file_path);
CREATE INDEX idx_files_hash ON files(file_hash);
CREATE INDEX idx_files_type ON files(file_type);
CREATE INDEX idx_files_pdf_author ON files(pdf_author) WHERE file_type = 'pdf';
CREATE INDEX idx_files_pdf_pages ON files(pdf_page_count) WHERE file_type = 'pdf';
CREATE INDEX idx_files_epub_author ON files(epub_author) WHERE file_type = 'epub';
CREATE INDEX idx_files_epub_publisher ON files(epub_publisher) WHERE file_type = 'epub';
CREATE INDEX idx_files_epub_language ON files(epub_language) WHERE file_type = 'epub';

CREATE INDEX idx_page_links_source ON page_links(source_page_id);
CREATE INDEX idx_page_links_target ON page_links(target_page_id);
CREATE INDEX idx_page_links_text ON page_links(link_text);
CREATE INDEX idx_page_links_position ON page_links(source_page_id, position_in_source);
CREATE INDEX idx_page_links_valid ON page_links(is_valid);

CREATE INDEX idx_workspaces_library_id ON workspaces(library_id);
CREATE INDEX idx_workspaces_favorited ON workspaces(is_favorited);
CREATE INDEX idx_workspaces_last_accessed ON workspaces(last_accessed_at);

CREATE INDEX idx_workspace_pages_workspace_id ON workspace_pages(workspace_id);
CREATE INDEX idx_workspace_pages_page_id ON workspace_pages(page_id);
CREATE INDEX idx_workspace_pages_position ON workspace_pages(workspace_id, position);
CREATE INDEX idx_workspace_pages_ai_context ON workspace_pages(workspace_id, is_in_ai_context);
CREATE INDEX idx_workspace_pages_depth ON workspace_pages(workspace_id, depth);

CREATE INDEX idx_workspace_files_workspace_id ON workspace_files(workspace_id);
CREATE INDEX idx_workspace_files_file_id ON workspace_files(file_id);
CREATE INDEX idx_workspace_files_position ON workspace_files(workspace_id, position);

CREATE INDEX idx_cli_sessions_token ON cli_sessions(token);
CREATE INDEX idx_cli_sessions_user_id ON cli_sessions(user_id);
CREATE INDEX idx_cli_sessions_expires ON cli_sessions(expires_at);

CREATE INDEX idx_web_sessions_expire ON web_sessions(expire);

-- Helper functions for workspace management
CREATE OR REPLACE FUNCTION get_next_workspace_position(target_workspace_id UUID)
RETURNS INTEGER AS $$
DECLARE
    max_page_pos INTEGER;
    max_file_pos INTEGER;
    next_pos INTEGER;
BEGIN
    -- Get max position from workspace_pages
    SELECT COALESCE(MAX(position), -1) INTO max_page_pos
    FROM workspace_pages 
    WHERE workspace_id = target_workspace_id;
    
    -- Get max position from workspace_files
    SELECT COALESCE(MAX(position), -1) INTO max_file_pos
    FROM workspace_files 
    WHERE workspace_id = target_workspace_id;
    
    -- Return the next available position
    next_pos := GREATEST(max_page_pos, max_file_pos) + 1;
    
    RETURN next_pos;
END;
$$ LANGUAGE plpgsql;

-- Function to shift positions when inserting at specific position
CREATE OR REPLACE FUNCTION shift_workspace_positions(
    target_workspace_id UUID, 
    insert_position INTEGER,
    shift_amount INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    -- Shift pages
    UPDATE workspace_pages 
    SET position = position + shift_amount
    WHERE workspace_id = target_workspace_id AND position >= insert_position;
    
    -- Shift files
    UPDATE workspace_files
    SET position = position + shift_amount
    WHERE workspace_id = target_workspace_id AND position >= insert_position;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp trigger function with page type conversion logic
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
            NEW.is_library_wide = true;
            NEW.workspace_specific_id = NULL;
        END IF;
        
        -- Ensure consistency rules for workspace-specific pages
        IF NEW.page_type = 'unsaved' AND NEW.workspace_specific_id IS NULL THEN
            RAISE EXCEPTION 'Unsaved pages must have workspace_specific_id';
        END IF;
        
        -- Library-wide pages should not have workspace restrictions
        IF NEW.is_library_wide = true AND NEW.workspace_specific_id IS NOT NULL THEN
            NEW.workspace_specific_id = NULL;
        END IF;
        
        -- Only unsaved pages can have workspace restrictions
        IF NEW.page_type != 'unsaved' AND NEW.workspace_specific_id IS NOT NULL THEN
            NEW.workspace_specific_id = NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update timestamp triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_libraries_updated_at BEFORE UPDATE ON libraries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_page_links_updated_at BEFORE UPDATE ON page_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts with storage quotas and authentication';
COMMENT ON TABLE libraries IS 'Knowledge bases containing pages and files';
COMMENT ON TABLE pages IS 'Individual content pieces (manual or file-based)';
COMMENT ON TABLE files IS 'Uploaded documents with comprehensive metadata';
COMMENT ON TABLE workspaces IS 'Temporary collections of pages and files';
COMMENT ON TABLE workspace_pages IS 'Many-to-many relationship between workspaces and pages';
COMMENT ON TABLE workspace_files IS 'Many-to-many relationship between workspaces and files';
COMMENT ON VIEW workspace_items_view IS 'Unified view of all workspace items (pages and files)';

SELECT 'Papyrus database schema created successfully with proper terminology!' AS status;
