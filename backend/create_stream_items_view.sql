-- Create stream_items_view to combine cards and files in streams
-- This view provides a unified interface to see both cards and files in their stream positions

CREATE OR REPLACE VIEW stream_items_view AS
SELECT 
    'card' as item_type,
    sc.stream_id,
    sc.position,
    sc.depth,
    sc.is_collapsed,
    sc.added_at,
    sc.card_id,
    NULL::uuid as file_id
FROM stream_cards sc
WHERE sc.card_id IS NOT NULL

UNION ALL

SELECT 
    'file' as item_type,
    sf.stream_id,
    sf.position,
    sf.depth,
    sf.is_collapsed,
    sf.added_at,
    NULL::uuid as card_id,
    sf.file_id
FROM stream_files sf
WHERE sf.file_id IS NOT NULL

ORDER BY stream_id, position;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stream_items_view_stream_id ON stream_cards(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_items_view_position ON stream_cards(position);
CREATE INDEX IF NOT EXISTS idx_stream_files_stream_id ON stream_files(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_files_position ON stream_files(position);

-- Grant permissions
GRANT SELECT ON stream_items_view TO papyrus_user;