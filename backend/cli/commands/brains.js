const Brain = require('../../src/models/Brain');
const { ensureAuthentication } = require('../utils/auth');

/**
 * Brain CLI Commands
 */

/**
 * List user's brains
 */
async function listBrains() {
  const user = await ensureAuthentication();
  
  const brains = await Brain.findByUserId(user.id);
  return await Promise.all(brains.map(brain => brain.toJSON()));
}

/**
 * Create a new brain
 */
async function createBrain(name) {
  const user = await ensureAuthentication();
  
  const brain = await Brain.create(user.id, name);
  return await brain.toJSON();
}

/**
 * Delete a brain
 */
async function deleteBrain(name) {
  const user = await ensureAuthentication();
  
  const brain = await Brain.findByUserAndName(user.id, name);
  if (!brain) {
    throw new Error(`Brain '${name}' not found`);
  }
  
  await brain.delete();
  return { name, deleted: true };
}

/**
 * Get brain details
 */
async function getBrainDetails(name) {
  const user = await ensureAuthentication();
  
  const brain = await Brain.findByUserAndName(user.id, name);
  if (!brain) {
    throw new Error(`Brain '${name}' not found`);
  }
  
  const result = await brain.toJSON();
  
  // Get cards in brain
  const cards = await brain.getCards();
  result.cards = cards.map(card => ({
    id: card.id,
    title: card.title,
    filePath: card.file_path,
    fileSize: card.file_size,
    lastModified: card.last_modified,
    isActive: card.is_active,
    createdAt: card.created_at,
    updatedAt: card.updated_at
  }));
  
  return result;
}

/**
 * Sync a brain with file system
 */
async function syncBrain(name) {
  const user = await ensureAuthentication();
  
  const brain = await Brain.findByUserAndName(user.id, name);
  if (!brain) {
    throw new Error(`Brain '${name}' not found`);
  }
  
  const cardCount = await brain.forceSync();
  
  return {
    name: brain.name,
    filesProcessed: cardCount,
    lastSyncedAt: new Date().toISOString()
  };
}

module.exports = {
  listBrains,
  createBrain,
  deleteBrain,
  getBrainDetails,
  syncBrain
};