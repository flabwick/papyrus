const Page = require('../models/Page');
const Library = require('../models/Library');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

// Import file processors
const { processMarkdownFile, validateMarkdownFile } = require('../utils/fileProcessors/markdownProcessor');
const { processTextFile, validateTextFile } = require('../utils/fileProcessors/textProcessor');
const { processPdfFile, validatePdfFile } = require('../utils/fileProcessors/pdfProcessor');
const { processEpubFile, validateEpubFile } = require('../utils/fileProcessors/epubProcessor');

/**
 * Page Processing Service
 * Orchestrates file-to-page conversion with proper content extraction and storage
 */

class PageProcessor {
  constructor() {
    this.processors = new Map([
      ['.md', { process: processMarkdownFile, validate: validateMarkdownFile, type: 'markdown' }],
      ['.markdown', { process: processMarkdownFile, validate: validateMarkdownFile, type: 'markdown' }],
      ['.txt', { process: processTextFile, validate: validateTextFile, type: 'text' }],
      ['.text', { process: processTextFile, validate: validateTextFile, type: 'text' }],
      ['.log', { process: processTextFile, validate: validateTextFile, type: 'text' }],
      ['.pdf', { process: processPdfFile, validate: validatePdfFile, type: 'pdf' }],
      ['.epub', { process: processEpubFile, validate: validateEpubFile, type: 'epub' }]
    ]);
  }

  /**
   * Detect file type and get appropriate processor
   * @param {string} filePath - Path to file
   * @returns {Object|null} - Processor info or null if unsupported
   */
  getProcessor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.processors.get(ext) || null;
  }

  /**
   * Get all supported file extensions
   * @returns {Array<string>} - Array of supported extensions
   */
  getSupportedExtensions() {
    return Array.from(this.processors.keys());
  }

  /**
   * Validate if file can be processed
   * @param {string} filePath - Path to file
   * @returns {Promise<boolean>} - True if file can be processed
   */
  async canProcess(filePath) {
    const processor = this.getProcessor(filePath);
    if (!processor) {
      return false;
    }

    try {
      return await processor.validate(filePath);
    } catch (error) {
      console.error(`❌ Error validating file ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Check if page title is unique within library
   * @param {string} libraryId - Library ID
   * @param {string} title - Title to check
   * @throws {Error} - If title already exists
   */
  async checkTitleUnique(libraryId, title) {
    const existingPage = await Page.findByLibraryAndTitle(libraryId, title);
    if (existingPage) {
      throw new Error(`A page with the title "${title}" already exists in this library`);
    }
  }

  /**
   * Determine target directory based on file type
   * @param {string} libraryFolderPath - Library folder path
   * @param {string} fileType - File type (markdown, text, pdf, epub)
   * @returns {string} - Target directory path
   */
  getTargetDirectory(libraryFolderPath, fileType) {
    switch (fileType) {
      case 'markdown':
      case 'text':
        return path.join(libraryFolderPath, 'pages');
      case 'pdf':
      case 'epub':
      default:
        return path.join(libraryFolderPath, 'files');
    }
  }

  /**
   * Calculate file hash
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} - SHA-256 hash
   */
  async calculateFileHash(filePath) {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Copy file to library directory if needed
   * @param {string} sourcePath - Source file path
   * @param {string} libraryFolderPath - Library folder path
   * @param {string} fileType - File type
   * @param {string} title - Page title for filename
   * @returns {Promise<string>} - Final file path in library directory
   */
  async copyFileToTarget(sourcePath, libraryFolderPath, fileType, title) {
    const targetDir = this.getTargetDirectory(libraryFolderPath, fileType);
    
    // If file is already in the target directory, don't copy
    if (sourcePath.startsWith(targetDir)) {
      return sourcePath;
    }

    await fs.ensureDir(targetDir);

    // Generate safe filename
    const ext = path.extname(sourcePath);
    const sanitizedTitle = title
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .substring(0, 100); // Limit length

    let targetFileName = `${sanitizedTitle}${ext}`;
    let targetPath = path.join(targetDir, targetFileName);
    
    // Ensure unique filename
    let counter = 1;
    while (await fs.pathExists(targetPath)) {
      const baseName = path.basename(targetFileName, ext);
      targetFileName = `${baseName}-${counter}${ext}`;
      targetPath = path.join(targetDir, targetFileName);
      counter++;
    }

    // Copy file
    await fs.copy(sourcePath, targetPath);
    console.log(`✅ Copied file to library directory: ${targetPath}`);
    
    return targetPath;
  }

  /**
   * Process a single file into a page
   * @param {string} filePath - Path to file to process
   * @param {string} libraryId - Library ID
   * @param {Object} options - Processing options
   * @param {string} options.title - Custom title (optional)
   * @param {boolean} options.copyFile - Copy file to library directory (default: true)
   * @param {boolean} options.updateExisting - Update if page already exists (default: false)
   * @returns {Promise<Object>} - Processing result
   */
  async processFile(filePath, libraryId, options = {}) {
    const {
      title: customTitle,
      copyFile = true,
      updateExisting = false
    } = options;

    try {
      // Validate library exists
      const library = await Library.findById(libraryId);
      if (!library) {
        throw new Error('Library not found');
      }

      // Check if file can be processed
      if (!(await this.canProcess(filePath))) {
        throw new Error(`File type not supported or file is invalid: ${filePath}`);
      }

      // Get processor
      const processorInfo = this.getProcessor(filePath);
      
      // Process file with appropriate processor
      console.log(`📄 Processing ${processorInfo.type} file: ${filePath}`);
      const processedData = await processorInfo.process(filePath, { title: customTitle });
      
      // Generate unique title
      const uniqueTitle = await this.generateUniqueTitle(libraryId, processedData.title);
      
      // Check if page already exists
      const existingPage = await Page.findByLibraryAndTitle(libraryId, uniqueTitle);
      if (existingPage && !updateExisting) {
        return {
          success: false,
          error: `Page '${uniqueTitle}' already exists`,
          existingPage: existingPage.id,
          action: 'skipped'
        };
      }

      // Copy file to library directory if requested
      let finalFilePath = filePath;
      if (copyFile) {
        finalFilePath = await this.copyFileToTarget(
          filePath, 
          library.folderPath, 
          processorInfo.type, 
          uniqueTitle
        );
      }

      // Calculate file hash
      const fileHash = await this.calculateFileHash(finalFilePath);
      
      // Get file size
      const stats = await fs.stat(finalFilePath);
      
      if (existingPage && updateExisting) {
        // Update existing page
        await existingPage.updateContent(processedData.content);
        await existingPage.update({
          file_path: finalFilePath,
          file_hash: fileHash,
          file_size: stats.size
        });

        return {
          success: true,
          page: existingPage,
          action: 'updated',
          processingInfo: processedData.processingInfo
        };
      } else {
        // Create new page
        const page = await Page.create(libraryId, uniqueTitle, {
          content: processedData.content,
          filePath: finalFilePath,
          fileHash: fileHash,
          fileSize: stats.size
        });

        return {
          success: true,
          page,
          action: 'created',
          processingInfo: processedData.processingInfo
        };
      }

    } catch (error) {
      console.error(`❌ Error processing file ${filePath}:`, error.message);
      return {
        success: false,
        error: error.message,
        action: 'failed'
      };
    }
  }

  /**
   * Process multiple files into pages
   * @param {Array<string>} filePaths - Array of file paths
   * @param {string} libraryId - Library ID
   * @param {Object} options - Processing options
   * @returns {Promise<Array<Object>>} - Array of processing results
   */
  async processFiles(filePaths, libraryId, options = {}) {
    const results = [];
    
    console.log(`📄 Processing ${filePaths.length} files for library ${libraryId}`);
    
    for (const filePath of filePaths) {
      const result = await this.processFile(filePath, libraryId, options);
      results.push({
        filePath,
        ...result
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`✅ Processed ${filePaths.length} files: ${successCount} succeeded, ${failCount} failed`);
    
    return results;
  }

  /**
   * Process files from a directory
   * @param {string} directoryPath - Directory to scan
   * @param {string} libraryId - Library ID
   * @param {Object} options - Processing options
   * @param {boolean} options.recursive - Process subdirectories (default: false)
   * @param {Array<string>} options.excludePatterns - Glob patterns to exclude
   * @returns {Promise<Array<Object>>} - Array of processing results
   */
  async processDirectory(directoryPath, libraryId, options = {}) {
    const {
      recursive = false,
      excludePatterns = ['.git/**', 'node_modules/**', '.DS_Store']
    } = options;

    try {
      if (!(await fs.pathExists(directoryPath))) {
        throw new Error(`Directory not found: ${directoryPath}`);
      }

      const supportedExtensions = this.getSupportedExtensions();
      const filePaths = [];

      // Scan directory for supported files
      const scanDir = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory() && recursive) {
            // Skip excluded directories
            const shouldExclude = excludePatterns.some(pattern => {
              const globRegex = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
              return new RegExp(globRegex).test(path.relative(directoryPath, fullPath));
            });
            
            if (!shouldExclude) {
              await scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (supportedExtensions.includes(ext)) {
              filePaths.push(fullPath);
            }
          }
        }
      };

      await scanDir(directoryPath);
      
      if (filePaths.length === 0) {
        console.log(`ℹ️  No supported files found in directory: ${directoryPath}`);
        return [];
      }

      return await this.processFiles(filePaths, libraryId, options);
      
    } catch (error) {
      console.error(`❌ Error processing directory ${directoryPath}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync existing page with its file (if file has changed)
   * @param {string} pageId - Page ID to sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncPage(pageId) {
    try {
      const page = await Page.findById(pageId);
      if (!page) {
        return {
          success: false,
          error: 'Page not found'
        };
      }

      if (!page.filePath) {
        return {
          success: false,
          error: 'Page has no associated file'
        };
      }

      // Check if file has changed
      const hasChanged = await page.hasFileChanged();
      if (!hasChanged) {
        return {
          success: true,
          action: 'no-change',
          message: 'File has not changed'
        };
      }

      // Sync page with file
      const updated = await page.syncWithFile();
      
      return {
        success: true,
        action: updated ? 'updated' : 'no-change',
        page: page
      };

    } catch (error) {
      console.error(`❌ Error syncing page ${pageId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sync all pages in a library with their files
   * @param {string} libraryId - Library ID
   * @returns {Promise<Object>} - Sync results summary
   */
  async syncLibraryPages(libraryId) {
    try {
      const pages = await Page.findByLibraryId(libraryId);
      const results = {
        totalPages: pages.length,
        updated: 0,
        noChange: 0,
        errors: 0,
        details: []
      };

      for (const page of pages) {
        if (page.filePath) {
          const result = await this.syncPage(page.id);
          results.details.push({
            pageId: page.id,
            title: page.title,
            ...result
          });

          if (result.success) {
            if (result.action === 'updated') {
              results.updated++;
            } else {
              results.noChange++;
            }
          } else {
            results.errors++;
          }
        }
      }

      console.log(`✅ Synced library ${libraryId}: ${results.updated} updated, ${results.noChange} unchanged, ${results.errors} errors`);
      
      return results;

    } catch (error) {
      console.error(`❌ Error syncing library pages ${libraryId}:`, error.message);
      throw error;
    }
  }

  /**
   * Create page from text content (not from file)
   * @param {string} libraryId - Library ID
   * @param {string} title - Page title
   * @param {string} content - Page content
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} - Creation result
   */
  async createPageFromContent(libraryId, title, content, options = {}) {
    try {
      // Validate library exists
      const library = await Library.findById(libraryId);
      if (!library) {
        throw new Error('Library not found');
      }

      // Check title uniqueness
      await this.checkTitleUnique(libraryId, title);
      
      // Create page
      const page = await Page.create(libraryId, title, {
        content: content || ''
      });

      return {
        success: true,
        page,
        action: 'created'
      };

    } catch (error) {
      console.error(`❌ Error creating page from content:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get processing statistics for a library
   * @param {string} libraryId - Library ID
   * @returns {Promise<Object>} - Processing statistics
   */
  async getLibraryStats(libraryId) {
    try {
      const pages = await Page.findByLibraryId(libraryId);
      
      const stats = {
        totalPages: pages.length,
        withFiles: 0,
        withoutFiles: 0,
        fileTypes: {},
        totalSize: 0,
        averageSize: 0
      };

      for (const page of pages) {
        if (page.filePath) {
          stats.withFiles++;
          
          const ext = path.extname(page.filePath).toLowerCase();
          const processorInfo = this.getProcessor(page.filePath);
          const fileType = processorInfo ? processorInfo.type : 'unknown';
          
          stats.fileTypes[fileType] = (stats.fileTypes[fileType] || 0) + 1;
          stats.totalSize += page.fileSize || 0;
        } else {
          stats.withoutFiles++;
        }
      }

      if (stats.totalPages > 0) {
        stats.averageSize = stats.totalSize / stats.totalPages;
      }

      return stats;

    } catch (error) {
      console.error(`❌ Error getting library stats ${libraryId}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate unique title for page within library
   * @param {string} libraryId - Library ID
   * @param {string} baseTitle - Base title to make unique
   * @returns {Promise<string>} - Unique title
   */
  async generateUniqueTitle(libraryId, baseTitle) {
    let uniqueTitle = baseTitle;
    let counter = 1;
    
    while (true) {
      const existingPage = await Page.findByLibraryAndTitle(libraryId, uniqueTitle);
      if (!existingPage) {
        return uniqueTitle;
      }
      
      uniqueTitle = `${baseTitle} (${counter})`;
      counter++;
    }
  }
}

// Export singleton instance
module.exports = new PageProcessor();