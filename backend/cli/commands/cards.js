const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const Card = require('../../src/models/Card');
const Brain = require('../../src/models/Brain');
const cardProcessor = require('../../src/services/cardProcessor');
const linkParser = require('../../src/services/linkParser');
const { getCurrentUser } = require('../utils/auth');
const { formatTable, formatJson } = require('../utils/formatting');

/**
 * CLI Commands for Card Management
 */

const cardsCommand = new Command('cards')
  .description('Manage cards in brains');

/**
 * List cards in a brain
 */
cardsCommand
  .command('list')
  .description('List cards in a brain')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('-o, --offset <number>', 'Offset for pagination', '0')
  .option('--json', 'Output as JSON')
  .option('--with-content', 'Include content preview')
  .action(async (options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use --brain <name>'));
        process.exit(1);
      }

      // Find brain
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        console.error(chalk.red(`❌ Brain '${options.brain}' not found`));
        process.exit(1);
      }

      // Get cards
      const cards = await Card.findByBrainId(brain.id, {
        limit: parseInt(options.limit),
        offset: parseInt(options.offset),
        orderBy: 'title'
      });

      if (options.json) {
        const cardData = [];
        for (const card of cards) {
          cardData.push(await card.toJSON(options.withContent));
        }
        console.log(formatJson(cardData));
        return;
      }

      if (cards.length === 0) {
        console.log(chalk.yellow(`📄 No cards found in brain '${options.brain}'`));
        return;
      }

      // Format as table
      const tableData = cards.map(card => ({
        Title: card.title,
        'File Size': card.fileSize ? `${(card.fileSize / 1024).toFixed(1)}KB` : '-',
        'Has File': card.filePath ? '✓' : '✗',
        Modified: card.lastModified ? 
          new Date(card.lastModified).toLocaleDateString() : 
          new Date(card.createdAt).toLocaleDateString(),
        Preview: options.withContent ? 
          (card.contentPreview || '').substring(0, 50) + '...' : 
          (card.contentPreview || '').substring(0, 30) + '...'
      }));

      console.log(chalk.blue(`📄 Cards in brain '${options.brain}' (${cards.length} results):`));
      console.log(formatTable(tableData));

    } catch (error) {
      console.error(chalk.red('❌ Error listing cards:'), error.message);
      process.exit(1);
    }
  });

/**
 * Create a new card
 */
cardsCommand
  .command('create <title>')
  .description('Create a new card')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('-c, --content <content>', 'Card content')
  .option('-f, --file <path>', 'Read content from file')
  .option('--editor', 'Open editor to write content')
  .action(async (title, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use --brain <name>'));
        process.exit(1);
      }

      // Find brain
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        console.error(chalk.red(`❌ Brain '${options.brain}' not found`));
        process.exit(1);
      }

      let content = '';

      // Get content from various sources
      if (options.file) {
        if (!(await fs.pathExists(options.file))) {
          console.error(chalk.red(`❌ File not found: ${options.file}`));
          process.exit(1);
        }
        content = await fs.readFile(options.file, 'utf8');
        console.log(chalk.blue(`📄 Read content from file: ${options.file}`));
      } else if (options.content) {
        content = options.content;
      } else if (options.editor) {
        // Create temporary file for editing
        const tempFile = path.join('/tmp', `clarity-card-${Date.now()}.md`);
        await fs.writeFile(tempFile, `# ${title}\n\nWrite your card content here...`);
        
        // Open editor
        const editor = process.env.EDITOR || 'nano';
        console.log(chalk.blue(`📝 Opening editor: ${editor}`));
        
        await new Promise((resolve, reject) => {
          const editorProcess = spawn(editor, [tempFile], { stdio: 'inherit' });
          editorProcess.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Editor exited with code ${code}`));
            }
          });
        });

        content = await fs.readFile(tempFile, 'utf8');
        await fs.remove(tempFile);
      }

      // Create card
      const result = await cardProcessor.createCardFromContent(brain.id, title, content);
      
      if (!result.success) {
        console.error(chalk.red('❌ Failed to create card:'), result.error);
        process.exit(1);
      }

      // Process links
      await linkParser.processCardLinks(result.card.id, content);

      console.log(chalk.green('✅ Card created successfully'));
      console.log(`   Title: ${result.card.title}`);
      console.log(`   ID: ${result.card.id}`);
      console.log(`   Brain: ${options.brain}`);
      if (result.card.filePath) {
        console.log(`   File: ${result.card.filePath}`);
      }

    } catch (error) {
      console.error(chalk.red('❌ Error creating card:'), error.message);
      process.exit(1);
    }
  });

/**
 * Edit a card
 */
cardsCommand
  .command('edit <title>')
  .description('Edit a card in your editor')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('--editor <editor>', 'Editor to use (defaults to $EDITOR or nano)')
  .action(async (title, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use --brain <name>'));
        process.exit(1);
      }

      // Find brain
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        console.error(chalk.red(`❌ Brain '${options.brain}' not found`));
        process.exit(1);
      }

      // Find card
      const card = await Card.findByBrainAndTitle(brain.id, title);
      if (!card) {
        console.error(chalk.red(`❌ Card '${title}' not found in brain '${options.brain}'`));
        process.exit(1);
      }

      // Get current content
      const currentContent = await card.getContent();
      
      // Create temporary file for editing
      const tempFile = path.join('/tmp', `clarity-edit-${card.id}.md`);
      await fs.writeFile(tempFile, currentContent);
      
      // Open editor
      const editor = options.editor || process.env.EDITOR || 'nano';
      console.log(chalk.blue(`📝 Opening editor: ${editor}`));
      
      await new Promise((resolve, reject) => {
        const editorProcess = spawn(editor, [tempFile], { stdio: 'inherit' });
        editorProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Editor exited with code ${code}`));
          }
        });
      });

      // Read updated content
      const updatedContent = await fs.readFile(tempFile, 'utf8');
      await fs.remove(tempFile);

      // Check if content changed
      if (updatedContent === currentContent) {
        console.log(chalk.yellow('⚠️  No changes made'));
        return;
      }

      // Update card
      await card.updateContent(updatedContent);
      
      // Process links
      await linkParser.processCardLinks(card.id, updatedContent);

      console.log(chalk.green('✅ Card updated successfully'));
      console.log(`   Title: ${card.title}`);
      console.log(`   Size: ${updatedContent.length} characters`);

    } catch (error) {
      console.error(chalk.red('❌ Error editing card:'), error.message);
      process.exit(1);
    }
  });

/**
 * Delete a card
 */
cardsCommand
  .command('delete <title>')
  .description('Delete a card')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('--hard', 'Permanently delete (cannot be undone)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (title, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use --brain <name>'));
        process.exit(1);
      }

      // Find brain
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        console.error(chalk.red(`❌ Brain '${options.brain}' not found`));
        process.exit(1);
      }

      // Find card
      const card = await Card.findByBrainAndTitle(brain.id, title);
      if (!card) {
        console.error(chalk.red(`❌ Card '${title}' not found in brain '${options.brain}'`));
        process.exit(1);
      }

      // Confirmation prompt
      if (!options.yes) {
        const deletionType = options.hard ? 'permanently delete' : 'delete';
        console.log(chalk.yellow(`⚠️  About to ${deletionType} card '${title}' from brain '${options.brain}'`));
        
        if (options.hard) {
          console.log(chalk.red('   This action cannot be undone!'));
        }
        
        // Simple confirmation (in a real CLI, you'd use a proper prompt library)
        process.stdout.write('Continue? (y/N): ');
        
        const answer = await new Promise((resolve) => {
          process.stdin.once('data', (data) => {
            resolve(data.toString().trim().toLowerCase());
          });
        });
        
        if (answer !== 'y' && answer !== 'yes') {
          console.log(chalk.blue('Operation cancelled'));
          return;
        }
      }

      // Delete card
      if (options.hard) {
        await card.hardDelete();
        console.log(chalk.green('✅ Card permanently deleted'));
      } else {
        await card.delete();
        console.log(chalk.green('✅ Card deleted (soft delete)'));
      }

      console.log(`   Title: ${title}`);
      console.log(`   Brain: ${options.brain}`);

    } catch (error) {
      console.error(chalk.red('❌ Error deleting card:'), error.message);
      process.exit(1);
    }
  });

/**
 * Upload files to create cards
 */
cardsCommand
  .command('upload <files...>')
  .description('Upload files to create cards')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('--copy', 'Copy files to brain directory (default: true)', true)
  .option('--update', 'Update existing cards if they exist')
  .action(async (files, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use --brain <name>'));
        process.exit(1);
      }

      // Find brain
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        console.error(chalk.red(`❌ Brain '${options.brain}' not found`));
        process.exit(1);
      }

      // Validate files exist
      const validFiles = [];
      for (const file of files) {
        if (await fs.pathExists(file)) {
          validFiles.push(path.resolve(file));
        } else {
          console.warn(chalk.yellow(`⚠️  File not found: ${file}`));
        }
      }

      if (validFiles.length === 0) {
        console.error(chalk.red('❌ No valid files to upload'));
        process.exit(1);
      }

      console.log(chalk.blue(`📤 Uploading ${validFiles.length} files to brain '${options.brain}'`));

      // Process files
      const results = await cardProcessor.processFiles(validFiles, brain.id, {
        copyFile: options.copy,
        updateExisting: options.update
      });

      // Process links for successfully created cards
      for (const result of results) {
        if (result.success && result.card) {
          const content = await result.card.getContent();
          await linkParser.processCardLinks(result.card.id, content);
        }
      }

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      console.log(chalk.green(`✅ Upload complete: ${successful.length} succeeded, ${failed.length} failed`));

      if (successful.length > 0) {
        console.log(chalk.blue('\n📄 Successfully created cards:'));
        for (const result of successful) {
          console.log(`   ${chalk.green('✓')} ${result.card.title} (${result.action})`);
        }
      }

      if (failed.length > 0) {
        console.log(chalk.red('\n❌ Failed uploads:'));
        for (const result of failed) {
          console.log(`   ${chalk.red('✗')} ${path.basename(result.filePath)}: ${result.error}`);
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ Error uploading files:'), error.message);
      process.exit(1);
    }
  });

/**
 * Show card links
 */
cardsCommand
  .command('links <title>')
  .description('Show card links (forward and back links)')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('--json', 'Output as JSON')
  .action(async (title, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use --brain <name>'));
        process.exit(1);
      }

      // Find brain
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        console.error(chalk.red(`❌ Brain '${options.brain}' not found`));
        process.exit(1);
      }

      // Find card
      const card = await Card.findByBrainAndTitle(brain.id, title);
      if (!card) {
        console.error(chalk.red(`❌ Card '${title}' not found in brain '${options.brain}'`));
        process.exit(1);
      }

      // Get links
      const [forwardLinks, backlinks] = await Promise.all([
        card.getForwardLinks(),
        card.getBacklinks()
      ]);

      if (options.json) {
        console.log(formatJson({
          cardTitle: title,
          forwardLinks: forwardLinks.map(link => ({
            title: link.card.title,
            linkText: link.linkText,
            position: link.position
          })),
          backlinks: backlinks.map(link => ({
            title: link.card.title,
            linkText: link.linkText,
            position: link.position
          }))
        }));
        return;
      }

      console.log(chalk.blue(`🔗 Links for card '${title}':`));

      if (forwardLinks.length > 0) {
        console.log(chalk.green('\n→ Forward Links (cards this card links to):'));
        for (const link of forwardLinks) {
          console.log(`   ${chalk.cyan(link.linkText)} → ${link.card.title}`);
        }
      }

      if (backlinks.length > 0) {
        console.log(chalk.green('\n← Back Links (cards that link to this card):'));
        for (const link of backlinks) {
          console.log(`   ${link.card.title} → ${chalk.cyan(link.linkText)}`);
        }
      }

      if (forwardLinks.length === 0 && backlinks.length === 0) {
        console.log(chalk.yellow('   No links found'));
      }

      console.log(chalk.gray(`\nSummary: ${forwardLinks.length} forward, ${backlinks.length} back`));

    } catch (error) {
      console.error(chalk.red('❌ Error showing card links:'), error.message);
      process.exit(1);
    }
  });

/**
 * Sync cards with file system
 */
cardsCommand
  .command('sync')
  .description('Sync all cards in a brain with their files')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use --brain <name>'));
        process.exit(1);
      }

      // Find brain
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        console.error(chalk.red(`❌ Brain '${options.brain}' not found`));
        process.exit(1);
      }

      console.log(chalk.blue(`🔄 Syncing cards in brain '${options.brain}'...`));

      // Sync all cards
      const results = await cardProcessor.syncBrainCards(brain.id);

      if (options.json) {
        console.log(formatJson(results));
        return;
      }

      console.log(chalk.green('✅ Sync complete'));
      console.log(`   Total cards: ${results.totalCards}`);
      console.log(`   Updated: ${results.updated}`);
      console.log(`   Unchanged: ${results.noChange}`);
      console.log(`   Errors: ${results.errors}`);

      if (results.errors > 0) {
        console.log(chalk.red('\n❌ Errors:'));
        for (const detail of results.details) {
          if (!detail.success) {
            console.log(`   ${detail.title}: ${detail.error}`);
          }
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ Error syncing cards:'), error.message);
      process.exit(1);
    }
  });

/**
 * Show card statistics
 */
cardsCommand
  .command('stats')
  .description('Show statistics for cards in a brain')
  .option('-b, --brain <name>', 'Brain name (required)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.brain) {
        console.error(chalk.red('❌ Brain name is required. Use --brain <name>'));
        process.exit(1);
      }

      // Find brain
      const brain = await Brain.findByUserAndName(user.id, options.brain);
      if (!brain) {
        console.error(chalk.red(`❌ Brain '${options.brain}' not found`));
        process.exit(1);
      }

      // Get statistics
      const [cardStats, linkStats] = await Promise.all([
        cardProcessor.getBrainStats(brain.id),
        linkParser.getLinkStats(brain.id)
      ]);

      if (options.json) {
        console.log(formatJson({ cardStats, linkStats }));
        return;
      }

      console.log(chalk.blue(`📊 Statistics for brain '${options.brain}':`));

      console.log(chalk.green('\n📄 Cards:'));
      console.log(`   Total: ${cardStats.totalCards}`);
      console.log(`   With files: ${cardStats.withFiles}`);
      console.log(`   Without files: ${cardStats.withoutFiles}`);
      console.log(`   Total size: ${(cardStats.totalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Average size: ${(cardStats.averageSize / 1024).toFixed(1)} KB`);

      console.log(chalk.green('\n📁 File types:'));
      for (const [type, count] of Object.entries(cardStats.fileTypes)) {
        console.log(`   ${type}: ${count}`);
      }

      console.log(chalk.green('\n🔗 Links:'));
      console.log(`   Total links: ${linkStats.totalLinks}`);
      console.log(`   Valid links: ${linkStats.validLinks}`);
      console.log(`   Broken links: ${linkStats.brokenLinks}`);
      console.log(`   Cards with links: ${linkStats.cardsWithLinks}`);
      console.log(`   Referenced cards: ${linkStats.referencedCards}`);
      console.log(`   Link health: ${linkStats.linkHealth}%`);

    } catch (error) {
      console.error(chalk.red('❌ Error getting statistics:'), error.message);
      process.exit(1);
    }
  });

module.exports = cardsCommand;