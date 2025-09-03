const User = require('../../src/models/User');
const { ensureAdminAuthentication } = require('../utils/auth');

/**
 * Admin CLI Commands
 */

/**
 * Create a new user
 */
async function createUser(username, password, storageQuota = 1073741824) {
  await ensureAdminAuthentication();
  
  const user = await User.create(username, password, storageQuota);
  return user.toJSON();
}

/**
 * Delete a user
 */
async function deleteUser(username) {
  await ensureAdminAuthentication();
  
  const user = await User.findByUsername(username);
  if (!user) {
    throw new Error(`User '${username}' not found`);
  }
  
  await user.delete();
  return { username, deleted: true };
}

/**
 * List all users
 */
async function listUsers() {
  await ensureAdminAuthentication();
  
  const users = await User.findAll();
  return users.map(user => user.toJSON());
}

/**
 * Reset user password
 */
async function resetPassword(username, newPassword) {
  await ensureAdminAuthentication();
  
  const user = await User.findByUsername(username);
  if (!user) {
    throw new Error(`User '${username}' not found`);
  }
  
  await user.updatePassword(newPassword);
  return { username, passwordReset: true };
}

/**
 * Get user details
 */
async function getUserDetails(username) {
  await ensureAdminAuthentication();
  
  const user = await User.findByUsername(username);
  if (!user) {
    throw new Error(`User '${username}' not found`);
  }
  
  // Get user's libraries
  const Library = require('../../src/models/Library');
  const libraries = await Library.findByUserId(user.id);
  
  const result = user.toJSON();
  result.libraries = await Promise.all(libraries.map(library => library.toJSON()));
  
  return result;
}

/**
 * Update user storage quota
 */
async function updateUserQuota(username, newQuota) {
  await ensureAdminAuthentication();
  
  const user = await User.findByUsername(username);
  if (!user) {
    throw new Error(`User '${username}' not found`);
  }
  
  const { query } = require('../../src/models/database');
  await query(
    'UPDATE users SET storage_quota = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newQuota, user.id]
  );
  
  return { username, newQuota, updated: true };
}

module.exports = {
  createUser,
  deleteUser,
  listUsers,
  resetPassword,
  getUserDetails,
  updateUserQuota
};