require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');

/**
 * Database Initialization Script
 * Sets up the complete database schema and creates an admin user
 */

async function initializeDatabase() {
    const pool = new Pool({
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        console.log('🚀 Starting database initialization...');
        
        // Read and execute schema
        console.log('📋 Creating database schema...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = await fs.readFile(schemaPath, 'utf8');
        
        await pool.query(schemaSql);
        console.log('✅ Database schema created successfully');
        
        // Create admin user
        console.log('👤 Creating admin user...');
        const adminUsername = 'admin';
        const adminPassword = 'password123';
        const adminStoragePath = 'backend/storage/admin';
        
        // Hash the password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(adminPassword, saltRounds);
        
        // Insert admin user
        const userResult = await pool.query(`
            INSERT INTO users (username, password_hash, storage_path, storage_quota, storage_used)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                storage_path = EXCLUDED.storage_path,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, username
        `, [adminUsername, passwordHash, adminStoragePath, 1073741824, 0]);
        
        const adminUser = userResult.rows[0];
        console.log(`✅ Admin user created: ${adminUser.username} (ID: ${adminUser.id})`);
        
        // Create default library for admin
        console.log('📚 Creating default library...');
        const defaultLibraryName = 'My Library';
        const defaultLibraryPath = 'backend/storage/admin/libraries/my-library';
        
        const libraryResult = await pool.query(`
            INSERT INTO libraries (user_id, name, folder_path, storage_used)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, name) DO UPDATE SET
                folder_path = EXCLUDED.folder_path,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, name
        `, [adminUser.id, defaultLibraryName, defaultLibraryPath, 0]);
        
        const defaultLibrary = libraryResult.rows[0];
        console.log(`✅ Default library created: ${defaultLibrary.name} (ID: ${defaultLibrary.id})`);
        
        // Create default workspace
        console.log('🔧 Creating default workspace...');
        const defaultWorkspaceName = 'Main Workspace';
        
        const workspaceResult = await pool.query(`
            INSERT INTO workspaces (library_id, name, is_favorited)
            VALUES ($1, $2, $3)
            ON CONFLICT (library_id, name) DO UPDATE SET
                is_favorited = EXCLUDED.is_favorited,
                last_accessed_at = CURRENT_TIMESTAMP
            RETURNING id, name
        `, [defaultLibrary.id, defaultWorkspaceName, true]);
        
        const defaultWorkspace = workspaceResult.rows[0];
        console.log(`✅ Default workspace created: ${defaultWorkspace.name} (ID: ${defaultWorkspace.id})`);
        
        // Verify tables exist
        console.log('🔍 Verifying database setup...');
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        const expectedTables = [
            'users', 'libraries', 'workspaces', 'files', 'pages', 
            'page_links', 'workspace_pages', 'workspace_files', 
            'cli_sessions', 'web_sessions'
        ];
        
        const existingTables = tablesResult.rows.map(row => row.table_name);
        const missingTables = expectedTables.filter(table => !existingTables.includes(table));
        
        if (missingTables.length === 0) {
            console.log('✅ All required tables created successfully');
            console.log(`📊 Total tables: ${existingTables.length}`);
        } else {
            console.log('⚠️  Some tables are missing:', missingTables);
        }
        
        console.log('\n🎉 Database initialization completed successfully!');
        console.log('\n📝 Login credentials:');
        console.log(`   Username: ${adminUsername}`);
        console.log(`   Password: ${adminPassword}`);
        console.log('\n⚠️  Remember to change the admin password after first login!');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        console.error('\nTroubleshooting tips:');
        console.error('1. Make sure PostgreSQL is running');
        console.error('2. Check your .env file has correct database credentials');
        console.error('3. Ensure the database exists and is accessible');
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run initialization if called directly
if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };
