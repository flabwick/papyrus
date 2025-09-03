const fs = require('fs-extra');
const path = require('path');

/**
 * Markdown File Processor
 * Handles .md files with frontmatter extraction and content processing
 */

/**
 * Extract frontmatter from markdown content
 * @param {string} content - Raw markdown content
 * @returns {Object} - { frontmatter, content }
 */
function extractFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return {
      frontmatter: {},
      content: content
    };
  }

  const frontmatterText = match[1];
  const contentWithoutFrontmatter = match[2];
  
  // Simple YAML-like frontmatter parsing
  const frontmatter = {};
  const lines = frontmatterText.split('\n');
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      
      // Remove quotes if present
      const cleanedValue = value.replace(/^["']|["']$/g, '');
      frontmatter[key] = cleanedValue;
    }
  }

  return {
    frontmatter,
    content: contentWithoutFrontmatter.trim()
  };
}

/**
 * Generate card title from filename or frontmatter
 * @param {string} fileName - Original filename
 * @param {Object} frontmatter - Extracted frontmatter
 * @returns {string} - Generated title
 */
function generateTitle(fileName, frontmatter) {
  // Use title from frontmatter if available
  if (frontmatter.title) {
    return frontmatter.title;
  }

  // Use filename without extension and clean it up
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
 * Clean and normalize markdown content
 * @param {string} content - Raw content
 * @returns {string} - Cleaned content
 */
function cleanContent(content) {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Remove excessive blank lines (more than 2 consecutive)
  const cleanedLines = normalized.replace(/\n{3,}/g, '\n\n');
  
  // Trim whitespace from each line
  const lines = cleanedLines.split('\n').map(line => line.trimEnd());
  
  return lines.join('\n').trim();
}

/**
 * Extract metadata from markdown content
 * @param {string} content - Markdown content
 * @param {Object} frontmatter - Extracted frontmatter
 * @returns {Object} - Extracted metadata
 */
function extractMetadata(content, frontmatter) {
  const metadata = {
    wordCount: 0,
    characterCount: content.length,
    headingCount: 0,
    linkCount: 0,
    tags: [],
    ...frontmatter
  };

  // Count words (simple approximation)
  const words = content.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(word => word.length > 0);
  metadata.wordCount = words.length;

  // Count headings
  const headings = content.match(/^#+\s/gm);
  metadata.headingCount = headings ? headings.length : 0;

  // Count markdown links [text](url)
  const markdownLinks = content.match(/\[([^\]]+)\]\([^)]+\)/g);
  metadata.linkCount = markdownLinks ? markdownLinks.length : 0;

  // Extract tags from frontmatter or content
  if (frontmatter.tags) {
    if (Array.isArray(frontmatter.tags)) {
      metadata.tags = frontmatter.tags;
    } else if (typeof frontmatter.tags === 'string') {
      metadata.tags = frontmatter.tags.split(',').map(tag => tag.trim());
    }
  }

  // Extract hashtags from content if no frontmatter tags
  if (metadata.tags.length === 0) {
    const hashtags = content.match(/#[\w-]+/g);
    if (hashtags) {
      metadata.tags = hashtags.map(tag => tag.substring(1));
    }
  }

  return metadata;
}

/**
 * Process a markdown file
 * @param {string} filePath - Path to the markdown file
 * @param {Object} options - Processing options
 * @param {string} options.title - Custom title (optional)
 * @returns {Promise<Object>} - Processed file data
 */
async function processMarkdownFile(filePath, options = {}) {
  try {
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file content
    const rawContent = await fs.readFile(filePath, 'utf8');
    
    // Extract frontmatter
    const { frontmatter, content } = extractFrontmatter(rawContent);
    
    // Clean content
    const cleanedContent = cleanContent(content);
    
    // Generate title
    const title = options.title || generateTitle(path.basename(filePath), frontmatter);
    
    // Extract metadata
    const metadata = extractMetadata(cleanedContent, frontmatter);
    
    // Get file stats
    const stats = await fs.stat(filePath);
    
    return {
      title,
      content: cleanedContent,
      originalContent: rawContent,
      frontmatter,
      metadata,
      fileInfo: {
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime || stats.ctime
      },
      processingInfo: {
        processor: 'markdown',
        processedAt: new Date(),
        contentLength: cleanedContent.length,
        originalLength: rawContent.length
      }
    };

  } catch (error) {
    console.error(`❌ Error processing markdown file ${filePath}:`, error.message);
    throw new Error(`Failed to process markdown file: ${error.message}`);
  }
}

/**
 * Validate markdown file
 * @param {string} filePath - Path to validate
 * @returns {Promise<boolean>} - True if valid markdown file
 */
async function validateMarkdownFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.md' && ext !== '.markdown') {
      return false;
    }

    if (!(await fs.pathExists(filePath))) {
      return false;
    }

    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return false;
    }

    // Check if file is too large (>10MB)
    if (stats.size > 10 * 1024 * 1024) {
      console.warn(`⚠️  Markdown file is very large: ${filePath} (${stats.size} bytes)`);
    }

    return true;
  } catch (error) {
    console.error(`❌ Error validating markdown file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Get supported file extensions
 * @returns {Array<string>} - Array of supported extensions
 */
function getSupportedExtensions() {
  return ['.md', '.markdown'];
}

module.exports = {
  processMarkdownFile,
  validateMarkdownFile,
  getSupportedExtensions,
  extractFrontmatter,
  generateTitle,
  cleanContent,
  extractMetadata
};