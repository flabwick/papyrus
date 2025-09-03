require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function runMigration() {
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

    // Check if we already have tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('users', 'brains', 'cards')
    `);

    if (result.rows.length > 0) {
      console.log('📝 Database already has tables:', result.rows.map(r => r.table_name));
      console.log('⚠️  Skipping migration to avoid conflicts');
      return;
    }

    // Read and execute schema
    console.log('📖 Reading schema file...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('🚀 Executing schema...');
    await client.query(schema);
    
    console.log('✅ Database migration completed successfully!');
    
    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('📊 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log('  ✓', row.table_name);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Error code:', error.code);
    
    if (error.code === '42501') {
      console.error('💡 Permission denied - the database user may need additional privileges');
      console.error('💡 Try connecting as a superuser or granting CREATE privileges');
    }
    
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

runMigration();