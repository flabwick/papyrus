const Library = require('../../src/models/Library');
const { ensureAuthentication } = require('../utils/auth');

/**
 * Library CLI Commands
 */

/**
 * List user's libraries
 */
async function listLibraries() {
  const user = await ensureAuthentication();
  
  const libraries = await Library.findByUserId(user.id);
  return await Promise.all(libraries.map(library => library.toJSON()));
}

/**
 * Create a new library
 */
async function createLibrary(name) {
  const user = await ensureAuthentication();
  
  const library = await Library.create(user.id, name);
  return await library.toJSON();
}

/**
 * Delete a library
 */
async function deleteLibrary(name) {
  const user = await ensureAuthentication();
  
  const libraries = await Library.findByUserId(user.id);
  const library = libraries.find(b => b.name === name);
  
  if (!library) {
    throw new Error(`Library '${name}' not found`);
  }
  
  await library.delete();
  return { name, message: 'Library deleted successfully' };
}

/**
 * Sync a library's files
 */
async function syncLibrary(name) {
  const user = await ensureAuthentication();
  
  const libraries = await Library.findByUserId(user.id);
  const library = libraries.find(b => b.name === name);
  
  if (!library) {
    throw new Error(`Library '${name}' not found`);
  }
  
  const cardCount = await library.forceSync();
  return { 
    name, 
    cardCount,
    message: `Library synchronized successfully. ${cardCount} cards processed.`
  };
}

/**
 * Get library info
 */
async function getLibraryInfo(name) {
  const user = await ensureAuthentication();
  
  const libraries = await Library.findByUserId(user.id);
  const library = libraries.find(b => b.name === name);
  
  if (!library) {
    throw new Error(`Library '${name}' not found`);
  }
  
  return await library.toJSON();
}

module.exports = {
  listLibraries,
  createLibrary,
  deleteLibrary,
  syncLibrary,
  getLibraryInfo
};