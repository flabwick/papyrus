const Brain = require('../../src/models/Brain');
const { ensureAuthentication } = require('../utils/auth');

/**
 * Sync CLI Commands
 */

/**
 * Sync a specific brain
 */
async function syncBrain(brainName) {
  const user = await ensureAuthentication();
  
  const brain = await Brain.findByUserAndName(user.id, brainName);
  if (!brain) {
    throw new Error(`Brain '${brainName}' not found`);
  }
  
  const filesProcessed = await brain.forceSync();
  
  return {
    brainName: brain.name,
    filesProcessed,
    syncedAt: new Date().toISOString()
  };
}

/**
 * Sync all user's brains
 */
async function syncAll() {
  const user = await ensureAuthentication();
  
  const brains = await Brain.findByUserId(user.id);
  let totalFilesProcessed = 0;
  
  for (const brain of brains) {
    try {
      const filesProcessed = await brain.forceSync();
      totalFilesProcessed += filesProcessed;
    } catch (error) {
      console.error(`Failed to sync brain '${brain.name}': ${error.message}`);
    }
  }
  
  return {
    brainsProcessed: brains.length,
    filesProcessed: totalFilesProcessed,
    syncedAt: new Date().toISOString()
  };
}

/**
 * Get sync status for all brains
 */
async function getSyncStatus() {
  const user = await ensureAuthentication();
  
  const brains = await Brain.findByUserId(user.id);
  const status = [];
  
  for (const brain of brains) {
    const brainData = await brain.toJSON();
    
    // Check if any files are out of sync
    const { scanBrainFiles } = require('../../src/utils/fileSystem');
    const fsFiles = await scanBrainFiles(brain.folderPath);
    const dbCards = await brain.getCards();
    
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
      ...brainData,
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
  
  // Get all users and sync their brains
  const User = require('../../src/models/User');
  const users = await User.findAll();
  
  let totalSynced = 0;
  
  for (const user of users) {
    const brains = await Brain.findByUserId(user.id);
    
    for (const brain of brains) {
      try {
        await fileWatcher.forceSyncBrain(user.username, brain.name);
        totalSynced++;
      } catch (error) {
        console.error(`Failed to sync ${user.username}/${brain.name}: ${error.message}`);
      }
    }
  }
  
  return {
    totalBrainsSynced: totalSynced,
    syncedAt: new Date().toISOString()
  };
}

module.exports = {
  syncBrain,
  syncAll,
  getSyncStatus,
  forceSyncWatcher
};