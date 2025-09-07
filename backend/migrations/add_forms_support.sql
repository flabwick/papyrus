-- Migration: Add Forms Support to Papyrus
-- This adds forms as a third card type alongside pages and files

-- Create forms table
CREATE TABLE IF NOT EXISTS forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled Form',
    content TEXT DEFAULT '',
    form_data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create workspace_forms junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS workspace_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    depth INTEGER DEFAULT 0,
    is_in_ai_context BOOLEAN DEFAULT false,
    is_collapsed BOOLEAN DEFAULT false,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique form per workspace
    UNIQUE(workspace_id, form_id),
    -- Ensure unique position per workspace (across all card types)
    CONSTRAINT unique_workspace_form_position UNIQUE(workspace_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_forms_library_id ON forms(library_id);
CREATE INDEX IF NOT EXISTS idx_forms_active ON forms(is_active);
CREATE INDEX IF NOT EXISTS idx_forms_created_at ON forms(created_at);

CREATE INDEX IF NOT EXISTS idx_workspace_forms_workspace_id ON workspace_forms(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_forms_form_id ON workspace_forms(form_id);
CREATE INDEX IF NOT EXISTS idx_workspace_forms_position ON workspace_forms(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_workspace_forms_ai_context ON workspace_forms(workspace_id, is_in_ai_context);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_forms_updated_at
    BEFORE UPDATE ON forms
    FOR EACH ROW
    EXECUTE FUNCTION update_forms_updated_at();

-- Update the checkTables function to include forms tables
COMMENT ON TABLE forms IS 'Forms that can be added to workspaces as cards';
COMMENT ON TABLE workspace_forms IS 'Junction table linking forms to workspaces with positioning';
