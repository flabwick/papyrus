require('dotenv').config();
const { Pool } = require('pg');

/**
 * Database Connection and Utilities
 * Provides connection pool and common database operations
 */

// Create connection pool using socket connection
const pool = new Pool({
  // Use socket connection instead of host/port for local connections
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Connection pool settings
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
});

/**
 * Execute a query with error handling
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
async function query(text, params) {
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (over 100ms)
    if (duration > 100) {
      console.log('🐌 Slow query:', {
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration: `${duration}ms`,
        rows: result.rowCount
      });
    }
    
    return result;
  } catch (error) {
    console.error('❌ Database query error:', {
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} - Database client
 */
async function getClient() {
  return await pool.connect();
}

/**
 * Execute multiple queries in a transaction
 * @param {Function} callback - Function that receives client and executes queries
 * @returns {Promise<any>} - Result of callback
 */
async function transaction(callback) {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if database is connected and responsive
 * @returns {Promise<boolean>} - True if database is healthy
 */
async function healthCheck() {
  try {
    const result = await query('SELECT NOW() as current_time');
    return !!result.rows[0].current_time;
  } catch (error) {
    console.error('Database health check failed:', error.message);
    return false;
  }
}

/**
 * Check if required tables exist
 * @returns {Promise<Object>} - Object with table existence status
 */
async function checkTables() {
  try {
    const result = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'brains', 'cards', 'card_links', 'streams', 'cli_sessions', 'web_sessions')
      ORDER BY table_name
    `);
    
    const existingTables = result.rows.map(row => row.table_name);
    const requiredTables = ['users', 'brains', 'cards', 'card_links', 'streams', 'cli_sessions', 'web_sessions'];
    
    const status = {};
    requiredTables.forEach(table => {
      status[table] = existingTables.includes(table);
    });
    
    return {
      allExist: requiredTables.every(table => status[table]),
      tables: status,
      existing: existingTables,
      missing: requiredTables.filter(table => !status[table])
    };
  } catch (error) {
    console.error('Failed to check tables:', error.message);
    return {
      allExist: false,
      tables: {},
      existing: [],
      missing: [],
      error: error.message
    };
  }
}

/**
 * Close database connection pool
 * @returns {Promise<void>}
 */
async function closePool() {
  try {
    if (!pool.ended) {
      await pool.end();
      console.log('✅ Database connection pool closed');
    }
  } catch (error) {
    console.error('❌ Error closing database pool:', error.message);
  }
}

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    await closePool();
    console.log('✅ Database pool closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
}

// Handle process termination - don't close pool automatically
// Let the application handle shutdown
// process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = {
  query,
  getClient,
  transaction,
  healthCheck,
  checkTables,
  closePool,
  pool
};