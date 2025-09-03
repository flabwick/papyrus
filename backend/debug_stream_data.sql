-- Debug script to check stream data
-- Check what's in the streams table
SELECT 'STREAMS' as table_name, id, name, card_count FROM streams WHERE brain_id = '618b3d14-cdff-4555-88f3-589502a3b1f3';

-- Check what's in the stream_cards table
SELECT 'STREAM_CARDS' as table_name, stream_id, card_id, position FROM stream_cards WHERE stream_id IN (
    SELECT id FROM streams WHERE brain_id = '618b3d14-cdff-4555-88f3-589502a3b1f3'
);

-- Check what's in the cards table for this brain
SELECT 'CARDS' as table_name, id, title, card_type FROM cards WHERE brain_id = '618b3d14-cdff-4555-88f3-589502a3b1f3' LIMIT 10;

-- Check the stream_items_view for a specific stream
SELECT 'STREAM_ITEMS_VIEW' as table_name, * FROM stream_items_view WHERE stream_id = 'ac1def99-62e5-4ea3-9989-52f9a1e33306';

-- Check if the view exists
SELECT 'VIEW_EXISTS' as check_name, COUNT(*) as count FROM information_schema.views WHERE table_name = 'stream_items_view';
