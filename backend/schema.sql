-- Clarity Phase 1 Database Schema
-- File system as source of truth, database stores metadata and relationships

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

-- Brains table - knowledge bases containing cards
CREATE TABLE brains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    folder_path VARCHAR(600) NOT NULL, -- e.g., 'backend/storage/username/brains/brain-name'
    last_scanned_at TIMESTAMP WITH TIME ZONE,
    storage_used BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name) -- brain names must be unique per user
);

-- Cards table - individual pieces of content
CREATE TABLE cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
    title VARCHAR(200),
    file_path VARCHAR(700), -- path to actual file in file system (nullable for manual cards)
    file_hash VARCHAR(64), -- SHA-256 hash for sync detection
    content_preview TEXT, -- first 500 chars for quick access
    file_size BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT true, -- false when file deleted (soft delete)
    last_modified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Card Type System fields
    card_type VARCHAR(20) DEFAULT 'saved' CHECK (card_type IN ('saved', 'file', 'unsaved')),
    is_brain_wide BOOLEAN DEFAULT true,
    stream_specific_id UUID REFERENCES streams(id),
    file_id UUID, -- reference to files table when available
    -- Title uniqueness only applies to saved cards with titles
    CONSTRAINT unique_brain_title UNIQUE (brain_id, title) DEFERRABLE INITIALLY DEFERRED
);

-- Card Links table - comprehensive [[card-title]] tracking
CREATE TABLE card_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    target_card_id UUID REFERENCES cards(id) ON DELETE CASCADE, -- nullable for broken links
    link_text VARCHAR(300) NOT NULL, -- exact text inside [[]]
    position_in_source INTEGER NOT NULL, -- character position in source content
    link_instance INTEGER NOT NULL DEFAULT 1, -- for multiple links to same card (1st, 2nd, etc)
    is_valid BOOLEAN DEFAULT false, -- true when target_card_id exists
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Streams table - temporary views of selected cards
CREATE TABLE streams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_favorited BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(brain_id, name) -- stream names must be unique per brain
);

-- Stream Cards table - many-to-many relationship between streams and cards
CREATE TABLE stream_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0, -- display order within stream
    depth INTEGER DEFAULT 0, -- nesting depth (0=top level, 1=nested, etc.)
    is_in_ai_context BOOLEAN DEFAULT false, -- per-stream AI context selection
    is_collapsed BOOLEAN DEFAULT false, -- per-stream collapsed state
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stream_id, card_id), -- card can only appear once per stream
    UNIQUE(stream_id, position) -- positions must be unique within stream
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
CREATE INDEX idx_brains_user_id ON brains(user_id);
CREATE INDEX idx_brains_folder_path ON brains(folder_path);

CREATE INDEX idx_cards_brain_id ON cards(brain_id);
CREATE INDEX idx_cards_title ON cards(brain_id, title);
CREATE INDEX idx_cards_file_path ON cards(file_path);
CREATE INDEX idx_cards_file_hash ON cards(file_hash);
CREATE INDEX idx_cards_active ON cards(is_active);
-- Card Type System indexes
CREATE INDEX idx_cards_type ON cards(card_type);
CREATE INDEX idx_cards_brain_wide ON cards(is_brain_wide);
CREATE INDEX idx_cards_stream_specific ON cards(stream_specific_id);
CREATE INDEX idx_cards_type_brain ON cards(brain_id, card_type);

CREATE INDEX idx_card_links_source ON card_links(source_card_id);
CREATE INDEX idx_card_links_target ON card_links(target_card_id);
CREATE INDEX idx_card_links_text ON card_links(link_text);
CREATE INDEX idx_card_links_position ON card_links(source_card_id, position_in_source);
CREATE INDEX idx_card_links_valid ON card_links(is_valid);

CREATE INDEX idx_streams_brain_id ON streams(brain_id);
CREATE INDEX idx_streams_favorited ON streams(is_favorited);
CREATE INDEX idx_streams_last_accessed ON streams(last_accessed_at);

CREATE INDEX idx_stream_cards_stream_id ON stream_cards(stream_id);
CREATE INDEX idx_stream_cards_card_id ON stream_cards(card_id);
CREATE INDEX idx_stream_cards_position ON stream_cards(stream_id, position);
CREATE INDEX idx_stream_cards_ai_context ON stream_cards(stream_id, is_in_ai_context);
CREATE INDEX idx_stream_cards_depth ON stream_cards(stream_id, depth);

CREATE INDEX idx_cli_sessions_token ON cli_sessions(token);
CREATE INDEX idx_cli_sessions_user_id ON cli_sessions(user_id);
CREATE INDEX idx_cli_sessions_expires ON cli_sessions(expires_at);

CREATE INDEX idx_web_sessions_expire ON web_sessions(expire);

-- Update timestamp trigger function with card type conversion logic
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
        
        -- Brain-wide cards should not have stream restrictions
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

-- Apply update timestamp triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brains_updated_at BEFORE UPDATE ON brains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_card_links_updated_at BEFORE UPDATE ON card_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();