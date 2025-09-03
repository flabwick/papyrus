const fs = require('fs-extra');
const path = require('path');

/**
 * Text File Processor
 * Handles .txt and other plain text files with encoding detection and content processing
 */

/**
 * Detect text encoding (simple heuristic)
 * @param {Buffer} buffer - File buffer
 * @returns {string} - Detected encoding
 */
function detectEncoding(buffer) {
  // Check for BOM markers
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf8'; // UTF-8 BOM
  }
  
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'utf16le'; // UTF-16 LE BOM
  }
  
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'utf16be'; // UTF-16 BE BOM
  }

  // Simple ASCII/UTF-8 detection
  let nonAsciiCount = 0;
  let nullCount = 0;
  
  for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
    if (buffer[i] === 0) {
      nullCount++;
    } else if (buffer[i] > 127) {
      nonAsciiCount++;
    }
  }

  // If too many null bytes, likely binary
  if (nullCount > 10) {
    throw new Error('File appears to be binary, not text');
  }

  // Default to UTF-8 for text files
  return 'utf8';
}

/**
 * Generate card title from filename
 * @param {string} fileName - Original filename
 * @param {string} content - File content for title extraction
 * @returns {string} - Generated title
 */
function generateTitle(fileName, content) {
  // Try to extract title from first line if it looks like a title
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length > 0) {
    const firstLine = lines[0];
    
    // If first line is short and doesn't end with punctuation, use as title
    if (firstLine.length <= 100 && !/[.!?]$/.test(firstLine)) {
      // Remove common title prefixes
      const cleanedTitle = firstLine
        .replace(/^(title|subject|topic):\s*/i, '')
        .replace(/^#+\s*/, '') // Remove markdown heading syntax
        .trim();
      
      if (cleanedTitle.length > 0 && cleanedTitle.length <= 80) {
        return cleanedTitle;
      }
    }
  }

  // Fall back to filename-based title
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
 * Clean and normalize text content
 * @param {string} content - Raw content
 * @returns {string} - Cleaned content
 */
function cleanContent(content) {
  // Normalize line endings
  let normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Remove excessive whitespace
  normalized = normalized.replace(/[ \t]+$/gm, ''); // Trailing spaces
  normalized = normalized.replace(/\n{3,}/g, '\n\n'); // Excessive blank lines
  
  // Remove common text artifacts
  normalized = normalized.replace(/\u00A0/g, ' '); // Non-breaking spaces
  normalized = normalized.replace(/\u2028/g, '\n'); // Line separator
  normalized = normalized.replace(/\u2029/g, '\n\n'); // Paragraph separator
  
  // Clean up special characters that might cause issues
  normalized = normalized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  
  return normalized.trim();
}

/**
 * Extract metadata from text content
 * @param {string} content - Text content
 * @returns {Object} - Extracted metadata
 */
function extractMetadata(content) {
  const metadata = {
    wordCount: 0,
    characterCount: content.length,
    lineCount: 0,
    paragraphCount: 0,
    language: 'unknown'
  };

  // Count lines
  metadata.lineCount = content.split('\n').length;

  // Count paragraphs (blocks of text separated by blank lines)
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  metadata.paragraphCount = paragraphs.length;

  // Count words (simple approximation)
  const words = content.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(word => word.length > 0);
  metadata.wordCount = words.length;

  // Simple language detection (very basic)
  if (content.length > 100) {
    const text = content.toLowerCase();
    
    // Check for common English words
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const englishCount = englishWords.reduce((count, word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      const matches = text.match(regex);
      return count + (matches ? matches.length : 0);
    }, 0);

    if (englishCount > words.length * 0.05) {
      metadata.language = 'english';
    }
  }

  // Detect if content looks like code
  const codeIndicators = [
    /function\s+\w+\s*\(/,
    /class\s+\w+/,
    /import\s+.+from/,
    /def\s+\w+\s*\(/,
    /console\.log\(/,
    /print\s*\(/,
    /\{\s*\n[\s\S]*\n\s*\}/
  ];

  const codeMatches = codeIndicators.reduce((count, regex) => {
    return count + (content.match(regex) ? 1 : 0);
  }, 0);

  if (codeMatches >= 2) {
    metadata.contentType = 'code';
  } else if (metadata.paragraphCount > metadata.lineCount * 0.3) {
    metadata.contentType = 'prose';
  } else {
    metadata.contentType = 'mixed';
  }

  return metadata;
}

/**
 * Process a text file
 * @param {string} filePath - Path to the text file
 * @param {Object} options - Processing options
 * @param {string} options.title - Custom title (optional)
 * @param {string} options.encoding - Force specific encoding (optional)
 * @returns {Promise<Object>} - Processed file data
 */
async function processTextFile(filePath, options = {}) {
  try {
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file as buffer first for encoding detection
    const buffer = await fs.readFile(filePath);
    
    // Detect encoding
    let encoding = options.encoding;
    if (!encoding) {
      try {
        encoding = detectEncoding(buffer);
      } catch (error) {
        throw new Error(`Cannot process file - ${error.message}`);
      }
    }

    // Read file content with detected encoding
    const rawContent = buffer.toString(encoding);
    
    // Clean content
    const cleanedContent = cleanContent(rawContent);
    
    if (cleanedContent.length === 0) {
      throw new Error('File is empty or contains no readable text');
    }

    // Generate title
    const title = options.title || generateTitle(path.basename(filePath), cleanedContent);
    
    // Extract metadata
    const metadata = extractMetadata(cleanedContent);
    
    // Get file stats
    const stats = await fs.stat(filePath);
    
    return {
      title,
      content: cleanedContent,
      originalContent: rawContent,
      metadata,
      fileInfo: {
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime || stats.ctime,
        encoding
      },
      processingInfo: {
        processor: 'text',
        processedAt: new Date(),
        contentLength: cleanedContent.length,
        originalLength: rawContent.length,
        encoding
      }
    };

  } catch (error) {
    console.error(`❌ Error processing text file ${filePath}:`, error.message);
    throw new Error(`Failed to process text file: ${error.message}`);
  }
}

/**
 * Validate text file
 * @param {string} filePath - Path to validate
 * @returns {Promise<boolean>} - True if valid text file
 */
async function validateTextFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const supportedExtensions = getSupportedExtensions();
    
    if (!supportedExtensions.includes(ext)) {
      return false;
    }

    if (!(await fs.pathExists(filePath))) {
      return false;
    }

    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return false;
    }

    // Check if file is too large (>50MB for text files)
    if (stats.size > 50 * 1024 * 1024) {
      console.warn(`⚠️  Text file is very large: ${filePath} (${stats.size} bytes)`);
      return false;
    }

    // Quick check for binary content (read first 1KB)
    const buffer = await fs.readFile(filePath, { encoding: null, flag: 'r' });
    const sampleSize = Math.min(1024, buffer.length);
    const sample = buffer.slice(0, sampleSize);
    
    // Count null bytes and non-printable characters
    let nullBytes = 0;
    let nonPrintable = 0;
    
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        nullBytes++;
      } else if (sample[i] < 32 && sample[i] !== 9 && sample[i] !== 10 && sample[i] !== 13) {
        nonPrintable++;
      }
    }

    // If more than 1% null bytes or 10% non-printable, likely binary
    if (nullBytes > sampleSize * 0.01 || nonPrintable > sampleSize * 0.1) {
      console.warn(`⚠️  File appears to be binary: ${filePath}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`❌ Error validating text file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Get supported file extensions
 * @returns {Array<string>} - Array of supported extensions
 */
function getSupportedExtensions() {
  return ['.txt', '.text', '.log', '.ini', '.cfg', '.conf', '.csv', '.tsv', '.rtf'];
}

module.exports = {
  processTextFile,
  validateTextFile,
  getSupportedExtensions,
  detectEncoding,
  generateTitle,
  cleanContent,
  extractMetadata
};