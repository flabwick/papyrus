const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-extra');
const { STORAGE_BASE, calculateFileHash, getFileStats } = require('../utils/fileSystem');
const { query } = require('../models/database');
const Brain = require('../models/Brain');
const Card = require('../models/Card');
const cardProcessor = require('./cardProcessor');
const linkParser = require('./linkParser');

/**
 * File Watcher Service
 * Monitors file system changes and syncs with database
 */

class FileWatcher {
  constructor() {
    this.watcher = null;
    this.debounceTimers = new Map(); // Track debounce timers for files
    this.syncQueue = new Map(); // Queue of pending sync operations
    this.isProcessing = false;
    this.DEBOUNCE_MS = parseInt(process.env.WATCH_DEBOUNCE_MS) || 500;
  }

  /**
   * Start watching the storage directory
   */
  start() {
    if (this.watcher) {
      console.log('⚠️  File watcher is already running');
      return;
    }

    console.log(`👁️  Starting file watcher on: ${STORAGE_BASE}`);
    
    // Watch the entire storage directory recursively
    this.watcher = chokidar.watch(STORAGE_BASE, {
      ignored: [
        /node_modules/,
        /\.git/,
        /\.DS_Store/,
        /Thumbs\.db/,
        /\.tmp/,
        /\.temp/,
        // Ignore config files and hidden files starting with .
        /\/\.[^/]*$/
      ],
      persistent: true,
      ignoreInitial: true, // Don't trigger events for existing files on startup
      followSymlinks: false,
      depth: 10, // Reasonable depth limit
      awaitWriteFinish: {
        stabilityThreshold: 100, // Wait 100ms for file to stabilize
        pollInterval: 50 // Check every 50ms
      }
    });

    // File/directory added
    this.watcher.on('add', (filePath) => {
      this.debounceSync(filePath, 'add');
    });

    // File changed
    this.watcher.on('change', (filePath) => {
      this.debounceSync(filePath, 'change');
    });

    // File/directory removed
    this.watcher.on('unlink', (filePath) => {
      this.debounceSync(filePath, 'unlink');
    });

    // Directory added
    this.watcher.on('addDir', (dirPath) => {
      this.handleDirectoryAdd(dirPath);
    });

    // Directory removed
    this.watcher.on('unlinkDir', (dirPath) => {
      this.handleDirectoryRemove(dirPath);
    });

    // Error handling
    this.watcher.on('error', (error) => {
      console.error('❌ File watcher error:', error);
    });

    // Ready event
    this.watcher.on('ready', () => {
      console.log('✅ File watcher is ready and monitoring changes');
    });
  }

  /**
   * Stop the file watcher
   */
  async stop() {
    if (this.watcher) {
      console.log('🛑 Stopping file watcher...');
      await this.watcher.close();
      this.watcher = null;
      
      // Clear any pending timers
      this.debounceTimers.forEach(timer => clearTimeout(timer));
      this.debounceTimers.clear();
      this.syncQueue.clear();
      
      console.log('✅ File watcher stopped');
    }
  }

  /**
   * Debounce file sync operations to avoid rapid-fire updates
   */
  debounceSync(filePath, event) {
    // Clear existing timer for this file
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.handleFileChange(filePath, event);
      this.debounceTimers.delete(filePath);
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Handle file system changes
   */
  async handleFileChange(filePath, event) {
    try {
      const pathInfo = this.parseFilePath(filePath);
      if (!pathInfo) {
        return; // Not a file we care about
      }

      console.log(`📁 File ${event}: ${filePath}`);

      switch (event) {
        case 'add':
          await this.handleFileAdd(filePath, pathInfo);
          break;
        case 'change':
          await this.handleFileModify(filePath, pathInfo);
          break;
        case 'unlink':
          await this.handleFileRemove(filePath, pathInfo);
          break;
      }
    } catch (error) {
      console.error(`❌ Error handling file ${event} for ${filePath}:`, error.message);
    }
  }

  /**
   * Parse file path to extract user, brain, and file information
   */
  parseFilePath(filePath) {
    // Normalize path
    const relativePath = path.relative(STORAGE_BASE, filePath);
    const parts = relativePath.split(path.sep);

    // Expected structure: username/brains/brain-name/cards|files/filename
    // or username/brains/brain-name/files/covers/filename (ignore covers)
    if (parts.length < 4) {
      return null; // Not deep enough to be a card or file
    }

    const [username, brainsDir, brainName, fileType, ...fileNameParts] = parts;

    if (brainsDir !== 'brains' || !['cards', 'files'].includes(fileType)) {
      return null; // Not in the right directory structure
    }

    // Skip cover images - they are managed by EPUB processor, not file watcher
    if (fileType === 'files' && fileNameParts.length > 0 && fileNameParts[0] === 'covers') {
      return null; // Ignore files in covers subdirectory
    }

    const fileName = fileNameParts.join(path.sep);
    if (!fileName) {
      return null; // No filename
    }

    return {
      username,
      brainName,
      fileType, // 'cards' or 'files'
      fileName,
      fullPath: filePath
    };
  }

  /**
   * Handle new file added
   */
  async handleFileAdd(filePath, pathInfo) {
    try {
      // Get file stats
      const stats = await getFileStats(filePath);
      if (!stats || !stats.isFile()) {
        return;
      }

      // Check if this file type can be processed
      if (!cardProcessor.canProcess(filePath)) {
        console.log(`⚠️  File type not supported for processing: ${filePath}`);
        return;
      }

      // Find brain
      const brainResult = await query(`
        SELECT b.id, b.user_id 
        FROM brains b 
        JOIN users u ON b.user_id = u.id 
        WHERE u.username = $1 AND b.name = $2
      `, [pathInfo.username, pathInfo.brainName]);

      if (brainResult.rows.length === 0) {
        console.log(`⚠️  Brain not found: ${pathInfo.username}/${pathInfo.brainName}`);
        return;
      }

      const brainId = brainResult.rows[0].id;

      // Check if card already exists with this file path
      const existingCard = await Card.findByFilePath(filePath);
      if (existingCard) {
        console.log(`⚠️  Card already exists for file: ${filePath}`);
        return;
      }

      // Process file using card processor
      const result = await cardProcessor.processFile(filePath, brainId, {
        copyFile: false, // File is already in the right place
        updateExisting: true
      });

      if (result.success) {
        // Process links in the card content
        const content = await result.card.getContent();
        await linkParser.processCardLinks(result.card.id, content);
        console.log(`✅ Created card from file: ${result.card.title} (${result.action})`);
      } else {
        console.log(`⚠️  Failed to process file: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Failed to handle file add: ${error.message}`);
    }
  }

  /**
   * Handle file modification
   */
  async handleFileModify(filePath, pathInfo) {
    try {
      const stats = await getFileStats(filePath);
      if (!stats || !stats.isFile()) {
        return;
      }

      // Find existing card by file path
      const existingCard = await Card.findByFilePath(filePath);
      if (!existingCard) {
        console.log(`⚠️  No card found for modified file: ${filePath}`);
        return;
      }

      // Check if file has actually changed
      const hasChanged = await existingCard.hasFileChanged();
      if (!hasChanged) {
        return; // No actual content change
      }

      // Sync card with file
      const updated = await existingCard.syncWithFile();
      if (updated) {
        // Reprocess links since content changed
        const content = await existingCard.getContent();
        await linkParser.processCardLinks(existingCard.id, content);
        console.log(`✅ Updated card from file: ${existingCard.title}`);
      }
    } catch (error) {
      console.error(`❌ Failed to handle file modify: ${error.message}`);
    }
  }

  /**
   * Handle file removal
   */
  async handleFileRemove(filePath, pathInfo) {
    try {
      // Find existing card by file path
      const existingCard = await Card.findByFilePath(filePath);
      if (!existingCard) {
        console.log(`⚠️  No card found for removed file: ${filePath}`);
        return;
      }

      // Soft delete the card
      await existingCard.delete({ deleteFile: false });
      console.log(`✅ Marked card as inactive: ${existingCard.title}`);
    } catch (error) {
      console.error(`❌ Failed to handle file remove: ${error.message}`);
    }
  }

  /**
   * Handle directory addition (new brain creation)
   */
  async handleDirectoryAdd(dirPath) {
    try {
      const pathInfo = this.parseDirectoryPath(dirPath);
      if (pathInfo && pathInfo.isBrainDir) {
        console.log(`📂 New brain directory detected: ${pathInfo.username}/${pathInfo.brainName}`);
        // Brain creation will be handled by the API endpoints
        // This is just for logging/awareness
      }
    } catch (error) {
      console.error(`❌ Error handling directory add: ${error.message}`);
    }
  }

  /**
   * Handle directory removal
   */
  async handleDirectoryRemove(dirPath) {
    try {
      const pathInfo = this.parseDirectoryPath(dirPath);
      if (pathInfo && pathInfo.isBrainDir) {
        console.log(`📂 Brain directory removed: ${pathInfo.username}/${pathInfo.brainName}`);
        // Mark all cards in brain as inactive
        await query(`
          UPDATE cards 
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          FROM brains b, users u
          WHERE cards.brain_id = b.id 
            AND b.user_id = u.id
            AND u.username = $1 
            AND b.name = $2
        `, [pathInfo.username, pathInfo.brainName]);
      }
    } catch (error) {
      console.error(`❌ Error handling directory remove: ${error.message}`);
    }
  }

  /**
   * Parse directory path to determine if it's a brain directory
   */
  parseDirectoryPath(dirPath) {
    const relativePath = path.relative(STORAGE_BASE, dirPath);
    const parts = relativePath.split(path.sep);

    // Check if it's a brain directory: username/brains/brain-name
    if (parts.length === 3 && parts[1] === 'brains') {
      return {
        username: parts[0],
        brainName: parts[2],
        isBrainDir: true
      };
    }

    return null;
  }

  /**
   * Force sync a specific brain directory
   */
  async forceSyncBrain(username, brainName) {
    try {
      console.log(`🔄 Force syncing brain: ${username}/${brainName}`);
      
      // Find user first, then brain
      const userResult = await query('SELECT id FROM users WHERE username = $1', [username]);
      if (userResult.rows.length === 0) {
        throw new Error(`User not found: ${username}`);
      }
      
      const brain = await Brain.findByUserAndName(userResult.rows[0].id, brainName);
      if (!brain) {
        throw new Error(`Brain not found: ${username}/${brainName}`);
      }

      // Use card processor to sync all files in brain directory
      const results = await cardProcessor.processDirectory(brain.folderPath, brain.id, {
        recursive: true,
        updateExisting: true
      });

      // Process links for all successfully created/updated cards
      for (const result of results) {
        if (result.success && result.card) {
          const content = await result.card.getContent();
          await linkParser.processCardLinks(result.card.id, content);
        }
      }

      const successful = results.filter(r => r.success).length;
      console.log(`✅ Force sync completed for ${username}/${brainName}: ${successful}/${results.length} files processed`);
      
      return { filesProcessed: results.length, successful };
    } catch (error) {
      console.error(`❌ Force sync failed for ${username}/${brainName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get watcher status
   */
  getStatus() {
    return {
      isRunning: !!this.watcher,
      watchedPath: STORAGE_BASE,
      debounceMs: this.DEBOUNCE_MS,
      pendingOperations: this.debounceTimers.size,
      queuedSyncs: this.syncQueue.size
    };
  }
}

// Create singleton instance
const fileWatcher = new FileWatcher();

module.exports = fileWatcher;