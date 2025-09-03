const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * File System Management Module
 * Handles all file system operations with proper error handling and validation
 */

// Base storage path for all user data
const STORAGE_BASE = path.join(__dirname, '../../storage');

/**
 * Validates username for file system safety
 * @param {string} username - Username to validate
 * @returns {boolean} - True if valid
 */
function validateUsername(username) {
  if (!username || typeof username !== 'string') return false;
  
  // Only allow alphanumeric characters and hyphens, 3-20 chars
  const usernameRegex = /^[a-zA-Z0-9-]+$/;
  return usernameRegex.test(username) && username.length >= 3 && username.length <= 20;
}

/**
 * Validates library name for file system safety
 * @param {string} libraryName - Library name to validate
 * @returns {boolean} - True if valid
 */
function validateLibraryName(libraryName) {
  if (!libraryName || typeof libraryName !== 'string') return false;
  
  // Allow alphanumeric, hyphens, underscores, spaces (will convert to hyphens)
  const libraryNameRegex = /^[a-zA-Z0-9-_ ]+$/;
  return libraryNameRegex.test(libraryName) && libraryName.length >= 1 && libraryName.length <= 50;
}

/**
 * Sanitizes library name for file system use
 * @param {string} libraryName - Library name to sanitize
 * @returns {string} - Sanitized name safe for file system
 */
function sanitizeLibraryName(libraryName) {
  return libraryName
    .toLowerCase()
    .replace(/\s+/g, '-')  // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '')  // Remove any other characters
    .replace(/-+/g, '-')  // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');  // Remove leading/trailing hyphens
}

/**
 * Ensures a directory exists, creating it if necessary
 * @param {string} dirPath - Directory path to ensure exists
 * @returns {Promise<void>}
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.ensureDir(dirPath);
  } catch (error) {
    throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
  }
}

/**
 * Calculates SHA-256 hash of a file
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} - File hash
 */
async function calculateFileHash(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (error) {
    throw new Error(`Failed to calculate hash for ${filePath}: ${error.message}`);
  }
}

/**
 * Gets file stats safely
 * @param {string} filePath - Path to file
 * @returns {Promise<fs.Stats|null>} - File stats or null if doesn't exist
 */
async function getFileStats(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Creates user directory structure
 * @param {string} username - Username for directory
 * @returns {Promise<string>} - Path to created user directory
 */
async function createUserDirectory(username) {
  if (!validateUsername(username)) {
    throw new Error(`Invalid username: ${username}. Must be 3-20 alphanumeric characters or hyphens.`);
  }

  const userPath = path.join(STORAGE_BASE, username);
  const librariesPath = path.join(userPath, 'libraries');
  
  try {
    // Create user directory and libraries subdirectory
    await ensureDirectoryExists(librariesPath);
    
    // Create user config file
    const userConfig = {
      username,
      createdAt: new Date().toISOString(),
      storageQuota: 1073741824, // 1GB default
      version: '1.0'
    };
    
    const configPath = path.join(userPath, '.user-config.json');
    await fs.writeJson(configPath, userConfig, { spaces: 2 });
    
    console.log(`✅ Created user directory: ${userPath}`);
    return userPath;
  } catch (error) {
    throw new Error(`Failed to create user directory for ${username}: ${error.message}`);
  }
}

/**
 * Creates library directory structure within user directory
 * @param {string} username - Username
 * @param {string} libraryName - Library name
 * @returns {Promise<string>} - Path to created library directory
 */
async function createLibraryDirectory(username, libraryName) {
  if (!validateUsername(username)) {
    throw new Error(`Invalid username: ${username}`);
  }
  
  if (!validateLibraryName(libraryName)) {
    throw new Error(`Invalid library name: ${libraryName}. Must be 1-50 characters, alphanumeric, hyphens, underscores, or spaces.`);
  }

  const sanitizedLibraryName = sanitizeLibraryName(libraryName);
  if (!sanitizedLibraryName) {
    throw new Error(`Library name results in empty string after sanitization: ${libraryName}`);
  }

  const userPath = path.join(STORAGE_BASE, username);
  const libraryPath = path.join(userPath, 'libraries', sanitizedLibraryName);
  const cardsPath = path.join(libraryPath, 'cards');
  const filesPath = path.join(libraryPath, 'files');
  
  try {
    // Ensure user directory exists first
    await ensureDirectoryExists(path.join(userPath, 'libraries'));
    
    // Create library directory structure
    await ensureDirectoryExists(cardsPath);
    await ensureDirectoryExists(filesPath);
    
    // Create library config file
    const libraryConfig = {
      name: libraryName,
      sanitizedName: sanitizedLibraryName,
      username,
      createdAt: new Date().toISOString(),
      version: '1.0'
    };
    
    const configPath = path.join(libraryPath, '.library-config.json');
    await fs.writeJson(configPath, libraryConfig, { spaces: 2 });
    
    console.log(`✅ Created library directory: ${libraryPath}`);
    return libraryPath;
  } catch (error) {
    throw new Error(`Failed to create library directory for ${username}/${libraryName}: ${error.message}`);
  }
}

/**
 * Scans library directory for all files and returns metadata
 * @param {string} libraryPath - Path to library directory
 * @returns {Promise<Array>} - Array of file metadata objects
 */
async function scanLibraryFiles(libraryPath) {
  try {
    const files = [];
    
    if (!(await getFileStats(libraryPath))) {
      throw new Error(`Library directory does not exist: ${libraryPath}`);
    }
    
    // Scan cards directory
    const cardsPath = path.join(libraryPath, 'cards');
    if (await getFileStats(cardsPath)) {
      const cardFiles = await fs.readdir(cardsPath);
      for (const fileName of cardFiles) {
        if (fileName.startsWith('.')) continue; // Skip hidden files
        
        const filePath = path.join(cardsPath, fileName);
        const stats = await getFileStats(filePath);
        
        if (stats && stats.isFile()) {
          const hash = await calculateFileHash(filePath);
          
          files.push({
            name: fileName,
            path: filePath,
            type: 'card',
            size: stats.size,
            hash,
            lastModified: stats.mtime,
            created: stats.birthtime || stats.ctime
          });
        }
      }
    }
    
    // Scan files directory
    const filesPath = path.join(libraryPath, 'files');
    if (await getFileStats(filesPath)) {
      const uploadedFiles = await fs.readdir(filesPath);
      for (const fileName of uploadedFiles) {
        if (fileName.startsWith('.')) continue; // Skip hidden files
        
        const filePath = path.join(filesPath, fileName);
        const stats = await getFileStats(filePath);
        
        if (stats && stats.isFile()) {
          const hash = await calculateFileHash(filePath);
          
          files.push({
            name: fileName,
            path: filePath,
            type: 'file',
            size: stats.size,
            hash,
            lastModified: stats.mtime,
            created: stats.birthtime || stats.ctime
          });
        }
      }
    }
    
    return files;
  } catch (error) {
    throw new Error(`Failed to scan library files at ${libraryPath}: ${error.message}`);
  }
}

/**
 * Gets user's storage usage by scanning all library directories
 * @param {string} username - Username
 * @returns {Promise<number>} - Total storage used in bytes
 */
async function getUserStorageUsage(username) {
  if (!validateUsername(username)) {
    throw new Error(`Invalid username: ${username}`);
  }

  const userPath = path.join(STORAGE_BASE, username);
  
  try {
    let totalSize = 0;
    
    if (!(await getFileStats(userPath))) {
      return 0; // User directory doesn't exist
    }
    
    const librariesPath = path.join(userPath, 'libraries');
    if (await getFileStats(librariesPath)) {
      const libraryDirs = await fs.readdir(librariesPath);
      
      for (const libraryDir of libraryDirs) {
        if (libraryDir.startsWith('.')) continue;
        
        const libraryPath = path.join(librariesPath, libraryDir);
        const stats = await getFileStats(libraryPath);
        
        if (stats && stats.isDirectory()) {
          const files = await scanLibraryFiles(libraryPath);
          totalSize += files.reduce((sum, file) => sum + file.size, 0);
        }
      }
    }
    
    return totalSize;
  } catch (error) {
    throw new Error(`Failed to calculate storage usage for ${username}: ${error.message}`);
  }
}

/**
 * Deletes user directory (moves to archive)
 * @param {string} username - Username to delete
 * @returns {Promise<string>} - Path to archived directory
 */
async function archiveUserDirectory(username) {
  if (!validateUsername(username)) {
    throw new Error(`Invalid username: ${username}`);
  }

  const userPath = path.join(STORAGE_BASE, username);
  const archivePath = path.join(STORAGE_BASE, '.archived', `${username}-${Date.now()}`);
  
  try {
    if (!(await getFileStats(userPath))) {
      throw new Error(`User directory does not exist: ${userPath}`);
    }
    
    await ensureDirectoryExists(path.join(STORAGE_BASE, '.archived'));
    await fs.move(userPath, archivePath);
    
    console.log(`✅ Archived user directory: ${userPath} -> ${archivePath}`);
    return archivePath;
  } catch (error) {
    throw new Error(`Failed to archive user directory for ${username}: ${error.message}`);
  }
}

/**
 * Lists all user directories
 * @returns {Promise<Array>} - Array of username strings
 */
async function listUsers() {
  try {
    if (!(await getFileStats(STORAGE_BASE))) {
      return [];
    }
    
    const items = await fs.readdir(STORAGE_BASE);
    const users = [];
    
    for (const item of items) {
      if (item.startsWith('.')) continue; // Skip hidden directories like .archived
      
      const itemPath = path.join(STORAGE_BASE, item);
      const stats = await getFileStats(itemPath);
      
      if (stats && stats.isDirectory() && validateUsername(item)) {
        users.push(item);
      }
    }
    
    return users.sort();
  } catch (error) {
    throw new Error(`Failed to list users: ${error.message}`);
  }
}

/**
 * Lists all library directories for a user
 * @param {string} username - Username
 * @returns {Promise<Array>} - Array of library directory names
 */
async function listUserLibrarys(username) {
  if (!validateUsername(username)) {
    throw new Error(`Invalid username: ${username}`);
  }

  const librariesPath = path.join(STORAGE_BASE, username, 'libraries');
  
  try {
    if (!(await getFileStats(librariesPath))) {
      return [];
    }
    
    const items = await fs.readdir(librariesPath);
    const libraries = [];
    
    for (const item of items) {
      if (item.startsWith('.')) continue;
      
      const itemPath = path.join(librariesPath, item);
      const stats = await getFileStats(itemPath);
      
      if (stats && stats.isDirectory()) {
        libraries.push(item);
      }
    }
    
    return libraries.sort();
  } catch (error) {
    throw new Error(`Failed to list libraries for user ${username}: ${error.message}`);
  }
}

module.exports = {
  // Validation functions
  validateUsername,
  validateLibraryName,
  sanitizeLibraryName,
  
  // Core operations
  createUserDirectory,
  createLibraryDirectory,
  scanLibraryFiles,
  
  // Utility functions
  ensureDirectoryExists,
  calculateFileHash,
  getFileStats,
  getUserStorageUsage,
  
  // Management functions
  archiveUserDirectory,
  listUsers,
  listUserLibrarys,
  
  // Constants
  STORAGE_BASE
};