const Card = require('../models/Card');
const Brain = require('../models/Brain');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

// Import file processors
const { processMarkdownFile, validateMarkdownFile } = require('../utils/fileProcessors/markdownProcessor');
const { processTextFile, validateTextFile } = require('../utils/fileProcessors/textProcessor');
const { processPdfFile, validatePdfFile } = require('../utils/fileProcessors/pdfProcessor');
const { processEpubFile, validateEpubFile } = require('../utils/fileProcessors/epubProcessor');

/**
 * Card Processing Service
 * Orchestrates file-to-card conversion with proper content extraction and storage
 */

class CardProcessor {
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
   * Check if card title is unique within brain
   * @param {string} brainId - Brain ID
   * @param {string} title - Title to check
   * @throws {Error} - If title already exists
   */
  async checkTitleUnique(brainId, title) {
    const existingCard = await Card.findByBrainAndTitle(brainId, title);
    if (existingCard) {
      throw new Error(`A card with the title "${title}" already exists in this brain`);
    }
  }

  /**
   * Determine target directory based on file type
   * @param {string} brainFolderPath - Brain folder path
   * @param {string} fileType - File type (markdown, text, pdf, epub)
   * @returns {string} - Target directory path
   */
  getTargetDirectory(brainFolderPath, fileType) {
    switch (fileType) {
      case 'markdown':
      case 'text':
        return path.join(brainFolderPath, 'cards');
      case 'pdf':
      case 'epub':
      default:
        return path.join(brainFolderPath, 'files');
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
   * Copy file to brain directory if needed
   * @param {string} sourcePath - Source file path
   * @param {string} brainFolderPath - Brain folder path
   * @param {string} fileType - File type
   * @param {string} title - Card title for filename
   * @returns {Promise<string>} - Final file path in brain directory
   */
  async copyFileToTarget(sourcePath, brainFolderPath, fileType, title) {
    const targetDir = this.getTargetDirectory(brainFolderPath, fileType);
    
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
    console.log(`✅ Copied file to brain directory: ${targetPath}`);
    
    return targetPath;
  }

  /**
   * Process a single file into a card
   * @param {string} filePath - Path to file to process
   * @param {string} brainId - Brain ID
   * @param {Object} options - Processing options
   * @param {string} options.title - Custom title (optional)
   * @param {boolean} options.copyFile - Copy file to brain directory (default: true)
   * @param {boolean} options.updateExisting - Update if card already exists (default: false)
   * @returns {Promise<Object>} - Processing result
   */
  async processFile(filePath, brainId, options = {}) {
    const {
      title: customTitle,
      copyFile = true,
      updateExisting = false
    } = options;

    try {
      // Validate brain exists
      const brain = await Brain.findById(brainId);
      if (!brain) {
        throw new Error('Brain not found');
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
      const uniqueTitle = await this.generateUniqueTitle(brainId, processedData.title);
      
      // Check if card already exists
      const existingCard = await Card.findByBrainAndTitle(brainId, uniqueTitle);
      if (existingCard && !updateExisting) {
        return {
          success: false,
          error: `Card '${uniqueTitle}' already exists`,
          existingCard: existingCard.id,
          action: 'skipped'
        };
      }

      // Copy file to brain directory if requested
      let finalFilePath = filePath;
      if (copyFile) {
        finalFilePath = await this.copyFileToTarget(
          filePath, 
          brain.folderPath, 
          processorInfo.type, 
          uniqueTitle
        );
      }

      // Calculate file hash
      const fileHash = await this.calculateFileHash(finalFilePath);
      
      // Get file size
      const stats = await fs.stat(finalFilePath);
      
      if (existingCard && updateExisting) {
        // Update existing card
        await existingCard.updateContent(processedData.content);
        await existingCard.update({
          file_path: finalFilePath,
          file_hash: fileHash,
          file_size: stats.size
        });

        return {
          success: true,
          card: existingCard,
          action: 'updated',
          processingInfo: processedData.processingInfo
        };
      } else {
        // Create new card
        const card = await Card.create(brainId, uniqueTitle, {
          content: processedData.content,
          filePath: finalFilePath,
          fileHash: fileHash,
          fileSize: stats.size
        });

        return {
          success: true,
          card,
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
   * Process multiple files into cards
   * @param {Array<string>} filePaths - Array of file paths
   * @param {string} brainId - Brain ID
   * @param {Object} options - Processing options
   * @returns {Promise<Array<Object>>} - Array of processing results
   */
  async processFiles(filePaths, brainId, options = {}) {
    const results = [];
    
    console.log(`📄 Processing ${filePaths.length} files for brain ${brainId}`);
    
    for (const filePath of filePaths) {
      const result = await this.processFile(filePath, brainId, options);
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
   * @param {string} brainId - Brain ID
   * @param {Object} options - Processing options
   * @param {boolean} options.recursive - Process subdirectories (default: false)
   * @param {Array<string>} options.excludePatterns - Glob patterns to exclude
   * @returns {Promise<Array<Object>>} - Array of processing results
   */
  async processDirectory(directoryPath, brainId, options = {}) {
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

      return await this.processFiles(filePaths, brainId, options);
      
    } catch (error) {
      console.error(`❌ Error processing directory ${directoryPath}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync existing card with its file (if file has changed)
   * @param {string} cardId - Card ID to sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncCard(cardId) {
    try {
      const card = await Card.findById(cardId);
      if (!card) {
        return {
          success: false,
          error: 'Card not found'
        };
      }

      if (!card.filePath) {
        return {
          success: false,
          error: 'Card has no associated file'
        };
      }

      // Check if file has changed
      const hasChanged = await card.hasFileChanged();
      if (!hasChanged) {
        return {
          success: true,
          action: 'no-change',
          message: 'File has not changed'
        };
      }

      // Sync card with file
      const updated = await card.syncWithFile();
      
      return {
        success: true,
        action: updated ? 'updated' : 'no-change',
        card: card
      };

    } catch (error) {
      console.error(`❌ Error syncing card ${cardId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sync all cards in a brain with their files
   * @param {string} brainId - Brain ID
   * @returns {Promise<Object>} - Sync results summary
   */
  async syncBrainCards(brainId) {
    try {
      const cards = await Card.findByBrainId(brainId);
      const results = {
        totalCards: cards.length,
        updated: 0,
        noChange: 0,
        errors: 0,
        details: []
      };

      for (const card of cards) {
        if (card.filePath) {
          const result = await this.syncCard(card.id);
          results.details.push({
            cardId: card.id,
            title: card.title,
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

      console.log(`✅ Synced brain ${brainId}: ${results.updated} updated, ${results.noChange} unchanged, ${results.errors} errors`);
      
      return results;

    } catch (error) {
      console.error(`❌ Error syncing brain cards ${brainId}:`, error.message);
      throw error;
    }
  }

  /**
   * Create card from text content (not from file)
   * @param {string} brainId - Brain ID
   * @param {string} title - Card title
   * @param {string} content - Card content
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} - Creation result
   */
  async createCardFromContent(brainId, title, content, options = {}) {
    try {
      // Validate brain exists
      const brain = await Brain.findById(brainId);
      if (!brain) {
        throw new Error('Brain not found');
      }

      // Check title uniqueness
      await this.checkTitleUnique(brainId, title);
      
      // Create card
      const card = await Card.create(brainId, title, {
        content: content || ''
      });

      return {
        success: true,
        card,
        action: 'created'
      };

    } catch (error) {
      console.error(`❌ Error creating card from content:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get processing statistics for a brain
   * @param {string} brainId - Brain ID
   * @returns {Promise<Object>} - Processing statistics
   */
  async getBrainStats(brainId) {
    try {
      const cards = await Card.findByBrainId(brainId);
      
      const stats = {
        totalCards: cards.length,
        withFiles: 0,
        withoutFiles: 0,
        fileTypes: {},
        totalSize: 0,
        averageSize: 0
      };

      for (const card of cards) {
        if (card.filePath) {
          stats.withFiles++;
          
          const ext = path.extname(card.filePath).toLowerCase();
          const processorInfo = this.getProcessor(card.filePath);
          const fileType = processorInfo ? processorInfo.type : 'unknown';
          
          stats.fileTypes[fileType] = (stats.fileTypes[fileType] || 0) + 1;
          stats.totalSize += card.fileSize || 0;
        } else {
          stats.withoutFiles++;
        }
      }

      if (stats.totalCards > 0) {
        stats.averageSize = stats.totalSize / stats.totalCards;
      }

      return stats;

    } catch (error) {
      console.error(`❌ Error getting brain stats ${brainId}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate unique title for card within brain
   * @param {string} brainId - Brain ID
   * @param {string} baseTitle - Base title to make unique
   * @returns {Promise<string>} - Unique title
   */
  async generateUniqueTitle(brainId, baseTitle) {
    let uniqueTitle = baseTitle;
    let counter = 1;
    
    while (true) {
      const existingCard = await Card.findByBrainAndTitle(brainId, uniqueTitle);
      if (!existingCard) {
        return uniqueTitle;
      }
      
      uniqueTitle = `${baseTitle} (${counter})`;
      counter++;
    }
  }
}

// Export singleton instance
module.exports = new CardProcessor();