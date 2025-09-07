#!/usr/bin/env node

const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Database connection - use DATABASE_URL if available, otherwise fall back to individual variables
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DATABASE_URL ? undefined : (process.env.DB_HOST || 'localhost'),
    port: process.env.DATABASE_URL ? undefined : (process.env.DB_PORT || 5432),
    database: process.env.DATABASE_URL ? undefined : (process.env.DB_NAME || 'papyrus'),
    user: process.env.DATABASE_URL ? undefined : (process.env.DB_USER || 'jameschadwick'),
    password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD,
});

/**
 * Validates username according to schema constraints
 * @param {string} username 
 * @returns {boolean}
 */
function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return false;
    }
    
    // Check length (3-20 characters)
    if (username.length < 3 || username.length > 20) {
        return false;
    }
    
    // Check pattern (alphanumeric and hyphens only)
    const pattern = /^[a-zA-Z0-9-]+$/;
    return pattern.test(username);
}

/**
 * Creates storage directory structure for a user
 * @param {string} username 
 * @returns {Promise<string>} storage path
 */
async function createUserStorageDirectory(username) {
    const storagePath = path.join(__dirname, 'storage', username);
    const librariesPath = path.join(storagePath, 'libraries');
    const filesPath = path.join(storagePath, 'files');
    
    try {
        // Create user's main storage directory
        await fs.mkdir(storagePath, { recursive: true });
        console.log(`✓ Created storage directory: ${storagePath}`);
        
        // Create libraries subdirectory
        await fs.mkdir(librariesPath, { recursive: true });
        console.log(`✓ Created libraries directory: ${librariesPath}`);
        
        // Create files subdirectory
        await fs.mkdir(filesPath, { recursive: true });
        console.log(`✓ Created files directory: ${filesPath}`);
        
        // Create a README file in the storage directory
        const readmeContent = `# Storage Directory for User: ${username}

This directory contains all files and data for the user "${username}".

## Structure:
- libraries/: Contains library-specific folders and files
- files/: Contains uploaded files and attachments

## Important:
- Do not manually modify files in this directory
- All file operations should go through the Papyrus application
- This directory is managed by the Papyrus file system

Created: ${new Date().toISOString()}
`;
        
        await fs.writeFile(path.join(storagePath, 'README.md'), readmeContent);
        console.log(`✓ Created README.md in storage directory`);
        
        return `backend/storage/${username}`;
    } catch (error) {
        throw new Error(`Failed to create storage directory: ${error.message}`);
    }
}

/**
 * Creates a new user in the database
 * @param {string} username 
 * @param {string} password 
 * @param {number} storageQuota - in bytes, defaults to 1GB
 * @returns {Promise<Object>} created user object
 */
async function createUser(username, password, storageQuota = 1073741824) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Validate username
        if (!validateUsername(username)) {
            throw new Error('Invalid username. Must be 3-20 characters long and contain only letters, numbers, and hyphens.');
        }
        
        // Check if username already exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );
        
        if (existingUser.rows.length > 0) {
            throw new Error(`Username "${username}" already exists`);
        }
        
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Create storage directory
        const storagePath = await createUserStorageDirectory(username);
        
        // Insert user into database
        const result = await client.query(`
            INSERT INTO users (username, password_hash, storage_path, storage_quota, storage_used)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, username, storage_path, storage_quota, storage_used, created_at
        `, [username, passwordHash, storagePath, storageQuota, 0]);
        
        await client.query('COMMIT');
        
        const user = result.rows[0];
        console.log('\n🎉 User created successfully!');
        console.log('User Details:');
        console.log(`  ID: ${user.id}`);
        console.log(`  Username: ${user.username}`);
        console.log(`  Storage Path: ${user.storage_path}`);
        console.log(`  Storage Quota: ${(user.storage_quota / 1024 / 1024 / 1024).toFixed(2)} GB`);
        console.log(`  Storage Used: ${user.storage_used} bytes`);
        console.log(`  Created: ${user.created_at}`);
        
        return user;
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Creates a sample library for the new user
 * @param {string} userId 
 * @param {string} username 
 * @returns {Promise<Object>} created library object
 */
async function createSampleLibrary(userId, username) {
    const client = await pool.connect();
    
    try {
        const libraryName = 'My First Library';
        const folderPath = `backend/storage/${username}/libraries/my-first-library`;
        
        // Create library directory
        const fullFolderPath = path.join(__dirname, 'storage', username, 'libraries', 'my-first-library');
        await fs.mkdir(fullFolderPath, { recursive: true });
        
        // Insert library into database
        const result = await client.query(`
            INSERT INTO libraries (user_id, name, folder_path, storage_used)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, folder_path, created_at
        `, [userId, libraryName, folderPath, 0]);
        
        const library = result.rows[0];
        
        // Create a welcome card
        const welcomeContent = `# Welcome to Papyrus!

This is your first library - a knowledge base where you can store and organize your thoughts, notes, and files.

## Getting Started:
1. Create cards to store your knowledge
2. Link cards together using [[card-title]] syntax
3. Organize cards into streams for different topics
4. Upload files and they'll automatically become cards

## Features:
- **File Storage**: Upload any file type and it becomes searchable
- **Card Linking**: Connect related ideas with [[links]]
- **Streams**: Organize cards into themed collections
- **Search**: Find anything across all your cards
- **CLI Access**: Manage your library from the command line

Happy knowledge building! 🧠
`;
        
        const welcomeFilePath = path.join(fullFolderPath, 'welcome.md');
        await fs.writeFile(welcomeFilePath, welcomeContent);
        
        // Create welcome card in database
        await client.query(`
            INSERT INTO cards (library_id, title, file_path, content_preview, file_size, card_type, is_brain_wide)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            library.id,
            'Welcome to Papyrus',
            `backend/storage/${username}/libraries/my-first-library/welcome.md`,
            welcomeContent, // Use full content, no 500 char limit
            Buffer.byteLength(welcomeContent, 'utf8'),
            'file',
            true
        ]);
        
        console.log(`✓ Created sample library: ${library.name}`);
        console.log(`✓ Created welcome card at: ${welcomeFilePath}`);
        
        return library;
        
    } catch (error) {
        throw new Error(`Failed to create sample library: ${error.message}`);
    } finally {
        client.release();
    }
}

/**
 * Main function to handle command line arguments and create user
 */
async function main() {
    try {
        const args = process.argv.slice(2);
        
        if (args.length < 2) {
            console.log('Usage: node create-user.js <username> <password> [storage_quota_gb]');
            console.log('');
            console.log('Examples:');
            console.log('  node create-user.js john-doe mypassword123');
            console.log('  node create-user.js alice strongpass456 2');
            console.log('');
            console.log('Storage quota defaults to 1GB if not specified.');
            process.exit(1);
        }
        
        const username = args[0];
        const password = args[1];
        const storageQuotaGB = args[2] ? parseFloat(args[2]) : 1;
        const storageQuotaBytes = Math.floor(storageQuotaGB * 1024 * 1024 * 1024);
        
        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }
        
        console.log(`Creating user "${username}" with ${storageQuotaGB}GB storage quota...`);
        console.log('');
        
        // Create user
        const user = await createUser(username, password, storageQuotaBytes);
        
        // Create sample library
        await createSampleLibrary(user.id, username);
        
        console.log('\n✅ User setup completed successfully!');
        console.log('\nNext steps:');
        console.log('1. The user can now log in with their credentials');
        console.log('2. They can start creating cards and uploading files');
        console.log('3. Files will be stored in their dedicated storage directory');
        console.log(`4. Storage directory: ${path.join(__dirname, 'storage', username)}`);
        
    } catch (error) {
        console.error('❌ Error creating user:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    createUser,
    createSampleLibrary,
    validateUsername,
    createUserStorageDirectory
};
