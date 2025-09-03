const { query, transaction } = require('./database');
const bcrypt = require('bcrypt');
const { createUserDirectory, validateUsername } = require('../utils/fileSystem');

/**
 * User Model
 * Handles user-related database operations
 */

const BCRYPT_ROUNDS = 12;

class User {
  constructor(data) {
    this.id = data.id;
    this.username = data.username;
    this.passwordHash = data.password_hash;
    this.storagePath = data.storage_path;
    this.storageQuota = data.storage_quota;
    this.storageUsed = data.storage_used;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  /**
   * Create a new user with file system directory
   * @param {string} username - Username
   * @param {string} password - Plain text password
   * @param {number} storageQuota - Storage quota in bytes (optional)
   * @returns {Promise<User>} - Created user instance
   */
  static async create(username, password, storageQuota = 1073741824) {
    if (!validateUsername(username)) {
      throw new Error('Invalid username format');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    return await transaction(async (client) => {
      // Check if username already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUser.rows.length > 0) {
        throw new Error(`Username '${username}' already exists`);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      
      // Create file system directory
      const storagePath = await createUserDirectory(username);
      
      // Insert user into database
      const result = await client.query(`
        INSERT INTO users (username, password_hash, storage_path, storage_quota, storage_used)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [username, passwordHash, storagePath, storageQuota, 0]);

      console.log(`✅ Created user: ${username}`);
      return new User(result.rows[0]);
    });
  }

  /**
   * Find user by username
   * @param {string} username - Username to find
   * @returns {Promise<User|null>} - User instance or null
   */
  static async findByUsername(username) {
    const result = await query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    return result.rows.length > 0 ? new User(result.rows[0]) : null;
  }

  /**
   * Find user by ID
   * @param {string} userId - User ID to find
   * @returns {Promise<User|null>} - User instance or null
   */
  static async findById(userId) {
    const result = await query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    return result.rows.length > 0 ? new User(result.rows[0]) : null;
  }

  /**
   * Get all users
   * @returns {Promise<Array<User>>} - Array of user instances
   */
  static async findAll() {
    const result = await query(
      'SELECT * FROM users ORDER BY username'
    );

    return result.rows.map(row => new User(row));
  }

  /**
   * Verify password for authentication
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} - True if password is correct
   */
  async verifyPassword(password) {
    return await bcrypt.compare(password, this.passwordHash);
  }

  /**
   * Update user's password
   * @param {string} newPassword - New plain text password
   * @returns {Promise<void>}
   */
  async updatePassword(newPassword) {
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    
    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, this.id]
    );

    this.passwordHash = passwordHash;
    console.log(`✅ Updated password for user: ${this.username}`);
  }

  /**
   * Update user's storage usage
   * @param {number} storageUsed - New storage usage in bytes
   * @returns {Promise<void>}
   */
  async updateStorageUsage(storageUsed) {
    await query(
      'UPDATE users SET storage_used = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [storageUsed, this.id]
    );

    this.storageUsed = storageUsed;
  }

  /**
   * Check if user has sufficient storage quota
   * @param {number} additionalBytes - Additional bytes to check
   * @returns {boolean} - True if user has sufficient quota
   */
  hasStorageQuota(additionalBytes = 0) {
    return (this.storageUsed + additionalBytes) <= this.storageQuota;
  }

  /**
   * Get user's storage usage percentage
   * @returns {number} - Usage percentage (0-100)
   */
  getStorageUsagePercentage() {
    if (this.storageQuota === 0) return 0;
    return Math.round((this.storageUsed / this.storageQuota) * 100);
  }

  /**
   * Get user info for API responses (without sensitive data)
   * @returns {Object} - Safe user data
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      storageQuota: this.storageQuota,
      storageUsed: this.storageUsed,
      storageUsagePercentage: this.getStorageUsagePercentage(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Delete user (soft delete - archives file system data)
   * @returns {Promise<void>}
   */
  async delete() {
    return await transaction(async (client) => {
      // Archive file system directory
      const { archiveUserDirectory } = require('../utils/fileSystem');
      const archivePath = await archiveUserDirectory(this.username);
      
      // Delete user from database (cascades to related tables)
      await client.query('DELETE FROM users WHERE id = $1', [this.id]);
      
      console.log(`✅ Deleted user: ${this.username}, archived to: ${archivePath}`);
    });
  }
}

module.exports = User;