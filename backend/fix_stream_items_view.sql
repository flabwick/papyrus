-- Fix the stream_items_view to properly return data
-- First, let's check what the current view looks like
SELECT 'CURRENT_VIEW_DEFINITION' as info;
\d+ stream_items_view

-- Check what columns exist in stream_cards table
SELECT 'STREAM_CARDS_COLUMNS' as info;
\d stream_cards

-- Drop and recreate the view with correct column references
DROP VIEW IF EXISTS stream_items_view;

CREATE OR REPLACE VIEW stream_items_view AS
SELECT 
    sc.stream_id,
    sc.position,
    sc.depth,
    sc.is_collapsed,
    sc.added_at,
    'card' as item_type,
    sc.id as item_id,
    NULL::UUID as file_id,
    sc.card_id as card_id
FROM stream_cards sc
UNION ALL
SELECT 
    sf.stream_id,
    sf.position,
    sf.depth,
    sf.is_collapsed,
    sf.added_at,
    'file' as item_type,
    sf.id as item_id,
    sf.file_id,
    NULL::UUID as card_id
FROM stream_files sf
ORDER BY stream_id, position;

-- Test the view with a specific stream
SELECT 'TESTING_VIEW' as info;
SELECT * FROM stream_items_view WHERE stream_id = 'ac1def99-62e5-4ea3-9989-52f9a1e33306';

-- Test with all streams
SELECT 'ALL_STREAM_ITEMS' as info;
SELECT stream_id, item_type, position, card_id, file_id FROM stream_items_view ORDER BY stream_id, position;
