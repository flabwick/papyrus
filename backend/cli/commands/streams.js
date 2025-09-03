const { Command } = require('commander');
const chalk = require('chalk');
const Stream = require('../../src/models/Stream');
const StreamCard = require('../../src/models/StreamCard');
const Card = require('../../src/models/Card');
const Brain = require('../../src/models/Brain');
const StreamManager = require('../../src/services/streamManager');
const { getCurrentUser } = require('../utils/auth');
const { formatTable, formatJson } = require('../utils/formatting');

/**
 * CLI Commands for Stream Management
 */

const streamsCommand = new Command('streams')
  .description('Manage streams in brains');

/**
 * List streams in a brain
 */
streamsCommand
  .command('list')
  .description('List streams in a brain')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use -b or --brain option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        throw new Error(`Brain '${options.brain}' not found`);
      }

      const streams = await Stream.findByBrainId(brain.id);
      
      if (options.json) {
        console.log(JSON.stringify(streams, null, 2));
      } else {
        if (streams.length === 0) {
          console.log(chalk.yellow('No streams found in brain ' + options.brain));
        } else {
          console.log(chalk.green(`Found ${streams.length} streams in brain '${options.brain}':`));
          console.log(formatTable(streams.map(stream => ({
            Name: stream.title,
            Favorited: stream.isFavorited ? '⭐' : '',
            'Last Accessed': new Date(stream.lastAccessedAt).toLocaleDateString(),
            Created: new Date(stream.createdAt).toLocaleDateString()
          }))));
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Error listing streams:'), error.message);
      process.exit(1);
    }
  });

/**
 * Create a new stream
 */
streamsCommand
  .command('create')
  .description('Create a new stream')
  .argument('<title>', 'Stream title')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('--json', 'Output as JSON')
  .action(async (title, options) => {
    try {
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use -b or --brain option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        throw new Error(`Brain '${options.brain}' not found`);
      }

      const stream = await Stream.create({
        brainId: brain.id,
        title: title,
        isFavorited: false
      });

      if (options.json) {
        console.log(JSON.stringify(stream, null, 2));
      } else {
        console.log(chalk.green(`✅ Created stream '${title}' in brain '${options.brain}'`));
      }
    } catch (error) {
      console.error(chalk.red('❌ Error creating stream:'), error.message);
      process.exit(1);
    }
  });

/**
 * Delete a stream
 */
streamsCommand
  .command('delete')
  .description('Delete a stream')
  .argument('<title>', 'Stream title')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (title, options) => {
    try {
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use -b or --brain option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        throw new Error(`Brain '${options.brain}' not found`);
      }

      const stream = await Stream.findByBrainAndName(brain.id, title);
      if (!stream) {
        throw new Error(`Stream '${title}' not found in brain '${options.brain}'`);
      }

      if (!options.yes) {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise(resolve => {
          rl.question(`Delete stream '${title}'? This cannot be undone. (y/N) `, resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log(chalk.yellow('Operation cancelled'));
          return;
        }
      }

      await Stream.delete(stream.id);
      console.log(chalk.green(`✅ Deleted stream '${title}' from brain '${options.brain}'`));
    } catch (error) {
      console.error(chalk.red('❌ Error deleting stream:'), error.message);
      process.exit(1);
    }
  });

/**
 * Show stream details
 */
streamsCommand
  .command('show')
  .description('Show stream details and cards')
  .argument('<title>', 'Stream title')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('--json', 'Output as JSON')
  .action(async (title, options) => {
    try {
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use -b or --brain option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        throw new Error(`Brain '${options.brain}' not found`);
      }

      const stream = await Stream.findByBrainAndName(brain.id, title);
      if (!stream) {
        throw new Error(`Stream '${title}' not found in brain '${options.brain}'`);
      }

      const streamCards = await StreamCard.findByStreamId(stream.id);
      
      if (options.json) {
        console.log(JSON.stringify({ stream, cards: streamCards }, null, 2));
      } else {
        console.log(chalk.green(`📄 Stream: ${stream.title}`));
        console.log(`   Brain: ${options.brain}`);
        console.log(`   Favorited: ${stream.isFavorited ? '⭐ Yes' : 'No'}`);
        console.log(`   Created: ${new Date(stream.createdAt).toLocaleDateString()}`);
        console.log(`   Last Accessed: ${new Date(stream.lastAccessedAt).toLocaleDateString()}`);
        console.log(`   Cards: ${streamCards.length}`);

        if (streamCards.length > 0) {
          console.log(chalk.green('\n📝 Cards:'));
          console.log(formatTable(streamCards.map((sc, index) => ({
            Position: index + 1,
            Title: sc.card?.title || 'Unknown',
            'AI Context': sc.isInAIContext ? '🤖' : '',
            Collapsed: sc.isCollapsed ? '📁' : '📂'
          }))));
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Error showing stream:'), error.message);
      process.exit(1);
    }
  });

/**
 * Toggle favorite status
 */
streamsCommand
  .command('favorite')
  .description('Toggle favorite status of a stream')
  .argument('<title>', 'Stream title')
  .option('-b, --brain <name>', 'Brain name (required)')
  .action(async (title, options) => {
    try {
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use -b or --brain option.'));
        process.exit(1);
      }

      const user = await getCurrentUser();
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        throw new Error(`Brain '${options.brain}' not found`);
      }

      const stream = await Stream.findByBrainAndName(brain.id, title);
      if (!stream) {
        throw new Error(`Stream '${title}' not found in brain '${options.brain}'`);
      }

      const newFavoriteStatus = !stream.isFavorited;
      await Stream.update(stream.id, { isFavorited: newFavoriteStatus });
      
      const status = newFavoriteStatus ? 'favorited' : 'unfavorited';
      const icon = newFavoriteStatus ? '⭐' : '';
      console.log(chalk.green(`✅ Stream '${title}' ${status} ${icon}`));
    } catch (error) {
      console.error(chalk.red('❌ Error toggling favorite:'), error.message);
      process.exit(1);
    }
  });

module.exports = streamsCommand;