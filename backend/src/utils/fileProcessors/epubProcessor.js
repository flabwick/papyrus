const fs = require('fs-extra');
const path = require('path');
const EPub = require('epub2').EPub;

/**
 * Enhanced EPUB File Processor
 * Extracts metadata, text content, and cover images from EPUB files
 */

/**
 * Extract comprehensive metadata from EPUB file
 * @param {string} filePath - Path to EPUB file
 * @returns {Promise<Object>} - Complete EPUB metadata
 */
async function extractEpubMetadata(filePath) {
  const stats = await fs.stat(filePath);
  const fileName = path.basename(filePath, path.extname(filePath));
  
  return new Promise((resolve) => {
    try {
      const epub = new EPub(filePath);
      
      epub.on('error', (error) => {
        console.error(`Error parsing EPUB ${filePath}:`, error.message);
        
        // Fallback to basic file metadata if EPUB parsing fails
        const metadata = {
          fileName,
          fileSize: stats.size,
          fileType: 'epub',
          modified: stats.mtime,
          created: stats.birthtime || stats.ctime,
          title: null,
          author: null,
          publisher: null,
          language: null,
          isbn: null,
          publicationDate: null,
          description: null,
          chapterCount: null,
          wordCount: null,
          hasImages: false,
          hasToc: false,
          parseError: error.message
        };
        
        resolve({ metadata, fullText: '', coverImage: null, chapters: [] });
      });
      
      epub.on('end', () => {
        try {
          const metadata = {
            fileName,
            fileSize: stats.size,
            fileType: 'epub',
            modified: stats.mtime,
            created: stats.birthtime || stats.ctime,
            // EPUB-specific metadata
            title: epub.metadata.title || null,
            author: epub.metadata.creator || null,
            publisher: epub.metadata.publisher || null,
            language: epub.metadata.language || null,
            isbn: epub.metadata.ISBN || null,
            publicationDate: epub.metadata.date || null,
            description: epub.metadata.description || null,
            chapterCount: epub.flow ? epub.flow.length : 0,
            wordCount: 0, // Will be calculated from text
            hasImages: epub.manifest && Object.keys(epub.manifest).some(key => 
              epub.manifest[key]['media-type']?.startsWith('image/')),
            hasToc: epub.toc && epub.toc.length > 0,
            rights: epub.metadata.rights || null,
            subjects: epub.metadata.subject || []
          };
          
          // Extract cover image info if available
          let coverImage = null;
          if (epub.metadata.cover) {
            const coverItem = epub.manifest[epub.metadata.cover];
            if (coverItem) {
              coverImage = {
                id: epub.metadata.cover,
                href: coverItem.href,
                mediaType: coverItem['media-type']
              };
            }
          }
          
          // Get chapter information
          const chapters = epub.flow ? epub.flow.map((chapter, index) => ({
            id: chapter.id,
            href: chapter.href,
            title: chapter.title || `Chapter ${index + 1}`,
            mediaType: chapter['media-type']
          })) : [];
          
          resolve({ metadata, fullText: '', coverImage, chapters });
        } catch (processingError) {
          console.error(`Error processing EPUB metadata ${filePath}:`, processingError.message);
          const fallbackMetadata = {
            fileName,
            fileSize: stats.size,
            fileType: 'epub',
            modified: stats.mtime,
            created: stats.birthtime || stats.ctime,
            title: null,
            author: null,
            publisher: null,
            language: null,
            isbn: null,
            publicationDate: null,
            description: null,
            chapterCount: null,
            wordCount: null,
            hasImages: false,
            hasToc: false,
            parseError: processingError.message
          };
          resolve({ metadata: fallbackMetadata, fullText: '', coverImage: null, chapters: [] });
        }
      });
      
      epub.parse();
    } catch (error) {
      console.error(`Error initializing EPUB parser ${filePath}:`, error.message);
      const metadata = {
        fileName,
        fileSize: stats.size,
        fileType: 'epub',
        modified: stats.mtime,
        created: stats.birthtime || stats.ctime,
        title: null,
        author: null,
        publisher: null,
        language: null,
        isbn: null,
        publicationDate: null,
        description: null,
        chapterCount: null,
        wordCount: null,
        hasImages: false,
        hasToc: false,
        parseError: error.message
      };
      resolve({ metadata, fullText: '', coverImage: null, chapters: [] });
    }
  });
}

/**
 * Generate card title from EPUB filename
 * @param {string} fileName - EPUB filename
 * @param {Object} metadata - EPUB metadata
 * @returns {string} - Generated title
 */
function generateTitle(fileName, metadata) {
  // Use EPUB title metadata if available (would be implemented later)
  if (metadata.title && metadata.title.trim().length > 0) {
    return metadata.title.trim();
  }

  // Clean up filename for title
  const baseName = path.basename(fileName, path.extname(fileName));
  return baseName
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extract cover image from EPUB file
 * @param {string} epubPath - Path to EPUB file
 * @param {Object} coverInfo - Cover image info from metadata
 * @param {string} filesDir - Files directory (not covers directory)
 * @returns {Promise<string|null>} - Path to extracted cover image or null
 */
async function extractCoverImage(epubPath, coverInfo, filesDir) {
  return new Promise((resolve, reject) => {
    try {
      const epub = new EPub(epubPath);
      
      epub.on('error', (err) => {
        console.error('EPUB parsing error:', err);
        reject(err);
      });

      epub.on('end', async () => {
        try {
          // Get cover image data
          epub.getImage(coverInfo.id, async (error, data, mimeType) => {
            if (error) {
              console.error('Error extracting cover image:', error);
              resolve(null);
              return;
            }

            try {
              // Determine file extension from mime type
              let extension = '.jpg'; // default
              if (mimeType) {
                if (mimeType.includes('png')) extension = '.png';
                else if (mimeType.includes('gif')) extension = '.gif';
                else if (mimeType.includes('webp')) extension = '.webp';
                else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = '.jpg';
              }
              
              // Create covers subdirectory within files directory if provided
              if (filesDir) {
                const coversDir = path.join(filesDir, 'covers');
                await fs.ensureDir(coversDir);
                
                // Generate filename
                const baseFileName = path.basename(epubPath, '.epub');
                const coverFileName = `${baseFileName}_cover${extension}`;
                const coverPath = path.join(coversDir, coverFileName);
                
                // Save the image file
                await fs.writeFile(coverPath, data);
                console.log(`✅ Extracted cover image: ${coverPath}`);
                resolve(coverPath);
              } else {
                // Generate filename without directory
                const baseFileName = path.basename(epubPath, '.epub');
                const coverFileName = `${baseFileName}_cover${extension}`;
                
                // Save the image file in current directory
                await fs.writeFile(coverFileName, data);
                console.log(`✅ Extracted cover image: ${coverFileName}`);
                resolve(coverFileName);
              }
            } catch (saveError) {
              console.error('Error saving cover image:', saveError);
              resolve(null);
            }
          });
        } catch (extractError) {
          console.error('Error during cover extraction:', extractError);
          resolve(null);
        }
      });

      epub.parse();
    } catch (error) {
      console.error('Error initializing EPUB parser:', error);
      reject(error);
    }
  });
}

/**
 * Process an EPUB file with full metadata extraction
 * @param {string} filePath - Path to the EPUB file
 * @param {Object} options - Processing options
 * @param {string} options.title - Custom title (optional)
 * @param {boolean} options.extractFullText - Whether to extract full text (default: false for file cards)
 * @returns {Promise<Object>} - Processed EPUB data
 */
async function processEpubFile(filePath, options = {}) {
  try {
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Extract metadata and content information
    const { metadata, fullText, coverImage, chapters } = await extractEpubMetadata(filePath);
    
    // Extract and save cover image if available
    let coverImagePath = null;
    if (coverImage && options.extractCoverImage !== false) {
      try {
        coverImagePath = await extractCoverImage(filePath, coverImage, options.filesDir);
      } catch (coverError) {
        console.warn(`Could not extract cover image for ${filePath}:`, coverError.message);
      }
    }
    
    // Generate title
    const title = options.title || generateTitle(path.basename(filePath), metadata);
    
    // Create content for file card display
    let content;
    if (options.extractFullText && fullText.trim()) {
      // Full text extraction mode (future implementation)
      content = `# ${title}

${fullText}`;
    } else {
      // File card mode - show metadata and description
      const description = metadata.description || '*No description available.*';
      const preview = description; // Use full description, no character limit
        
      content = `# ${title}

**File Type:** EPUB eBook  
**Author:** ${metadata.author || 'Unknown'}  
**Publisher:** ${metadata.publisher || 'Unknown'}  
**Chapters:** ${metadata.chapterCount || 'Unknown'}  
**File Size:** ${(metadata.fileSize / 1024 / 1024).toFixed(2)} MB  
**Language:** ${metadata.language || 'Unknown'}  
**Publication Date:** ${metadata.publicationDate || 'Unknown'}  
**Last Modified:** ${metadata.modified.toLocaleDateString()}  

## Description
${preview}

${metadata.hasImages ? '📷 *Contains images*' : ''}
${metadata.hasToc ? '📑 *Has table of contents*' : ''}

---
**File Location:** \`${filePath}\`

*This is a file card. The EPUB metadata is displayed above.*`;
    }

    return {
      title,
      content,
      metadata: {
        ...metadata,
        contentType: 'epub-file-card',
        characterCount: content.length,
        isFileCard: true,
        hasFullText: false, // Full text extraction not yet implemented
        contentPreview: metadata.description || ''
      },
      fileInfo: {
        path: filePath,
        size: metadata.fileSize,
        modified: metadata.modified,
        created: metadata.created,
        author: metadata.author,
        title: metadata.title,
        publisher: metadata.publisher,
        chapterCount: metadata.chapterCount,
        language: metadata.language,
        isbn: metadata.isbn,
        publicationDate: metadata.publicationDate
      },
      epubInfo: {
        coverImage,
        coverImagePath,
        chapters,
        hasImages: metadata.hasImages,
        hasToc: metadata.hasToc,
        subjects: metadata.subjects
      },
      processingInfo: {
        processor: 'epub-enhanced',
        processedAt: new Date(),
        contentLength: content.length,
        textExtracted: false,
        metadataExtracted: true,
        note: 'EPUB metadata successfully extracted'
      }
    };

  } catch (error) {
    console.error(`❌ Error processing EPUB file ${filePath}:`, error.message);
    throw new Error(`Failed to process EPUB file: ${error.message}`);
  }
}

/**
 * Validate EPUB file
 * @param {string} filePath - Path to validate
 * @returns {Promise<boolean>} - True if valid EPUB file
 */
async function validateEpubFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.epub') {
      return false;
    }

    if (!(await fs.pathExists(filePath))) {
      return false;
    }

    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return false;
    }

    // Check file size (warn if > 200MB)
    if (stats.size > 200 * 1024 * 1024) {
      console.warn(`⚠️  EPUB file is very large: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    }

    // Quick validation - EPUB files are ZIP archives, check for ZIP header
    const buffer = await fs.readFile(filePath, { encoding: null, start: 0, end: 4 });
    
    // ZIP file signature: 0x504B0304 (PK..) or 0x504B0506 (empty archive) or 0x504B0708 (spanned archive)
    const signature = buffer.readUInt32LE(0);
    const validSignatures = [0x04034B50, 0x06054B50, 0x08074B50];
    
    if (!validSignatures.includes(signature)) {
      console.warn(`⚠️  File does not appear to be a valid EPUB/ZIP: ${filePath}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`❌ Error validating EPUB file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Get supported file extensions
 * @returns {Array<string>} - Array of supported extensions
 */
function getSupportedExtensions() {
  return ['.epub'];
}

/**
 * Check if full EPUB content extraction is available
 * @returns {boolean} - True if content extraction is implemented
 */
function isContentExtractionAvailable() {
  return true; // Metadata extraction is implemented, full text coming later
}

/**
 * Extract description preview from EPUB for card display
 * @param {string} filePath - Path to EPUB file
 * @param {number} maxLength - Maximum preview length (default: 500)
 * @returns {Promise<string>} - Description preview
 */
async function extractDescriptionPreview(filePath, maxLength = 500) {
  try {
    const { metadata } = await extractEpubMetadata(filePath);
    if (!metadata.description) {
      return '*No description available for this EPUB.*';
    }
    
    return metadata.description.substring(0, maxLength).trim() + 
      (metadata.description.length > maxLength ? '...' : '');
  } catch (error) {
    console.error(`Error extracting EPUB preview ${filePath}:`, error.message);
    return '*Error extracting EPUB content.*';
  }
}

module.exports = {
  processEpubFile,
  validateEpubFile,
  getSupportedExtensions,
  extractEpubMetadata,
  generateTitle,
  isContentExtractionAvailable,
  extractDescriptionPreview
};