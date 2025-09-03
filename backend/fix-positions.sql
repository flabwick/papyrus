-- Fix any existing position inconsistencies in stream_cards table
-- This will normalize all positions to start from 0 and be sequential

-- Fix positions for each stream separately
WITH fixed_positions AS (
  SELECT 
    id,
    stream_id,
    card_id,
    ROW_NUMBER() OVER (PARTITION BY stream_id ORDER BY 
      CASE WHEN position >= 0 THEN position ELSE 9999 END,
      added_at
    ) - 1 as new_position
  FROM stream_cards
)
UPDATE stream_cards 
SET position = fixed_positions.new_position
FROM fixed_positions
WHERE stream_cards.id = fixed_positions.id
  AND stream_cards.position != fixed_positions.new_position;

-- Show results
SELECT 
  stream_id,
  COUNT(*) as card_count,
  MIN(position) as min_position,
  MAX(position) as max_position
FROM stream_cards 
GROUP BY stream_id 
ORDER BY stream_id;