-- Card Type System Migration
-- Adds three-tier card type architecture to support Saved, File, and Unsaved cards
-- Date: August 2025

-- Add card type system columns to cards table
ALTER TABLE cards ADD COLUMN IF NOT EXISTS card_type VARCHAR(20) DEFAULT 'saved';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_brain_wide BOOLEAN DEFAULT true;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS stream_specific_id UUID REFERENCES streams(id);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS file_id UUID; -- Will reference files table when available

-- Add constraints and checks
ALTER TABLE cards ADD CONSTRAINT check_card_type 
    CHECK (card_type IN ('saved', 'file', 'unsaved'));

-- Ensure unsaved cards have stream association
ALTER TABLE cards ADD CONSTRAINT check_unsaved_stream
    CHECK (
        (card_type = 'unsaved' AND stream_specific_id IS NOT NULL) OR
        (card_type != 'unsaved')
    );

-- Ensure brain-wide cards don't have stream restrictions
ALTER TABLE cards ADD CONSTRAINT check_brain_wide_consistency
    CHECK (
        (is_brain_wide = true AND stream_specific_id IS NULL) OR
        (is_brain_wide = false)
    );

-- Update the unique constraint to handle titleless cards
DO $$
BEGIN
    -- Drop old constraint if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'cards_brain_id_title_key' 
        AND table_name = 'cards'
    ) THEN
        ALTER TABLE cards DROP CONSTRAINT cards_brain_id_title_key;
    END IF;
    
    -- Add new conditional unique constraint
    ALTER TABLE cards ADD CONSTRAINT unique_brain_title 
        UNIQUE (brain_id, title) DEFERRABLE INITIALLY DEFERRED;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(card_type);
CREATE INDEX IF NOT EXISTS idx_cards_brain_wide ON cards(is_brain_wide);
CREATE INDEX IF NOT EXISTS idx_cards_stream_specific ON cards(stream_specific_id);
CREATE INDEX IF NOT EXISTS idx_cards_type_brain ON cards(brain_id, card_type);

-- Update existing cards to 'saved' type (backward compatibility)
UPDATE cards SET 
    card_type = 'saved',
    is_brain_wide = true,
    stream_specific_id = NULL
WHERE card_type IS NULL OR card_type = 'saved';

-- Enhanced update trigger function that handles card type conversions
CREATE OR REPLACE FUNCTION update_card_timestamps_and_types()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Auto-convert unsaved to saved when title is added
    IF OLD.card_type = 'unsaved' AND NEW.title IS NOT NULL AND NEW.title != '' AND OLD.title IS NULL THEN
        NEW.card_type = 'saved';
        NEW.is_brain_wide = true;
        NEW.stream_specific_id = NULL;
    END IF;
    
    -- Ensure consistency rules
    IF NEW.card_type = 'unsaved' AND NEW.stream_specific_id IS NULL THEN
        RAISE EXCEPTION 'Unsaved cards must have stream_specific_id';
    END IF;
    
    IF NEW.is_brain_wide = true AND NEW.stream_specific_id IS NOT NULL THEN
        NEW.stream_specific_id = NULL;
    END IF;
    
    IF NEW.card_type != 'unsaved' AND NEW.stream_specific_id IS NOT NULL THEN
        NEW.stream_specific_id = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace the existing update trigger with our enhanced version
DROP TRIGGER IF EXISTS update_cards_updated_at ON cards;
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_card_timestamps_and_types();

-- Create view for easy querying of card types
CREATE OR REPLACE VIEW card_types_summary AS
SELECT 
    brain_id,
    card_type,
    COUNT(*) as count,
    SUM(file_size) as total_size,
    MAX(updated_at) as last_updated
FROM cards 
WHERE is_active = true
GROUP BY brain_id, card_type;

-- Grant permissions to brain6_user
GRANT ALL PRIVILEGES ON TABLE cards TO brain6_user;
GRANT SELECT ON card_types_summary TO brain6_user;

-- Migration validation queries
DO $$
DECLARE
    saved_count INTEGER;
    total_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM cards WHERE is_active = true;
    SELECT COUNT(*) INTO saved_count FROM cards WHERE card_type = 'saved' AND is_active = true;
    
    RAISE NOTICE 'Card Type Migration Summary:';
    RAISE NOTICE '- Total active cards: %', total_count;
    RAISE NOTICE '- Saved cards: %', saved_count;
    RAISE NOTICE '- All existing cards converted to saved type: %', 
        CASE WHEN saved_count = total_count THEN 'YES' ELSE 'NO' END;
END $$;

SELECT 'Card Type System migration completed successfully' as status;