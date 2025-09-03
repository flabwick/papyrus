
-- Stream Management System Database Migration
-- Run this as a database administrator

-- Create stream_cards table
CREATE TABLE IF NOT EXISTS stream_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    depth INTEGER DEFAULT 0,
    is_in_ai_context BOOLEAN DEFAULT false,
    is_collapsed BOOLEAN DEFAULT false,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stream_id, card_id),
    UNIQUE(stream_id, position)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stream_cards_stream_id ON stream_cards(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_cards_card_id ON stream_cards(card_id);
CREATE INDEX IF NOT EXISTS idx_stream_cards_position ON stream_cards(stream_id, position);
CREATE INDEX IF NOT EXISTS idx_stream_cards_ai_context ON stream_cards(stream_id, is_in_ai_context);
CREATE INDEX IF NOT EXISTS idx_stream_cards_depth ON stream_cards(stream_id, depth);

-- Grant permissions to brain6_user
GRANT ALL PRIVILEGES ON TABLE stream_cards TO brain6_user;
GRANT USAGE, SELECT ON SEQUENCE stream_cards_id_seq TO brain6_user;

-- Remove deprecated column if it exists
DO $$ 
BEGIN 
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'streams' AND column_name = 'card_ids'
  ) THEN
    ALTER TABLE streams DROP COLUMN card_ids;
  END IF;
END $$;

SELECT 'Stream migration SQL generated successfully' as status;
