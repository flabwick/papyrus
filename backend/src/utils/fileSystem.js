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
 * Validates brain name for file system safety
 * @param {string} brainName - Brain name to validate
 * @returns {boolean} - True if valid
 */
function validateBrainName(brainName) {
  if (!brainName || typeof brainName !== 'string') return false;
  
  // Allow alphanumeric, hyphens, underscores, spaces (will convert to hyphens)
  const brainNameRegex = /^[a-zA-Z0-9-_ ]+$/;
  return brainNameRegex.test(brainName) && brainName.length >= 1 && brainName.length <= 50;
}

/**
 * Sanitizes brain name for file system use
 * @param {string} brainName - Brain name to sanitize
 * @returns {string} - Sanitized name safe for file system
 */
function sanitizeBrainName(brainName) {
  return brainName
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
  const brainsPath = path.join(userPath, 'brains');
  
  try {
    // Create user directory and brains subdirectory
    await ensureDirectoryExists(brainsPath);
    
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
 * Creates brain directory structure within user directory
 * @param {string} username - Username
 * @param {string} brainName - Brain name
 * @returns {Promise<string>} - Path to created brain directory
 */
async function createBrainDirectory(username, brainName) {
  if (!validateUsername(username)) {
    throw new Error(`Invalid username: ${username}`);
  }
  
  if (!validateBrainName(brainName)) {
    throw new Error(`Invalid brain name: ${brainName}. Must be 1-50 characters, alphanumeric, hyphens, underscores, or spaces.`);
  }

  const sanitizedBrainName = sanitizeBrainName(brainName);
  if (!sanitizedBrainName) {
    throw new Error(`Brain name results in empty string after sanitization: ${brainName}`);
  }

  const userPath = path.join(STORAGE_BASE, username);
  const brainPath = path.join(userPath, 'brains', sanitizedBrainName);
  const cardsPath = path.join(brainPath, 'cards');
  const filesPath = path.join(brainPath, 'files');
  
  try {
    // Ensure user directory exists first
    await ensureDirectoryExists(path.join(userPath, 'brains'));
    
    // Create brain directory structure
    await ensureDirectoryExists(cardsPath);
    await ensureDirectoryExists(filesPath);
    
    // Create brain config file
    const brainConfig = {
      name: brainName,
      sanitizedName: sanitizedBrainName,
      username,
      createdAt: new Date().toISOString(),
      version: '1.0'
    };
    
    const configPath = path.join(brainPath, '.brain-config.json');
    await fs.writeJson(configPath, brainConfig, { spaces: 2 });
    
    console.log(`✅ Created brain directory: ${brainPath}`);
    return brainPath;
  } catch (error) {
    throw new Error(`Failed to create brain directory for ${username}/${brainName}: ${error.message}`);
  }
}

/**
 * Scans brain directory for all files and returns metadata
 * @param {string} brainPath - Path to brain directory
 * @returns {Promise<Array>} - Array of file metadata objects
 */
async function scanBrainFiles(brainPath) {
  try {
    const files = [];
    
    if (!(await getFileStats(brainPath))) {
      throw new Error(`Brain directory does not exist: ${brainPath}`);
    }
    
    // Scan cards directory
    const cardsPath = path.join(brainPath, 'cards');
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
    const filesPath = path.join(brainPath, 'files');
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
    throw new Error(`Failed to scan brain files at ${brainPath}: ${error.message}`);
  }
}

/**
 * Gets user's storage usage by scanning all brain directories
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
    
    const brainsPath = path.join(userPath, 'brains');
    if (await getFileStats(brainsPath)) {
      const brainDirs = await fs.readdir(brainsPath);
      
      for (const brainDir of brainDirs) {
        if (brainDir.startsWith('.')) continue;
        
        const brainPath = path.join(brainsPath, brainDir);
        const stats = await getFileStats(brainPath);
        
        if (stats && stats.isDirectory()) {
          const files = await scanBrainFiles(brainPath);
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
 * Lists all brain directories for a user
 * @param {string} username - Username
 * @returns {Promise<Array>} - Array of brain directory names
 */
async function listUserBrains(username) {
  if (!validateUsername(username)) {
    throw new Error(`Invalid username: ${username}`);
  }

  const brainsPath = path.join(STORAGE_BASE, username, 'brains');
  
  try {
    if (!(await getFileStats(brainsPath))) {
      return [];
    }
    
    const items = await fs.readdir(brainsPath);
    const brains = [];
    
    for (const item of items) {
      if (item.startsWith('.')) continue;
      
      const itemPath = path.join(brainsPath, item);
      const stats = await getFileStats(itemPath);
      
      if (stats && stats.isDirectory()) {
        brains.push(item);
      }
    }
    
    return brains.sort();
  } catch (error) {
    throw new Error(`Failed to list brains for user ${username}: ${error.message}`);
  }
}

module.exports = {
  // Validation functions
  validateUsername,
  validateBrainName,
  sanitizeBrainName,
  
  // Core operations
  createUserDirectory,
  createBrainDirectory,
  scanBrainFiles,
  
  // Utility functions
  ensureDirectoryExists,
  calculateFileHash,
  getFileStats,
  getUserStorageUsage,
  
  // Management functions
  archiveUserDirectory,
  listUsers,
  listUserBrains,
  
  // Constants
  STORAGE_BASE
};