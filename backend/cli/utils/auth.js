const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { query } = require('../../src/models/database');
const User = require('../../src/models/User');

/**
 * CLI Authentication Utilities
 */

const CONFIG_DIR = path.join(os.homedir(), '.clarity');
const TOKEN_FILE = path.join(CONFIG_DIR, 'auth-token');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Generate a secure random token
 */
function generateToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Save authentication token to file
 */
async function saveAuthToken(token, userId) {
  await fs.ensureDir(CONFIG_DIR);
  
  const authData = {
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
  };
  
  await fs.writeJson(TOKEN_FILE, authData);
}

/**
 * Load authentication token from file
 */
async function loadAuthToken() {
  try {
    if (!(await fs.pathExists(TOKEN_FILE))) {
      return null;
    }
    
    const authData = await fs.readJson(TOKEN_FILE);
    
    // Check if token is expired
    if (new Date(authData.expiresAt) < new Date()) {
      await clearAuthToken();
      return null;
    }
    
    return authData;
  } catch (error) {
    return null;
  }
}

/**
 * Clear authentication token
 */
async function clearAuthToken() {
  try {
    if (await fs.pathExists(TOKEN_FILE)) {
      await fs.remove(TOKEN_FILE);
    }
  } catch (error) {
    // Ignore errors when clearing token
  }
}

/**
 * Login user and save token
 */
async function loginUser(username, password) {
  if (!password) {
    // Prompt for password if not provided
    const { promptPassword } = require('./prompts');
    password = await promptPassword('Password: ');
  }
  
  // Find user and verify password
  const user = await User.findByUsername(username);
  if (!user) {
    throw new Error('Invalid username or password');
  }
  
  const isValidPassword = await user.verifyPassword(password);
  if (!isValidPassword) {
    throw new Error('Invalid username or password');
  }
  
  // Generate token and save to database
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  await query(`
    INSERT INTO cli_sessions (user_id, token, expires_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (token) DO UPDATE SET 
      expires_at = EXCLUDED.expires_at,
      last_used_at = CURRENT_TIMESTAMP
  `, [user.id, token, expiresAt]);
  
  // Save token locally
  await saveAuthToken(token, user.id);
  
  console.log(`✅ Logged in as ${username}`);
  return user;
}

/**
 * Get current authenticated user
 */
async function getCurrentUser() {
  const authData = await loadAuthToken();
  if (!authData) {
    return null;
  }
  
  // Verify token is still valid in database
  const result = await query(`
    SELECT s.user_id, s.expires_at, u.*
    FROM cli_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP
  `, [authData.token]);
  
  if (result.rows.length === 0) {
    await clearAuthToken();
    return null;
  }
  
  // Update last used timestamp
  await query(`
    UPDATE cli_sessions 
    SET last_used_at = CURRENT_TIMESTAMP 
    WHERE token = $1
  `, [authData.token]);
  
  return new User(result.rows[0]);
}

/**
 * Ensure user is authenticated, throw error if not
 */
async function ensureAuthentication() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Not authenticated. Please run "clarity login <username>" first.');
  }
  return user;
}

/**
 * Check if current user is admin (for admin commands)
 */
async function ensureAdminAuthentication() {
  const user = await ensureAuthentication();
  
  // For now, all authenticated users can perform admin actions
  // In a real system, you'd check for admin role/permissions
  return user;
}

/**
 * Save CLI configuration
 */
async function saveConfig(config) {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
}

/**
 * Load CLI configuration
 */
async function loadConfig() {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      return await fs.readJson(CONFIG_FILE);
    }
    return {};
  } catch (error) {
    return {};
  }
}

module.exports = {
  generateToken,
  saveAuthToken,
  loadAuthToken,
  clearAuthToken,
  loginUser,
  getCurrentUser,
  ensureAuthentication,
  ensureAdminAuthentication,
  saveConfig,
  loadConfig
};