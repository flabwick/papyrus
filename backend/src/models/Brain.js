const { query, transaction } = require('./database');
const { createBrainDirectory, sanitizeBrainName, validateBrainName } = require('../utils/fileSystem');
const path = require('path');

/**
 * Brain Model
 * Handles brain-related database operations
 */

class Brain {
  constructor(data) {
    this.id = data.id;
    this.userId = data.user_id;
    this.name = data.name;
    this.folderPath = data.folder_path;
    this.lastScannedAt = data.last_scanned_at;
    this.storageUsed = data.storage_used;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  /**
   * Create a new brain with file system directory
   * @param {string} userId - User ID who owns the brain
   * @param {string} brainName - Name of the brain
   * @returns {Promise<Brain>} - Created brain instance
   */
  static async create(userId, brainName) {
    if (!validateBrainName(brainName)) {
      throw new Error('Invalid brain name format');
    }

    return await transaction(async (client) => {
      // Get user information
      const userResult = await client.query(
        'SELECT username, storage_path FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      // Check if brain name already exists for this user
      const existingBrain = await client.query(
        'SELECT id FROM brains WHERE user_id = $1 AND name = $2',
        [userId, brainName]
      );

      if (existingBrain.rows.length > 0) {
        throw new Error(`Brain '${brainName}' already exists`);
      }

      // Create file system directory
      const folderPath = await createBrainDirectory(user.username, brainName);
      
      // Insert brain into database
      const result = await client.query(`
        INSERT INTO brains (user_id, name, folder_path, storage_used)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [userId, brainName, folderPath, 0]);

      const brain = new Brain(result.rows[0]);

      // Create welcome stream for new brain
      try {
        const StreamManager = require('../services/streamManager');
        await StreamManager.createWelcomeStream(brain.id);
        console.log(`✅ Created welcome stream for brain: ${brainName}`);
      } catch (error) {
        console.error(`⚠️  Failed to create welcome stream for brain ${brainName}:`, error.message);
        // Don't fail brain creation if welcome stream fails
      }

      console.log(`✅ Created brain: ${brainName} for user: ${user.username}`);
      return brain;
    });
  }

  /**
   * Find brain by ID
   * @param {string} brainId - Brain ID to find
   * @returns {Promise<Brain|null>} - Brain instance or null
   */
  static async findById(brainId) {
    const result = await query(
      'SELECT * FROM brains WHERE id = $1',
      [brainId]
    );

    return result.rows.length > 0 ? new Brain(result.rows[0]) : null;
  }

  /**
   * Find brain by user and name
   * @param {string} userId - User ID
   * @param {string} brainName - Brain name
   * @returns {Promise<Brain|null>} - Brain instance or null
   */
  static async findByUserAndName(userId, brainName) {
    const result = await query(
      'SELECT * FROM brains WHERE user_id = $1 AND name = $2',
      [userId, brainName]
    );

    return result.rows.length > 0 ? new Brain(result.rows[0]) : null;
  }

  /**
   * Get all brains for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array<Brain>>} - Array of brain instances
   */
  static async findByUserId(userId) {
    const result = await query(
      'SELECT * FROM brains WHERE user_id = $1 ORDER BY name',
      [userId]
    );

    return result.rows.map(row => new Brain(row));
  }

  /**
   * Get brain with user information
   * @param {string} brainId - Brain ID
   * @returns {Promise<Object|null>} - Brain with user info or null
   */
  static async findWithUser(brainId) {
    const result = await query(`
      SELECT b.*, u.username, u.storage_quota
      FROM brains b
      JOIN users u ON b.user_id = u.id
      WHERE b.id = $1
    `, [brainId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      brain: new Brain(row),
      user: {
        id: row.user_id,
        username: row.username,
        storageQuota: row.storage_quota
      }
    };
  }

  /**
   * Get all titled cards in this brain (only cards with titles appear in cards list)
   * @param {boolean} activeOnly - Only return active cards (default: true)
   * @returns {Promise<Array>} - Array of titled card objects
   */
  async getCards(activeOnly = true) {
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT * FROM cards 
      WHERE brain_id = $1 ${whereClause}
      AND title IS NOT NULL AND title != ''
      ORDER BY title
    `, [this.id]);

    return result.rows;
  }

  /**
   * Get card count for this brain
   * @param {boolean} activeOnly - Only count active cards (default: true)
   * @returns {Promise<number>} - Card count
   */
  async getCardCount(activeOnly = true) {
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT COUNT(*) as count 
      FROM cards 
      WHERE brain_id = $1 ${whereClause}
      AND (card_type IS NULL OR card_type != 'unsaved')
    `, [this.id]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Update brain's last scanned timestamp
   * @returns {Promise<void>}
   */
  async updateLastScanned() {
    await query(
      'UPDATE brains SET last_scanned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [this.id]
    );

    this.lastScannedAt = new Date();
  }

  /**
   * Update brain's storage usage
   * @param {number} storageUsed - New storage usage in bytes
   * @returns {Promise<void>}
   */
  async updateStorageUsage(storageUsed) {
    await query(
      'UPDATE brains SET storage_used = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [storageUsed, this.id]
    );

    this.storageUsed = storageUsed;
  }

  /**
   * Calculate actual storage usage by scanning files
   * @returns {Promise<number>} - Storage usage in bytes
   */
  async calculateStorageUsage() {
    try {
      const { scanBrainFiles } = require('../utils/fileSystem');
      const files = await scanBrainFiles(this.folderPath);
      
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      
      // Update the database
      await this.updateStorageUsage(totalSize);
      
      return totalSize;
    } catch (error) {
      console.error(`❌ Failed to calculate storage usage for brain ${this.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Get brain info for API responses
   * @returns {Object} - Brain data with computed fields
   */
  async toJSON() {
    const cardCount = await this.getCardCount();
    
    return {
      id: this.id,
      name: this.name,
      folderPath: this.folderPath,
      cardCount,
      storageUsed: this.storageUsed,
      lastScannedAt: this.lastScannedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Delete brain (soft delete - archives file system data)
   * @returns {Promise<void>}
   */
  async delete() {
    return await transaction(async (client) => {
      // Archive file system directory
      const fs = require('fs-extra');
      const { STORAGE_BASE } = require('../utils/fileSystem');
      
      const archivePath = path.join(STORAGE_BASE, '.archived', `brain-${this.id}-${Date.now()}`);
      
      if (await fs.pathExists(this.folderPath)) {
        await fs.ensureDir(path.dirname(archivePath));
        await fs.move(this.folderPath, archivePath);
        console.log(`✅ Archived brain directory: ${this.folderPath} -> ${archivePath}`);
      }
      
      // Delete brain from database (cascades to related tables)
      await client.query('DELETE FROM brains WHERE id = $1', [this.id]);
      
      console.log(`✅ Deleted brain: ${this.name}`);
    });
  }

  /**
   * Force sync all files in this brain with database
   * @returns {Promise<number>} - Number of files synced
   */
  async forceSync() {
    try {
      const fileWatcher = require('../services/fileWatcher');
      
      // Get user info
      const userResult = await query(
        'SELECT username FROM users WHERE id = $1',
        [this.userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const username = userResult.rows[0].username;
      
      // Force sync through file watcher
      await fileWatcher.forceSyncBrain(username, this.name);
      
      // Update last scanned timestamp
      await this.updateLastScanned();
      
      // Recalculate storage usage
      await this.calculateStorageUsage();
      
      return await this.getCardCount();
    } catch (error) {
      console.error(`❌ Force sync failed for brain ${this.name}:`, error.message);
      throw error;
    }
  }
}

module.exports = Brain;