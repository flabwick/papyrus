#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Import CLI utilities
const { ensureAuthentication, saveAuthToken, clearAuthToken, getCurrentUser } = require('./utils/auth');
const { formatTable, formatJson, colorize } = require('./utils/formatting');

// Import command modules
const adminCommands = require('./commands/admin');
const brainCommands = require('./commands/brains');
const cardCommands = require('./commands/cards');
const streamCommands = require('./commands/streams');
const syncCommands = require('./commands/sync');

const program = new Command();

// CLI Configuration
program
  .name('clarity')
  .description('Clarity Knowledge Management System CLI')
  .version('1.0.0');

// Global options
program
  .option('-v, --verbose', 'Enable verbose output')
  .option('--json', 'Output results in JSON format')
  .option('--no-color', 'Disable colored output');

// Authentication commands
program
  .command('login')
  .description('Authenticate with Clarity')
  .argument('<username>', 'Username to login with')
  .option('-p, --password <password>', 'Password (will prompt if not provided)')
  .action(async (username, options) => {
    try {
      const { loginUser } = require('./utils/auth');
      await loginUser(username, options.password);
    } catch (error) {
      console.error(colorize.error(`❌ Login failed: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('logout')
  .description('Logout from Clarity')
  .action(async () => {
    try {
      await clearAuthToken();
      console.log(colorize.success('✅ Logged out successfully'));
    } catch (error) {
      console.error(colorize.error(`❌ Logout failed: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('whoami')
  .description('Show current authenticated user')
  .action(async () => {
    try {
      const user = await getCurrentUser();
      if (user) {
        if (program.opts().json) {
          console.log(JSON.stringify(user, null, 2));
        } else {
          console.log(colorize.info(`👤 Logged in as: ${user.username}`));
          console.log(`   User ID: ${user.id}`);
          console.log(`   Storage: ${formatBytes(user.storageUsed)} / ${formatBytes(user.storageQuota)} (${user.storageUsagePercentage}%)`);
        }
      } else {
        console.log(colorize.warning('⚠️  Not logged in'));
        process.exit(1);
      }
    } catch (error) {
      console.error(colorize.error(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

// Admin commands (requires admin privileges)
const admin = program
  .command('admin')
  .description('Administrative commands');

admin
  .command('create-user')
  .description('Create a new user')
  .argument('<username>', 'Username for new user')
  .argument('<password>', 'Password for new user')
  .option('-q, --quota <bytes>', 'Storage quota in bytes', '1073741824') // 1GB default
  .action(async (username, password, options) => {
    try {
      await ensureAuthentication();
      const result = await adminCommands.createUser(username, password, parseInt(options.quota));
      
      if (program.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(colorize.success(`✅ Created user: ${result.username}`));
        console.log(`   User ID: ${result.id}`);
        console.log(`   Storage Quota: ${formatBytes(result.storageQuota)}`);
      }
    } catch (error) {
      console.error(colorize.error(`❌ Failed to create user: ${error.message}`));
      process.exit(1);
    }
  });

admin
  .command('delete-user')
  .description('Delete a user')
  .argument('<username>', 'Username to delete')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (username, options) => {
    try {
      await ensureAuthentication();
      
      if (!options.yes) {
        const { confirmAction } = require('./utils/prompts');
        const confirmed = await confirmAction(`Are you sure you want to delete user '${username}'? This action cannot be undone.`);
        if (!confirmed) {
          console.log(colorize.info('Operation cancelled'));
          return;
        }
      }
      
      await adminCommands.deleteUser(username);
      console.log(colorize.success(`✅ Deleted user: ${username}`));
    } catch (error) {
      console.error(colorize.error(`❌ Failed to delete user: ${error.message}`));
      process.exit(1);
    }
  });

admin
  .command('list-users')
  .description('List all users')
  .action(async () => {
    try {
      await ensureAuthentication();
      const users = await adminCommands.listUsers();
      
      if (program.opts().json) {
        console.log(JSON.stringify(users, null, 2));
      } else {
        if (users.length === 0) {
          console.log(colorize.info('No users found'));
        } else {
          console.log(colorize.info(`Found ${users.length} users:`));
          console.log(formatTable(users.map(user => ({
            Username: user.username,
            'User ID': user.id.substring(0, 8) + '...',
            Storage: `${formatBytes(user.storageUsed)} / ${formatBytes(user.storageQuota)}`,
            'Usage %': `${user.storageUsagePercentage}%`,
            Created: new Date(user.createdAt).toLocaleDateString()
          }))));
        }
      }
    } catch (error) {
      console.error(colorize.error(`❌ Failed to list users: ${error.message}`));
      process.exit(1);
    }
  });

admin
  .command('reset-password')
  .description('Reset user password')
  .argument('<username>', 'Username to reset password for')
  .argument('<newPassword>', 'New password')
  .action(async (username, newPassword) => {
    try {
      await ensureAuthentication();
      await adminCommands.resetPassword(username, newPassword);
      console.log(colorize.success(`✅ Reset password for user: ${username}`));
    } catch (error) {
      console.error(colorize.error(`❌ Failed to reset password: ${error.message}`));
      process.exit(1);
    }
  });

// Brain commands
const brains = program
  .command('brains')
  .description('Brain management commands');

brains
  .command('list')
  .description('List user brains')
  .action(async () => {
    try {
      await ensureAuthentication();
      const brains = await brainCommands.listBrains();
      
      if (program.opts().json) {
        console.log(JSON.stringify(brains, null, 2));
      } else {
        if (brains.length === 0) {
          console.log(colorize.info('No brains found'));
        } else {
          console.log(colorize.info(`Found ${brains.length} brains:`));
          console.log(formatTable(brains.map(brain => ({
            Name: brain.name,
            Cards: brain.cardCount,
            Storage: formatBytes(brain.storageUsed),
            'Last Sync': brain.lastScannedAt ? new Date(brain.lastScannedAt).toLocaleDateString() : 'Never',
            Created: new Date(brain.createdAt).toLocaleDateString()
          }))));
        }
      }
    } catch (error) {
      console.error(colorize.error(`❌ Failed to list brains: ${error.message}`));
      process.exit(1);
    }
  });

brains
  .command('create')
  .description('Create a new brain')
  .argument('<name>', 'Name for the new brain')
  .action(async (name) => {
    try {
      await ensureAuthentication();
      const brain = await brainCommands.createBrain(name);
      
      if (program.opts().json) {
        console.log(JSON.stringify(brain, null, 2));
      } else {
        console.log(colorize.success(`✅ Created brain: ${brain.name}`));
        console.log(`   Brain ID: ${brain.id}`);
        console.log(`   Folder Path: ${brain.folderPath}`);
      }
    } catch (error) {
      console.error(colorize.error(`❌ Failed to create brain: ${error.message}`));
      process.exit(1);
    }
  });

brains
  .command('delete')
  .description('Delete a brain')
  .argument('<name>', 'Name of brain to delete')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (name, options) => {
    try {
      await ensureAuthentication();
      
      if (!options.yes) {
        const { confirmAction } = require('./utils/prompts');
        const confirmed = await confirmAction(`Are you sure you want to delete brain '${name}'? This action cannot be undone.`);
        if (!confirmed) {
          console.log(colorize.info('Operation cancelled'));
          return;
        }
      }
      
      await brainCommands.deleteBrain(name);
      console.log(colorize.success(`✅ Deleted brain: ${name}`));
    } catch (error) {
      console.error(colorize.error(`❌ Failed to delete brain: ${error.message}`));
      process.exit(1);
    }
  });

// Card commands
program.addCommand(cardCommands);

// Stream commands
program.addCommand(streamCommands);

// Sync commands
program
  .command('sync')
  .description('Force sync file system with database')
  .option('-b, --brain <name>', 'Sync specific brain only')
  .action(async (options) => {
    try {
      await ensureAuthentication();
      
      if (options.brain) {
        const result = await syncCommands.syncBrain(options.brain);
        console.log(colorize.success(`✅ Synced brain '${options.brain}': ${result.filesProcessed} files processed`));
      } else {
        const result = await syncCommands.syncAll();
        console.log(colorize.success(`✅ Synced all brains: ${result.brainsProcessed} brains, ${result.filesProcessed} files processed`));
      }
    } catch (error) {
      console.error(colorize.error(`❌ Sync failed: ${error.message}`));
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show system status')
  .action(async () => {
    try {
      const { healthCheck, checkTables } = require('../src/models/database');
      const fileWatcher = require('../src/services/fileWatcher');
      
      const dbHealth = await healthCheck();
      const tableStatus = await checkTables();
      const watcherStatus = fileWatcher.getStatus();
      
      if (program.opts().json) {
        console.log(JSON.stringify({
          database: { healthy: dbHealth, tables: tableStatus },
          fileWatcher: watcherStatus
        }, null, 2));
      } else {
        console.log(colorize.info('🏥 System Status:'));
        console.log(`   Database: ${dbHealth ? colorize.success('✅ Healthy') : colorize.error('❌ Unhealthy')}`);
        console.log(`   Tables: ${tableStatus.allExist ? colorize.success('✅ All present') : colorize.warning('⚠️  Missing tables')}`);
        console.log(`   File Watcher: ${watcherStatus.isRunning ? colorize.success('✅ Running') : colorize.error('❌ Stopped')}`);
        
        if (watcherStatus.isRunning) {
          console.log(`   Watched Path: ${watcherStatus.watchedPath}`);
          console.log(`   Pending Ops: ${watcherStatus.pendingOperations}`);
        }
      }
    } catch (error) {
      console.error(colorize.error(`❌ Status check failed: ${error.message}`));
      process.exit(1);
    }
  });

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error(colorize.error('❌ Uncaught Exception:'), error.message);
  if (program.opts().verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(colorize.error('❌ Unhandled Rejection:'), reason);
  if (program.opts().verbose) {
    console.error(promise);
  }
  process.exit(1);
});

// Parse command line arguments
program.parseAsync(process.argv).catch(error => {
  console.error(colorize.error(`❌ CLI Error: ${error.message}`));
  if (program.opts().verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});