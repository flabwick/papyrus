const Library = require('../../src/models/Library');
const { ensureAuthentication } = require('../utils/auth');

/**
 * Sync CLI Commands
 */

/**
 * Sync a specific library
 */
async function syncLibrary(libraryName) {
  const user = await ensureAuthentication();
  
  const library = await Library.findByUserAndName(user.id, libraryName);
  if (!library) {
    throw new Error(`Library '${libraryName}' not found`);
  }
  
  const filesProcessed = await library.forceSync();
  
  return {
    libraryName: library.name,
    filesProcessed,
    syncedAt: new Date().toISOString()
  };
}

/**
 * Sync all user's libraries
 */
async function syncAll() {
  const user = await ensureAuthentication();
  
  const libraries = await Library.findByUserId(user.id);
  let totalFilesProcessed = 0;
  
  for (const library of libraries) {
    try {
      const filesProcessed = await library.forceSync();
      totalFilesProcessed += filesProcessed;
    } catch (error) {
      console.error(`Failed to sync library '${library.name}': ${error.message}`);
    }
  }
  
  return {
    librariesProcessed: libraries.length,
    filesProcessed: totalFilesProcessed,
    syncedAt: new Date().toISOString()
  };
}

/**
 * Get sync status for all libraries
 */
async function getSyncStatus() {
  const user = await ensureAuthentication();
  
  const libraries = await Library.findByUserId(user.id);
  const status = [];
  
  for (const library of libraries) {
    const libraryData = await library.toJSON();
    
    // Check if any files are out of sync
    const { scanLibraryFiles } = require('../../src/utils/fileSystem');
    const fsFiles = await scanLibraryFiles(library.folderPath);
    const dbCards = await library.getCards();
    
    const filesOutOfSync = [];
    const missingCards = [];
    
    // Check for files not in database
    for (const fsFile of fsFiles) {
      const cardTitle = require('path').parse(fsFile.name).name;
      const dbCard = dbCards.find(card => card.title === cardTitle);
      
      if (!dbCard) {
        missingCards.push(cardTitle);
      } else if (dbCard.file_hash !== fsFile.hash) {
        filesOutOfSync.push(cardTitle);
      }
    }
    
    // Check for database cards without files
    const orphanedCards = dbCards.filter(card => 
      card.file_path && !fsFiles.some(file => file.path === card.file_path)
    ).map(card => card.title);
    
    status.push({
      ...libraryData,
      syncStatus: {
        totalFsFiles: fsFiles.length,
        totalDbCards: dbCards.length,
        filesOutOfSync: filesOutOfSync.length,
        missingCards: missingCards.length,
        orphanedCards: orphanedCards.length,
        needsSync: filesOutOfSync.length > 0 || missingCards.length > 0 || orphanedCards.length > 0,
        details: {
          filesOutOfSync,
          missingCards,
          orphanedCards
        }
      }
    });
  }
  
  return status;
}

/**
 * Force sync file system watcher
 */
async function forceSyncWatcher() {
  await ensureAuthentication();
  
  const fileWatcher = require('../../src/services/fileWatcher');
  
  if (!fileWatcher.getStatus().isRunning) {
    throw new Error('File watcher is not running');
  }
  
  // Get all users and sync their libraries
  const User = require('../../src/models/User');
  const users = await User.findAll();
  
  let totalSynced = 0;
  
  for (const user of users) {
    const libraries = await Library.findByUserId(user.id);
    
    for (const library of libraries) {
      try {
        await fileWatcher.forceSyncLibrary(user.username, library.name);
        totalSynced++;
      } catch (error) {
        console.error(`Failed to sync ${user.username}/${library.name}: ${error.message}`);
      }
    }
  }
  
  return {
    totalLibrarysSynced: totalSynced,
    syncedAt: new Date().toISOString()
  };
}

module.exports = {
  syncLibrary,
  syncAll,
  getSyncStatus,
  forceSyncWatcher
};