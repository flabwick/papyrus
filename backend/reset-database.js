require('dotenv').config();
const { Pool } = require('pg');

/**
 * Database Reset Script
 * Drops all tables and allows for clean re-initialization
 */

async function resetDatabase() {
    const pool = new Pool({
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        console.log('🗑️  Resetting database...');
        
        // Drop all tables in correct order (respecting foreign key constraints)
        const dropCommands = [
            'DROP TABLE IF EXISTS workspace_files CASCADE;',
            'DROP TABLE IF EXISTS workspace_pages CASCADE;',
            'DROP TABLE IF EXISTS page_links CASCADE;',
            'DROP TABLE IF EXISTS pages CASCADE;',
            'DROP TABLE IF EXISTS files CASCADE;',
            'DROP TABLE IF EXISTS workspaces CASCADE;',
            'DROP TABLE IF EXISTS libraries CASCADE;',
            'DROP TABLE IF EXISTS cli_sessions CASCADE;',
            'DROP TABLE IF EXISTS web_sessions CASCADE;',
            'DROP TABLE IF EXISTS users CASCADE;',
            'DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;'
        ];
        
        for (const command of dropCommands) {
            await pool.query(command);
        }
        
        console.log('✅ All tables dropped successfully');
        console.log('✅ Database reset completed');
        console.log('\nYou can now run: node setup.js');
        
    } catch (error) {
        console.error('❌ Database reset failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run reset if called directly
if (require.main === module) {
    resetDatabase();
}

module.exports = { resetDatabase };
