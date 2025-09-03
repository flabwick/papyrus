const { Command } = require('commander');
const chalk = require('chalk');
const Workspace = require('../../src/models/Workspace');
const WorkspacePage = require('../../src/models/WorkspacePage');
const Page = require('../../src/models/Page');
const Library = require('../../src/models/Library');
const WorkspaceManager = require('../../src/services/workspaceManager');
const { getCurrentUser } = require('../utils/auth');
const { formatTable, formatJson } = require('../utils/formatting');

/**
 * CLI Commands for Workspace Management
 */

const workspacesCommand = new Command('workspaces')
  .description('Manage workspaces in libraries');

/**
 * List workspaces in a library
 */
workspacesCommand
  .command('list')
  .description('List workspaces in a library')
  .option('-b, --library <name>', 'Library name (required)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use -b or --library option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        throw new Error(`Library '${options.library}' not found`);
      }

      const workspaces = await Workspace.findByLibraryId(library.id);
      
      if (options.json) {
        console.log(JSON.stringify(workspaces, null, 2));
      } else {
        if (workspaces.length === 0) {
          console.log(chalk.yellow('No workspaces found in library ' + options.library));
        } else {
          console.log(chalk.green(`Found ${workspaces.length} workspaces in library '${options.library}':`));
          console.log(formatTable(workspaces.map(workspace => ({
            Name: workspace.name,
            Favorited: workspace.isFavorited ? '⭐' : '',
            'Last Accessed': new Date(workspace.lastAccessedAt).toLocaleDateString(),
            Created: new Date(workspace.createdAt).toLocaleDateString()
          }))));
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Error listing workspaces:'), error.message);
      process.exit(1);
    }
  });

/**
 * Create a new workspace
 */
workspacesCommand
  .command('create')
  .description('Create a new workspace')
  .argument('<title>', 'Workspace title')
  .option('-b, --library <name>', 'Library name (required)')
  .option('--json', 'Output as JSON')
  .action(async (title, options) => {
    try {
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use -b or --library option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        throw new Error(`Library '${options.library}' not found`);
      }

      const workspace = await Workspace.create({
        libraryId: library.id,
        name: title,
        isFavorited: false
      });

      if (options.json) {
        console.log(JSON.stringify(workspace, null, 2));
      } else {
        console.log(chalk.green(`✅ Created workspace '${title}' in library '${options.library}'`));
      }
    } catch (error) {
      console.error(chalk.red('❌ Error creating workspace:'), error.message);
      process.exit(1);
    }
  });

/**
 * Delete a workspace
 */
workspacesCommand
  .command('delete')
  .description('Delete a workspace')
  .argument('<title>', 'Workspace title')
  .option('-b, --library <name>', 'Library name (required)')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (title, options) => {
    try {
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use -b or --library option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        throw new Error(`Library '${options.library}' not found`);
      }

      const workspace = await Workspace.findByLibraryAndName(library.id, title);
      if (!workspace) {
        throw new Error(`Workspace '${title}' not found in library '${options.library}'`);
      }

      if (!options.yes) {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise(resolve => {
          rl.question(`Delete workspace '${title}'? This cannot be undone. (y/N) `, resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log(chalk.yellow('Operation cancelled'));
          return;
        }
      }

      await Workspace.delete(workspace.id);
      console.log(chalk.green(`✅ Deleted workspace '${title}' from library '${options.library}'`));
    } catch (error) {
      console.error(chalk.red('❌ Error deleting workspace:'), error.message);
      process.exit(1);
    }
  });

/**
 * Show workspace details
 */
workspacesCommand
  .command('show')
  .description('Show workspace details and pages')
  .argument('<title>', 'Workspace title')
  .option('-b, --library <name>', 'Library name (required)')
  .option('--json', 'Output as JSON')
  .action(async (title, options) => {
    try {
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use -b or --library option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        throw new Error(`Library '${options.library}' not found`);
      }

      const workspace = await Workspace.findByLibraryAndName(library.id, title);
      if (!workspace) {
        throw new Error(`Workspace '${title}' not found in library '${options.library}'`);
      }

      const workspacePages = await WorkspacePage.findByWorkspaceId(workspace.id);
      
      if (options.json) {
        console.log(JSON.stringify({ workspace, pages: workspacePages }, null, 2));
      } else {
        console.log(chalk.green(`📄 Workspace: ${workspace.name}`));
        console.log(`   Library: ${options.library}`);
        console.log(`   Favorited: ${workspace.isFavorited ? '⭐ Yes' : 'No'}`);
        console.log(`   Created: ${new Date(workspace.createdAt).toLocaleDateString()}`);
        console.log(`   Last Accessed: ${new Date(workspace.lastAccessedAt).toLocaleDateString()}`);
        console.log(`   Pages: ${workspacePages.length}`);

        if (workspacePages.length > 0) {
          console.log(chalk.green('\n📝 Pages:'));
          console.log(formatTable(workspacePages.map((sc, index) => ({
            Position: index + 1,
            Title: sc.page?.title || 'Unknown',
            'AI Context': sc.isInAIContext ? '🤖' : '',
            Collapsed: sc.isCollapsed ? '📁' : '📂'
          }))));
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Error showing workspace:'), error.message);
      process.exit(1);
    }
  });

/**
 * Toggle favorite status
 */
workspacesCommand
  .command('favorite')
  .description('Toggle favorite status of a workspace')
  .argument('<title>', 'Workspace title')
  .option('-b, --library <name>', 'Library name (required)')
  .action(async (title, options) => {
    try {
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use -b or --library option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        throw new Error(`Library '${options.library}' not found`);
      }

      const workspace = await Workspace.findByLibraryAndName(library.id, title);
      if (!workspace) {
        throw new Error(`Workspace '${title}' not found in library '${options.library}'`);
      }

      const newFavoriteStatus = !workspace.isFavorited;
      await Workspace.update(workspace.id, { isFavorited: newFavoriteStatus });
      
      const status = newFavoriteStatus ? 'favorited' : 'unfavorited';
      const icon = newFavoriteStatus ? '⭐' : '';
      console.log(chalk.green(`✅ Workspace '${title}' ${status} ${icon}`));
    } catch (error) {
      console.error(chalk.red('❌ Error toggling favorite:'), error.message);
      process.exit(1);
    }
  });

module.exports = workspacesCommand;