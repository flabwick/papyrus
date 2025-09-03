const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const Page = require('../../src/models/Page');
const Library = require('../../src/models/Library');
const pageProcessor = require('../../src/services/pageProcessor');
const linkParser = require('../../src/services/linkParser');
const { getCurrentUser } = require('../utils/auth');
const { formatTable, formatJson } = require('../utils/formatting');

/**
 * CLI Commands for Page Management
 */

const pagesCommand = new Command('pages')
  .description('Manage pages in libraries');

/**
 * List pages in a library
 */
pagesCommand
  .command('list')
  .description('List pages in a library')
  .option('-b, --library <name>', 'Library name (required)')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('-o, --offset <number>', 'Offset for pagination', '0')
  .option('--json', 'Output as JSON')
  .option('--with-content', 'Include content preview')
  .action(async (options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use --library <name>'));
        process.exit(1);
      }

      // Find library
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        console.error(chalk.red(`❌ Library '${options.library}' not found`));
        process.exit(1);
      }

      // Get pages
      const pages = await Page.findByLibraryId(library.id, {
        limit: parseInt(options.limit),
        offset: parseInt(options.offset),
        orderBy: 'title'
      });

      if (options.json) {
        const pageData = [];
        for (const page of pages) {
          pageData.push(await page.toJSON(options.withContent));
        }
        console.log(formatJson(pageData));
        return;
      }

      if (pages.length === 0) {
        console.log(chalk.yellow(`📄 No pages found in library '${options.library}'`));
        return;
      }

      // Format as table
      const tableData = pages.map(page => ({
        Title: page.title,
        'File Size': page.fileSize ? `${(page.fileSize / 1024).toFixed(1)}KB` : '-',
        'Has File': page.filePath ? '✓' : '✗',
        Modified: page.lastModified ? 
          new Date(page.lastModified).toLocaleDateString() : 
          new Date(page.createdAt).toLocaleDateString(),
        Preview: options.withContent ? 
          (page.contentPreview || '').substring(0, 50) + '...' : 
          (page.contentPreview || '').substring(0, 30) + '...'
      }));

      console.log(chalk.blue(`📄 Pages in library '${options.library}' (${pages.length} results):`));
      console.log(formatTable(tableData));

    } catch (error) {
      console.error(chalk.red('❌ Error listing pages:'), error.message);
      process.exit(1);
    }
  });

/**
 * Create a new page
 */
pagesCommand
  .command('create <title>')
  .description('Create a new page')
  .option('-b, --library <name>', 'Library name (required)')
  .option('-c, --content <content>', 'Page content')
  .option('-f, --file <path>', 'Read content from file')
  .option('--editor', 'Open editor to write content')
  .action(async (title, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use --library <name>'));
        process.exit(1);
      }

      // Find library
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        console.error(chalk.red(`❌ Library '${options.library}' not found`));
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
        const tempFile = path.join('/tmp', `clarity-page-${Date.now()}.md`);
        await fs.writeFile(tempFile, `# ${title}\n\nWrite your page content here...`);
        
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

      // Create page
      const result = await pageProcessor.createPageFromContent(library.id, title, content);
      
      if (!result.success) {
        console.error(chalk.red('❌ Failed to create page:'), result.error);
        process.exit(1);
      }

      // Process links
      await linkParser.processPageLinks(result.page.id, content);

      console.log(chalk.green('✅ Page created successfully'));
      console.log(`   Title: ${result.page.title}`);
      console.log(`   ID: ${result.page.id}`);
      console.log(`   Library: ${options.library}`);
      if (result.page.filePath) {
        console.log(`   File: ${result.page.filePath}`);
      }

    } catch (error) {
      console.error(chalk.red('❌ Error creating page:'), error.message);
      process.exit(1);
    }
  });

/**
 * Edit a page
 */
pagesCommand
  .command('edit <title>')
  .description('Edit a page in your editor')
  .option('-b, --library <name>', 'Library name (required)')
  .option('--editor <editor>', 'Editor to use (defaults to $EDITOR or nano)')
  .action(async (title, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use --library <name>'));
        process.exit(1);
      }

      // Find library
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        console.error(chalk.red(`❌ Library '${options.library}' not found`));
        process.exit(1);
      }

      // Find page
      const page = await Page.findByLibraryAndTitle(library.id, title);
      if (!page) {
        console.error(chalk.red(`❌ Page '${title}' not found in library '${options.library}'`));
        process.exit(1);
      }

      // Get current content
      const currentContent = await page.getContent();
      
      // Create temporary file for editing
      const tempFile = path.join('/tmp', `clarity-edit-${page.id}.md`);
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

      // Update page
      await page.updateContent(updatedContent);
      
      // Process links
      await linkParser.processPageLinks(page.id, updatedContent);

      console.log(chalk.green('✅ Page updated successfully'));
      console.log(`   Title: ${page.title}`);
      console.log(`   Size: ${updatedContent.length} characters`);

    } catch (error) {
      console.error(chalk.red('❌ Error editing page:'), error.message);
      process.exit(1);
    }
  });

/**
 * Delete a page
 */
pagesCommand
  .command('delete <title>')
  .description('Delete a page')
  .option('-b, --library <name>', 'Library name (required)')
  .option('--hard', 'Permanently delete (cannot be undone)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (title, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use --library <name>'));
        process.exit(1);
      }

      // Find library
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        console.error(chalk.red(`❌ Library '${options.library}' not found`));
        process.exit(1);
      }

      // Find page
      const page = await Page.findByLibraryAndTitle(library.id, title);
      if (!page) {
        console.error(chalk.red(`❌ Page '${title}' not found in library '${options.library}'`));
        process.exit(1);
      }

      // Confirmation prompt
      if (!options.yes) {
        const deletionType = options.hard ? 'permanently delete' : 'delete';
        console.log(chalk.yellow(`⚠️  About to ${deletionType} page '${title}' from library '${options.library}'`));
        
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

      // Delete page
      if (options.hard) {
        await page.hardDelete();
        console.log(chalk.green('✅ Page permanently deleted'));
      } else {
        await page.delete();
        console.log(chalk.green('✅ Page deleted (soft delete)'));
      }

      console.log(`   Title: ${title}`);
      console.log(`   Library: ${options.library}`);

    } catch (error) {
      console.error(chalk.red('❌ Error deleting page:'), error.message);
      process.exit(1);
    }
  });

/**
 * Upload files to create pages
 */
pagesCommand
  .command('upload <files...>')
  .description('Upload files to create pages')
  .option('-b, --library <name>', 'Library name (required)')
  .option('--copy', 'Copy files to library directory (default: true)', true)
  .option('--update', 'Update existing pages if they exist')
  .action(async (files, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use --library <name>'));
        process.exit(1);
      }

      // Find library
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        console.error(chalk.red(`❌ Library '${options.library}' not found`));
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

      console.log(chalk.blue(`📤 Uploading ${validFiles.length} files to library '${options.library}'`));

      // Process files
      const results = await pageProcessor.processFiles(validFiles, library.id, {
        copyFile: options.copy,
        updateExisting: options.update
      });

      // Process links for successfully created pages
      for (const result of results) {
        if (result.success && result.page) {
          const content = await result.page.getContent();
          await linkParser.processPageLinks(result.page.id, content);
        }
      }

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      console.log(chalk.green(`✅ Upload complete: ${successful.length} succeeded, ${failed.length} failed`));

      if (successful.length > 0) {
        console.log(chalk.blue('\n📄 Successfully created pages:'));
        for (const result of successful) {
          console.log(`   ${chalk.green('✓')} ${result.page.title} (${result.action})`);
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
 * Show page links
 */
pagesCommand
  .command('links <title>')
  .description('Show page links (forward and back links)')
  .option('-b, --library <name>', 'Library name (required)')
  .option('--json', 'Output as JSON')
  .action(async (title, options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use --library <name>'));
        process.exit(1);
      }

      // Find library
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        console.error(chalk.red(`❌ Library '${options.library}' not found`));
        process.exit(1);
      }

      // Find page
      const page = await Page.findByLibraryAndTitle(library.id, title);
      if (!page) {
        console.error(chalk.red(`❌ Page '${title}' not found in library '${options.library}'`));
        process.exit(1);
      }

      // Get links
      const [forwardLinks, backlinks] = await Promise.all([
        page.getForwardLinks(),
        page.getBacklinks()
      ]);

      if (options.json) {
        console.log(formatJson({
          pageTitle: title,
          forwardLinks: forwardLinks.map(link => ({
            title: link.page.title,
            linkText: link.linkText,
            position: link.position
          })),
          backlinks: backlinks.map(link => ({
            title: link.page.title,
            linkText: link.linkText,
            position: link.position
          }))
        }));
        return;
      }

      console.log(chalk.blue(`🔗 Links for page '${title}':`));

      if (forwardLinks.length > 0) {
        console.log(chalk.green('\n→ Forward Links (pages this page links to):'));
        for (const link of forwardLinks) {
          console.log(`   ${chalk.cyan(link.linkText)} → ${link.page.title}`);
        }
      }

      if (backlinks.length > 0) {
        console.log(chalk.green('\n← Back Links (pages that link to this page):'));
        for (const link of backlinks) {
          console.log(`   ${link.page.title} → ${chalk.cyan(link.linkText)}`);
        }
      }

      if (forwardLinks.length === 0 && backlinks.length === 0) {
        console.log(chalk.yellow('   No links found'));
      }

      console.log(chalk.gray(`\nSummary: ${forwardLinks.length} forward, ${backlinks.length} back`));

    } catch (error) {
      console.error(chalk.red('❌ Error showing page links:'), error.message);
      process.exit(1);
    }
  });

/**
 * Sync pages with file system
 */
pagesCommand
  .command('sync')
  .description('Sync all pages in a library with their files')
  .option('-b, --library <name>', 'Library name (required)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use --library <name>'));
        process.exit(1);
      }

      // Find library
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        console.error(chalk.red(`❌ Library '${options.library}' not found`));
        process.exit(1);
      }

      console.log(chalk.blue(`🔄 Syncing pages in library '${options.library}'...`));

      // Sync all pages
      const results = await pageProcessor.syncLibraryPages(library.id);

      if (options.json) {
        console.log(formatJson(results));
        return;
      }

      console.log(chalk.green('✅ Sync complete'));
      console.log(`   Total pages: ${results.totalPages}`);
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
      console.error(chalk.red('❌ Error syncing pages:'), error.message);
      process.exit(1);
    }
  });

/**
 * Show page statistics
 */
pagesCommand
  .command('stats')
  .description('Show statistics for pages in a library')
  .option('-b, --library <name>', 'Library name (required)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const user = await getCurrentUser();
      
      if (!options.library) {
        console.error(chalk.red('❌ Library name is required. Use --library <name>'));
        process.exit(1);
      }

      // Find library
      const library = await Library.findByUserAndName(user.id, options.library);
      if (!library) {
        console.error(chalk.red(`❌ Library '${options.library}' not found`));
        process.exit(1);
      }

      // Get statistics
      const [pageStats, linkStats] = await Promise.all([
        pageProcessor.getLibraryStats(library.id),
        linkParser.getLinkStats(library.id)
      ]);

      if (options.json) {
        console.log(formatJson({ pageStats, linkStats }));
        return;
      }

      console.log(chalk.blue(`📊 Statistics for library '${options.library}':`));

      console.log(chalk.green('\n📄 Pages:'));
      console.log(`   Total: ${pageStats.totalPages}`);
      console.log(`   With files: ${pageStats.withFiles}`);
      console.log(`   Without files: ${pageStats.withoutFiles}`);
      console.log(`   Total size: ${(pageStats.totalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Average size: ${(pageStats.averageSize / 1024).toFixed(1)} KB`);

      console.log(chalk.green('\n📁 File types:'));
      for (const [type, count] of Object.entries(pageStats.fileTypes)) {
        console.log(`   ${type}: ${count}`);
      }

      console.log(chalk.green('\n🔗 Links:'));
      console.log(`   Total links: ${linkStats.totalLinks}`);
      console.log(`   Valid links: ${linkStats.validLinks}`);
      console.log(`   Broken links: ${linkStats.brokenLinks}`);
      console.log(`   Pages with links: ${linkStats.pagesWithLinks}`);
      console.log(`   Referenced pages: ${linkStats.referencedPages}`);
      console.log(`   Link health: ${linkStats.linkHealth}%`);

    } catch (error) {
      console.error(chalk.red('❌ Error getting statistics:'), error.message);
      process.exit(1);
    }
  });

module.exports = pagesCommand;