const { Pool } = require('pg');
require('dotenv').config();

async function fixPositions() {
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  try {
    console.log('🔧 Starting position normalization...');
    
    // Fix positions for each stream separately
    const result = await pool.query(`
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
        AND stream_cards.position != fixed_positions.new_position
      RETURNING stream_cards.stream_id, stream_cards.card_id, stream_cards.position
    `);

    console.log(`✅ Fixed ${result.rowCount} position conflicts`);
    
    // Show current state
    const stats = await pool.query(`
      SELECT 
        stream_id,
        COUNT(*) as card_count,
        MIN(position) as min_position,
        MAX(position) as max_position,
        COUNT(DISTINCT position) as unique_positions
      FROM stream_cards 
      GROUP BY stream_id 
      ORDER BY stream_id
    `);
    
    console.log('\n📊 Current stream position stats:');
    stats.rows.forEach(row => {
      const hasGaps = row.unique_positions != row.card_count;
      const gapWarning = hasGaps ? ' ⚠️  (has gaps!)' : ' ✅';
      console.log(`Stream ${row.stream_id.substring(0,8)}: ${row.card_count} cards, positions ${row.min_position}-${row.max_position}${gapWarning}`);
    });

  } catch (error) {
    console.error('❌ Error fixing positions:', error);
  } finally {
    await pool.end();
  }
}

fixPositions();