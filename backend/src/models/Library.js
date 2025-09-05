const { query, transaction } = require('./database');
const { createLibraryDirectory, sanitizeLibraryName, validateLibraryName } = require('../utils/fileSystem');
const path = require('path');

/**
 * Library Model
 * Handles library-related database operations
 */

class Library {
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
   * Create a new library with file system directory
   * @param {string} userId - User ID who owns the library
   * @param {string} libraryName - Name of the library
   * @returns {Promise<Library>} - Created library instance
   */
  static async create(userId, libraryName) {
    if (!validateLibraryName(libraryName)) {
      throw new Error('Invalid library name format');
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

      // Check if library name already exists for this user
      const existingLibrary = await client.query(
        'SELECT id FROM libraries WHERE user_id = $1 AND name = $2',
        [userId, libraryName]
      );

      if (existingLibrary.rows.length > 0) {
        throw new Error(`Library '${libraryName}' already exists`);
      }

      // Create file system directory
      const folderPath = await createLibraryDirectory(user.username, libraryName);
      
      // Insert library into database
      const result = await client.query(`
        INSERT INTO libraries (user_id, name, folder_path, storage_used)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [userId, libraryName, folderPath, 0]);

      const library = new Library(result.rows[0]);

      // Create welcome workspace for new library
      try {
        const WorkspaceManager = require('../services/workspaceManager');
        await WorkspaceManager.createWelcomeWorkspace(library.id);
        console.log(`✅ Created welcome workspace for library: ${libraryName}`);
      } catch (error) {
        console.error(`⚠️  Failed to create welcome workspace for library ${libraryName}:`, error.message);
        // Don't fail library creation if welcome workspace fails
      }

      console.log(`✅ Created library: ${libraryName} for user: ${user.username}`);
      return library;
    });
  }

  /**
   * Find library by ID
   * @param {string} libraryId - Library ID to find
   * @returns {Promise<Library|null>} - Library instance or null
   */
  static async findById(libraryId) {
    const result = await query(
      'SELECT * FROM libraries WHERE id = $1',
      [libraryId]
    );

    return result.rows.length > 0 ? new Library(result.rows[0]) : null;
  }

  /**
   * Find library by user and name
   * @param {string} userId - User ID
   * @param {string} libraryName - Library name
   * @returns {Promise<Library|null>} - Library instance or null
   */
  static async findByUserAndName(userId, libraryName) {
    const result = await query(
      'SELECT * FROM libraries WHERE user_id = $1 AND name = $2',
      [userId, libraryName]
    );

    return result.rows.length > 0 ? new Library(result.rows[0]) : null;
  }

  /**
   * Get all libraries for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array<Library>>} - Array of library instances
   */
  static async findByUserId(userId) {
    const result = await query(
      'SELECT * FROM libraries WHERE user_id = $1 ORDER BY name',
      [userId]
    );

    return result.rows.map(row => new Library(row));
  }

  /**
   * Get library with user information
   * @param {string} libraryId - Library ID
   * @returns {Promise<Object|null>} - Library with user info or null
   */
  static async findWithUser(libraryId) {
    const result = await query(`
      SELECT l.*, u.username, u.storage_quota
      FROM libraries l
      JOIN users u ON l.user_id = u.id
      WHERE l.id = $1
    `, [libraryId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      library: new Library(row),
      user: {
        id: row.user_id,
        username: row.username,
        storageQuota: row.storage_quota
      }
    };
  }

  /**
   * Get all titled pages in this library (only pages with titles appear in pages list)
   * @param {boolean} activeOnly - Only return active pages (default: true)
   * @returns {Promise<Array>} - Array of titled page objects
   */
  async getPages(activeOnly = true) {
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT * FROM pages 
      WHERE library_id = $1 ${whereClause}
      AND title IS NOT NULL AND title != ''
      ORDER BY title
    `, [this.id]);

    return result.rows;
  }

  /**
   * Get page count for this library
   * @param {boolean} activeOnly - Only count active pages (default: true)
   * @returns {Promise<number>} - Page count
   */
  async getPageCount(activeOnly = true) {
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT COUNT(*) as count 
      FROM pages 
      WHERE library_id = $1 ${whereClause}
      AND (page_type IS NULL OR page_type != 'unsaved')
    `, [this.id]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Update library's last scanned timestamp
   * @returns {Promise<void>}
   */
  async updateLastScanned() {
    await query(
      'UPDATE libraries SET last_scanned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [this.id]
    );

    this.lastScannedAt = new Date();
  }

  /**
   * Update library's storage usage
   * @param {number} storageUsed - New storage usage in bytes
   * @returns {Promise<void>}
   */
  async updateStorageUsage(storageUsed) {
    await query(
      'UPDATE libraries SET storage_used = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
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
      const { scanLibraryFiles } = require('../utils/fileSystem');
      const files = await scanLibraryFiles(this.folderPath);
      
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      
      // Update the database
      await this.updateStorageUsage(totalSize);
      
      return totalSize;
    } catch (error) {
      console.error(`❌ Failed to calculate storage usage for library ${this.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Get library info for API responses
   * @returns {Object} - Library data with computed fields
   */
  async toJSON() {
    const pageCount = await this.getPageCount();
    
    return {
      id: this.id,
      name: this.name,
      folderPath: this.folderPath,
      pageCount,
      storageUsed: this.storageUsed,
      lastScannedAt: this.lastScannedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Delete library (soft delete - archives file system data)
   * @returns {Promise<void>}
   */
  async delete() {
    return await transaction(async (client) => {
      // Archive file system directory
      const fs = require('fs-extra');
      const { STORAGE_BASE } = require('../utils/fileSystem');
      
      const archivePath = path.join(STORAGE_BASE, '.archived', `library-${this.id}-${Date.now()}`);
      
      if (await fs.pathExists(this.folderPath)) {
        await fs.ensureDir(path.dirname(archivePath));
        await fs.move(this.folderPath, archivePath);
        console.log(`✅ Archived library directory: ${this.folderPath} -> ${archivePath}`);
      }
      
      // Delete library from database (cascades to related tables)
      await client.query('DELETE FROM libraries WHERE id = $1', [this.id]);
      
      console.log(`✅ Deleted library: ${this.name}`);
    });
  }

  /**
   * Force sync all files in this library with database
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
      await fileWatcher.forceSyncLibrary(username, this.name);
      
      // Update last scanned timestamp
      await this.updateLastScanned();
      
      // Recalculate storage usage
      await this.calculateStorageUsage();
      
      return await this.getPageCount();
    } catch (error) {
      console.error(`❌ Force sync failed for library ${this.name}:`, error.message);
      throw error;
    }
  }
}

module.exports = Library;