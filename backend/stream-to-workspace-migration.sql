-- Migration script to rename all Stream references to Workspace
-- This migration renames tables, columns, views, indexes, and constraints

BEGIN;

-- Drop the existing stream_items_view first (we'll recreate it later)
DROP VIEW IF EXISTS stream_items_view;

-- Rename tables
ALTER TABLE streams RENAME TO workspaces;
ALTER TABLE stream_cards RENAME TO workspace_cards;
ALTER TABLE stream_files RENAME TO workspace_files;

-- Update column names in workspaces table (no changes needed as it was just "streams")

-- Update column names in workspace_cards table
ALTER TABLE workspace_cards RENAME COLUMN stream_id TO workspace_id;

-- Update column names in workspace_files table  
ALTER TABLE workspace_files RENAME COLUMN stream_id TO workspace_id;

-- Update any foreign key constraint names
-- First check if constraints exist with these names
DO $$ 
BEGIN
    -- Rename foreign key constraints if they exist
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'stream_cards_stream_id_fkey' 
               AND table_name = 'workspace_cards') THEN
        ALTER TABLE workspace_cards RENAME CONSTRAINT stream_cards_stream_id_fkey TO workspace_cards_workspace_id_fkey;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'stream_files_stream_id_fkey' 
               AND table_name = 'workspace_files') THEN
        ALTER TABLE workspace_files RENAME CONSTRAINT stream_files_stream_id_fkey TO workspace_files_workspace_id_fkey;
    END IF;
    
    -- Rename unique constraints if they exist
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'stream_cards_stream_card_unique' 
               AND table_name = 'workspace_cards') THEN
        ALTER TABLE workspace_cards RENAME CONSTRAINT stream_cards_stream_card_unique TO workspace_cards_workspace_card_unique;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'stream_files_stream_file_unique' 
               AND table_name = 'workspace_files') THEN
        ALTER TABLE workspace_files RENAME CONSTRAINT stream_files_stream_file_unique TO workspace_files_workspace_file_unique;
    END IF;
END
$$;

-- Drop and recreate indexes with new names
-- Workspace cards indexes
DROP INDEX IF EXISTS idx_stream_cards_stream_id;
DROP INDEX IF EXISTS idx_stream_cards_card_id;
DROP INDEX IF EXISTS idx_stream_cards_position;
CREATE INDEX IF NOT EXISTS idx_workspace_cards_workspace_id ON workspace_cards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_cards_card_id ON workspace_cards(card_id);
CREATE INDEX IF NOT EXISTS idx_workspace_cards_position ON workspace_cards(position);

-- Workspace files indexes
DROP INDEX IF EXISTS idx_stream_files_stream_id;
DROP INDEX IF EXISTS idx_stream_files_file_id;
DROP INDEX IF EXISTS idx_stream_files_position;
CREATE INDEX IF NOT EXISTS idx_workspace_files_workspace_id ON workspace_files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_files_file_id ON workspace_files(file_id);
CREATE INDEX IF NOT EXISTS idx_workspace_files_position ON workspace_files(position);

-- Recreate the view with new table names (workspace_items_view)
CREATE OR REPLACE VIEW workspace_items_view AS
SELECT 
    'card' as item_type,
    wc.workspace_id,
    wc.position,
    wc.depth,
    wc.is_collapsed,
    wc.added_at,
    wc.card_id,
    NULL::uuid as file_id
FROM workspace_cards wc
WHERE wc.card_id IS NOT NULL

UNION ALL

SELECT 
    'file' as item_type,
    wf.workspace_id,
    wf.position,
    wf.depth,
    wf.is_collapsed,
    wf.added_at,
    NULL::uuid as card_id,
    wf.file_id
FROM workspace_files wf
WHERE wf.file_id IS NOT NULL

ORDER BY workspace_id, position;

-- Grant permissions on the new view
GRANT SELECT ON workspace_items_view TO papyrus_user;

-- Update any stored procedures or triggers that reference the old table names
-- (Add specific updates here if there are any procedures/triggers)

-- Update any columns in other tables that reference stream_id
-- Check if cards table has stream_specific_id column and rename it
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'cards' 
               AND column_name = 'stream_specific_id') THEN
        ALTER TABLE cards RENAME COLUMN stream_specific_id TO workspace_specific_id;
    END IF;
END
$$;

COMMIT;

-- Display summary of changes
SELECT 'Migration completed. Renamed tables:' AS status
UNION ALL
SELECT '- streams → workspaces'
UNION ALL  
SELECT '- stream_cards → workspace_cards'
UNION ALL
SELECT '- stream_files → workspace_files'
UNION ALL
SELECT '- stream_items_view → workspace_items_view'
UNION ALL
SELECT 'Updated all column references from stream_id to workspace_id';