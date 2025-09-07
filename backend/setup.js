require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { initializeDatabase } = require('./init-database');

/**
 * Complete Papyrus Setup Script
 * Sets up storage directories and initializes database
 */

async function setupPapyrus() {
    try {
        console.log('🎯 Starting Papyrus setup...\n');
        
        // Create storage directories
        console.log('📁 Setting up storage directories...');
        const storagePaths = [
            'storage',
            'storage/admin',
            'storage/admin/libraries',
            'storage/admin/libraries/my-library'
        ];
        
        for (const storagePath of storagePaths) {
            const fullPath = path.join(__dirname, storagePath);
            try {
                await fs.mkdir(fullPath, { recursive: true });
                console.log(`✅ Created: ${storagePath}`);
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    throw error;
                }
                console.log(`✅ Exists: ${storagePath}`);
            }
        }
        
        // Initialize database
        console.log('\n🗄️  Initializing database...');
        await initializeDatabase();
        
        console.log('\n🚀 Papyrus setup completed successfully!');
        console.log('\nDatabase schema created successfully');
        console.log('Admin user created with default credentials');
        console.log('Default library and workspace initialized');
        console.log('\n⚠️  Remember to change the admin password after first login!');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

// Run setup if called directly
if (require.main === module) {
    setupPapyrus();
}

module.exports = { setupPapyrus };
