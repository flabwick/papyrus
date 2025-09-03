const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs-extra');
const { STORAGE_BASE, calculateFileHash, getFileStats } = require('../utils/fileSystem');
const { query } = require('../models/database');
const Library = require('../models/Library');
const Page = require('../models/Page');
const pageProcessor = require('./pageProcessor');
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
   * Parse file path to extract user, library, and file information
   */
  parseFilePath(filePath) {
    // Normalize path
    const relativePath = path.relative(STORAGE_BASE, filePath);
    const parts = relativePath.split(path.sep);

    // Expected structure: username/libraries/library-name/pages|files/filename
    // or username/libraries/library-name/files/covers/filename (ignore covers)
    if (parts.length < 4) {
      return null; // Not deep enough to be a page or file
    }

    const [username, librariesDir, libraryName, fileType, ...fileNameParts] = parts;

    if (librariesDir !== 'libraries' || !['pages', 'files'].includes(fileType)) {
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
      libraryName,
      fileType, // 'pages' or 'files'
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
      if (!pageProcessor.canProcess(filePath)) {
        console.log(`⚠️  File type not supported for processing: ${filePath}`);
        return;
      }

      // Find library
      const libraryResult = await query(`
        SELECT b.id, b.user_id 
        FROM libraries b 
        JOIN users u ON b.user_id = u.id 
        WHERE u.username = $1 AND b.name = $2
      `, [pathInfo.username, pathInfo.libraryName]);

      if (libraryResult.rows.length === 0) {
        console.log(`⚠️  Library not found: ${pathInfo.username}/${pathInfo.libraryName}`);
        return;
      }

      const libraryId = libraryResult.rows[0].id;

      // Check if page already exists with this file path
      const existingPage = await Page.findByFilePath(filePath);
      if (existingPage) {
        console.log(`⚠️  Page already exists for file: ${filePath}`);
        return;
      }

      // Process file using page processor
      const result = await pageProcessor.processFile(filePath, libraryId, {
        copyFile: false, // File is already in the right place
        updateExisting: true
      });

      if (result.success) {
        // Process links in the page content
        const content = await result.page.getContent();
        await linkParser.processPageLinks(result.page.id, content);
        console.log(`✅ Created page from file: ${result.page.title} (${result.action})`);
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

      // Find existing page by file path
      const existingPage = await Page.findByFilePath(filePath);
      if (!existingPage) {
        console.log(`⚠️  No page found for modified file: ${filePath}`);
        return;
      }

      // Check if file has actually changed
      const hasChanged = await existingPage.hasFileChanged();
      if (!hasChanged) {
        return; // No actual content change
      }

      // Sync page with file
      const updated = await existingPage.syncWithFile();
      if (updated) {
        // Reprocess links since content changed
        const content = await existingPage.getContent();
        await linkParser.processPageLinks(existingPage.id, content);
        console.log(`✅ Updated page from file: ${existingPage.title}`);
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
      // Find existing page by file path
      const existingPage = await Page.findByFilePath(filePath);
      if (!existingPage) {
        console.log(`⚠️  No page found for removed file: ${filePath}`);
        return;
      }

      // Soft delete the page
      await existingPage.delete({ deleteFile: false });
      console.log(`✅ Marked page as inactive: ${existingPage.title}`);
    } catch (error) {
      console.error(`❌ Failed to handle file remove: ${error.message}`);
    }
  }

  /**
   * Handle directory addition (new library creation)
   */
  async handleDirectoryAdd(dirPath) {
    try {
      const pathInfo = this.parseDirectoryPath(dirPath);
      if (pathInfo && pathInfo.isLibraryDir) {
        console.log(`📂 New library directory detected: ${pathInfo.username}/${pathInfo.libraryName}`);
        // Library creation will be handled by the API endpoints
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
      if (pathInfo && pathInfo.isLibraryDir) {
        console.log(`📂 Library directory removed: ${pathInfo.username}/${pathInfo.libraryName}`);
        // Mark all pages in library as inactive
        await query(`
          UPDATE pages 
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          FROM libraries b, users u
          WHERE pages.library_id = b.id 
            AND b.user_id = u.id
            AND u.username = $1 
            AND b.name = $2
        `, [pathInfo.username, pathInfo.libraryName]);
      }
    } catch (error) {
      console.error(`❌ Error handling directory remove: ${error.message}`);
    }
  }

  /**
   * Parse directory path to determine if it's a library directory
   */
  parseDirectoryPath(dirPath) {
    const relativePath = path.relative(STORAGE_BASE, dirPath);
    const parts = relativePath.split(path.sep);

    // Check if it's a library directory: username/libraries/library-name
    if (parts.length === 3 && parts[1] === 'libraries') {
      return {
        username: parts[0],
        libraryName: parts[2],
        isLibraryDir: true
      };
    }

    return null;
  }

  /**
   * Force sync a specific library directory
   */
  async forceSyncLibrary(username, libraryName) {
    try {
      console.log(`🔄 Force syncing library: ${username}/${libraryName}`);
      
      // Find user first, then library
      const userResult = await query('SELECT id FROM users WHERE username = $1', [username]);
      if (userResult.rows.length === 0) {
        throw new Error(`User not found: ${username}`);
      }
      
      const library = await Library.findByUserAndName(userResult.rows[0].id, libraryName);
      if (!library) {
        throw new Error(`Library not found: ${username}/${libraryName}`);
      }

      // Use page processor to sync all files in library directory
      const results = await pageProcessor.processDirectory(library.folderPath, library.id, {
        recursive: true,
        updateExisting: true
      });

      // Process links for all successfully created/updated pages
      for (const result of results) {
        if (result.success && result.page) {
          const content = await result.page.getContent();
          await linkParser.processPageLinks(result.page.id, content);
        }
      }

      const successful = results.filter(r => r.success).length;
      console.log(`✅ Force sync completed for ${username}/${libraryName}: ${successful}/${results.length} files processed`);
      
      return { filesProcessed: results.length, successful };
    } catch (error) {
      console.error(`❌ Force sync failed for ${username}/${libraryName}:`, error.message);
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