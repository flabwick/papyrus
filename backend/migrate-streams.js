require('dotenv').config();
const { Client } = require('pg');

async function runStreamMigration() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    console.log('🔗 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully');

    // Check if stream_cards table already exists
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'stream_cards'
    `);

    if (tableCheck.rows.length > 0) {
      console.log('ℹ️  stream_cards table already exists, skipping creation');
    } else {
      console.log('🔧 Creating stream_cards table...');
      
      // Create stream_cards table
      await client.query(`
        CREATE TABLE stream_cards (
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
      `);
      console.log('✅ Created stream_cards table');
    }

    // Check and create indexes
    const indexes = [
      { name: 'idx_stream_cards_stream_id', sql: 'CREATE INDEX IF NOT EXISTS idx_stream_cards_stream_id ON stream_cards(stream_id);' },
      { name: 'idx_stream_cards_card_id', sql: 'CREATE INDEX IF NOT EXISTS idx_stream_cards_card_id ON stream_cards(card_id);' },
      { name: 'idx_stream_cards_position', sql: 'CREATE INDEX IF NOT EXISTS idx_stream_cards_position ON stream_cards(stream_id, position);' },
      { name: 'idx_stream_cards_ai_context', sql: 'CREATE INDEX IF NOT EXISTS idx_stream_cards_ai_context ON stream_cards(stream_id, is_in_ai_context);' },
      { name: 'idx_stream_cards_depth', sql: 'CREATE INDEX IF NOT EXISTS idx_stream_cards_depth ON stream_cards(stream_id, depth);' }
    ];

    console.log('🔧 Creating indexes...');
    for (const index of indexes) {
      await client.query(index.sql);
      console.log(`✅ Created index: ${index.name}`);
    }

    // Remove deprecated card_ids column from streams table if it exists
    try {
      await client.query(`
        DO $$ 
        BEGIN 
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'streams' AND column_name = 'card_ids'
          ) THEN
            ALTER TABLE streams DROP COLUMN card_ids;
          END IF;
        END $$;
      `);
      console.log('✅ Removed deprecated card_ids column from streams (if it existed)');
    } catch (e) {
      console.log('ℹ️  card_ids column handling completed');
    }
    
    console.log('🎉 Stream migration completed successfully!');
    
    // Verify the new structure
    const streamTablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%stream%'
      ORDER BY table_name
    `);
    
    console.log('📊 Stream-related tables:');
    streamTablesResult.rows.forEach(row => {
      console.log('  ✓', row.table_name);
    });

    // Check columns in stream_cards
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'stream_cards'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 stream_cards table columns:');
    columnsResult.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name} (${row.data_type})`);
    });

  } catch (error) {
    console.error('❌ Stream migration failed:', error.message);
    console.error('Error code:', error.code);
    
    if (error.code === '42501') {
      console.error('💡 Permission denied - the database user may need additional privileges');
    } else if (error.code === '42P07') {
      console.error('💡 Table already exists - this is usually safe to ignore');
    }
    
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

runStreamMigration();