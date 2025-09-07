require('dotenv').config();
const { Pool } = require('pg');

async function testConnection() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    try {
        console.log('Testing database connection...');
        const client = await pool.connect();
        
        // Test basic query
        const result = await client.query('SELECT NOW() as current_time');
        console.log('✅ Database connection successful!');
        console.log('Current time from database:', result.rows[0].current_time);
        
        // Test if tables exist
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        console.log('\n📋 Tables in database:');
        tablesResult.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });
        
        client.release();
        await pool.end();
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('\nTroubleshooting tips:');
        console.error('1. Make sure PostgreSQL is running: sudo systemctl status postgresql');
        console.error('2. Check your DATABASE_URL in .env file');
        console.error('3. Verify database and user exist: psql -U your_username -d clarity_db');
        process.exit(1);
    }
}

testConnection();
