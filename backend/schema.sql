-- Papyrus Database Schema
-- Modern schema matching current codebase expectations

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

-- Workspaces table - temporary views of selected pages
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_favorited BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(library_id, name) -- workspace names must be unique per library
);

-- Files table - file metadata and tracking
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    file_path VARCHAR(700) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64), -- SHA-256 hash for sync detection
    file_size BIGINT DEFAULT 0,
    mime_type VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_modified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Pages table - individual pieces of content
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    title VARCHAR(200),
    file_path VARCHAR(700), -- path to actual file in file system (nullable for manual pages)
    file_hash VARCHAR(64), -- SHA-256 hash for sync detection
    content_preview TEXT, -- first 500 chars for quick access
    file_size BIGINT DEFAULT 0,
    page_type VARCHAR(50) DEFAULT 'file', -- 'file', 'manual', 'unsaved', etc.
    is_library_wide BOOLEAN DEFAULT true, -- true for titled pages, false for workspace-specific
    workspace_specific_id UUID REFERENCES workspaces(id), -- for untitled workspace-specific pages
    is_active BOOLEAN DEFAULT true, -- false when file deleted (soft delete)
    last_modified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    file_id UUID REFERENCES files(id), -- reference to files table when available
    -- Title uniqueness only applies to pages with titles
    CONSTRAINT unique_library_title UNIQUE (library_id, title) DEFERRABLE INITIALLY DEFERRED
);

-- Page Links table - comprehensive [[page-title]] tracking
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

-- Workspace Files table - files associated with workspaces
CREATE TABLE workspace_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, file_id), -- file can only appear once per workspace
    UNIQUE(workspace_id, position) -- positions must be unique within workspace
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

-- Indexes for performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_libraries_user_id ON libraries(user_id);
CREATE INDEX idx_libraries_folder_path ON libraries(folder_path);

CREATE INDEX idx_files_library_id ON files(library_id);
CREATE INDEX idx_files_path ON files(file_path);
CREATE INDEX idx_files_hash ON files(file_hash);
CREATE INDEX idx_files_active ON files(is_active);

CREATE INDEX idx_pages_library_id ON pages(library_id);
CREATE INDEX idx_pages_title ON pages(library_id, title);
CREATE INDEX idx_pages_file_path ON pages(file_path);
CREATE INDEX idx_pages_file_hash ON pages(file_hash);
CREATE INDEX idx_pages_active ON pages(is_active);
CREATE INDEX idx_pages_file_id ON pages(file_id);

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

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update timestamp triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_libraries_updated_at BEFORE UPDATE ON libraries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_page_links_updated_at BEFORE UPDATE ON page_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
