#!/usr/bin/env node

/**
 * Card Type System Migration Script
 * Safely adds card type system to existing database
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const pool = new Pool({
    host: '/var/run/postgresql',  // Use socket directory
    port: 5433,
    database: 'brain6',
    user: 'brain6_user',
    password: 'jewsincanoes'
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Starting Card Type System Migration...');
        
        // Check if migration already applied
        const checkResult = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'cards' AND column_name = 'card_type'
        `);
        
        if (checkResult.rows.length > 0) {
            console.log('⚠️  Card type system already exists. Checking consistency...');
            
            // Validate existing data
            const validationResult = await client.query(`
                SELECT 
                    COUNT(*) as total_cards,
                    COUNT(CASE WHEN card_type = 'saved' THEN 1 END) as saved_cards,
                    COUNT(CASE WHEN card_type = 'file' THEN 1 END) as file_cards,
                    COUNT(CASE WHEN card_type = 'unsaved' THEN 1 END) as unsaved_cards
                FROM cards 
                WHERE is_active = true
            `);
            
            const stats = validationResult.rows[0];
            console.log('📊 Current card type distribution:');
            console.log(`   - Total: ${stats.total_cards}`);
            console.log(`   - Saved: ${stats.saved_cards}`);
            console.log(`   - File: ${stats.file_cards}`);
            console.log(`   - Unsaved: ${stats.unsaved_cards}`);
            
            console.log('✅ Migration already applied successfully.');
            return;
        }
        
        console.log('📋 Loading migration SQL...');
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'card-types-migration.sql'), 
            'utf8'
        );
        
        console.log('🔄 Executing migration...');
        await client.query('BEGIN');
        
        try {
            // Split SQL into individual statements
            const statements = migrationSQL
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
            
            for (let i = 0; i < statements.length; i++) {
                const statement = statements[i] + ';';
                if (statement.trim() !== ';') {
                    console.log(`   Executing statement ${i + 1}/${statements.length}...`);
                    await client.query(statement);
                }
            }
            
            await client.query('COMMIT');
            console.log('✅ Migration completed successfully!');
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        
        // Verify migration results
        console.log('🔍 Verifying migration results...');
        const verificationResult = await client.query(`
            SELECT 
                COUNT(*) as total_cards,
                COUNT(CASE WHEN card_type = 'saved' THEN 1 END) as saved_cards,
                COUNT(CASE WHEN card_type IS NULL THEN 1 END) as null_types
            FROM cards 
            WHERE is_active = true
        `);
        
        const verification = verificationResult.rows[0];
        console.log('📊 Migration verification:');
        console.log(`   - Total active cards: ${verification.total_cards}`);
        console.log(`   - Cards with saved type: ${verification.saved_cards}`);
        console.log(`   - Cards with null type: ${verification.null_types}`);
        
        if (verification.null_types > 0) {
            console.log('⚠️  Warning: Some cards still have null card_type');
        } else {
            console.log('✅ All cards successfully migrated to typed system');
        }
        
        // Test constraint validation
        console.log('🧪 Testing constraint validation...');
        try {
            await client.query(`
                INSERT INTO cards (brain_id, title, card_type) 
                VALUES ('${require('crypto').randomUUID()}', 'test', 'invalid_type')
            `);
            console.log('❌ Constraint validation failed - invalid types accepted');
        } catch (error) {
            if (error.message.includes('check_card_type')) {
                console.log('✅ Card type constraint working correctly');
            } else {
                console.log('⚠️  Unexpected constraint error:', error.message);
            }
        }
        
        console.log('🎉 Card Type System Migration completed successfully!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Update Card model to use new card_type field');
        console.log('2. Update API endpoints to handle card types');
        console.log('3. Update frontend components for type-specific rendering');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
        
    } finally {
        client.release();
    }
}

async function main() {
    try {
        await runMigration();
        await pool.end();
        console.log('📚 Database connection closed.');
        
    } catch (error) {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    }
}

// Run migration if called directly
if (require.main === module) {
    main();
}

module.exports = { runMigration };