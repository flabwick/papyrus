const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');

/**
 * Enhanced PDF File Processor
 * Extracts metadata, text content, and page information from PDF files
 */

/**
 * Extract comprehensive metadata from PDF file
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<Object>} - Complete PDF metadata
 */
async function extractPdfMetadata(filePath) {
  const stats = await fs.stat(filePath);
  const fileName = path.basename(filePath, path.extname(filePath));
  
  try {
    // Read and parse PDF file
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    
    // Extract metadata from PDF
    const metadata = {
      fileName,
      fileSize: stats.size,
      fileType: 'pdf',
      modified: stats.mtime,
      created: stats.birthtime || stats.ctime,
      // PDF-specific metadata
      pageCount: pdfData.numpages || 0,
      title: pdfData.info?.Title || null,
      author: pdfData.info?.Author || null,
      subject: pdfData.info?.Subject || null,
      creator: pdfData.info?.Creator || null,
      producer: pdfData.info?.Producer || null,
      creationDate: pdfData.info?.CreationDate ? new Date(pdfData.info.CreationDate) : null,
      modificationDate: pdfData.info?.ModDate ? new Date(pdfData.info.ModDate) : null,
      encrypted: pdfData.info?.IsAcroFormPresent || false,
      version: pdfData.version || null,
      // Content statistics
      textLength: pdfData.text?.length || 0,
      wordCount: pdfData.text ? pdfData.text.split(/\s+/).filter(word => word.length > 0).length : 0
    };

    return { metadata, fullText: pdfData.text || '' };
  } catch (error) {
    console.error(`Error parsing PDF ${filePath}:`, error.message);
    
    // Fallback to basic file metadata if PDF parsing fails
    const metadata = {
      fileName,
      fileSize: stats.size,
      fileType: 'pdf',
      modified: stats.mtime,
      created: stats.birthtime || stats.ctime,
      pageCount: null,
      title: null,
      author: null,
      subject: null,
      creator: null,
      producer: null,
      creationDate: null,
      modificationDate: null,
      encrypted: false,
      version: null,
      textLength: 0,
      wordCount: 0,
      parseError: error.message
    };

    return { metadata, fullText: '' };
  }
}

/**
 * Generate card title from PDF filename
 * @param {string} fileName - PDF filename
 * @param {Object} metadata - PDF metadata
 * @returns {string} - Generated title
 */
function generateTitle(fileName, metadata) {
  // Use PDF title metadata if available (would be implemented later)
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
 * Process a PDF file with full text extraction
 * @param {string} filePath - Path to the PDF file
 * @param {Object} options - Processing options
 * @param {string} options.title - Custom title (optional)
 * @param {boolean} options.extractFullText - Whether to extract full text (default: false for file cards)
 * @returns {Promise<Object>} - Processed PDF data
 */
async function processPdfFile(filePath, options = {}) {
  try {
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Extract metadata and optionally full text
    const { metadata, fullText } = await extractPdfMetadata(filePath);
    
    // Generate title
    const title = options.title || generateTitle(path.basename(filePath), metadata);
    
    // Create content for file card display
    let content;
    if (options.extractFullText && fullText.trim()) {
      // Full text extraction mode
      content = `# ${title}

${fullText}`;
    } else {
      // File card mode - show metadata and preview
      const preview = fullText.trim() ? 
        fullText.substring(0, 500).trim() + (fullText.length > 500 ? '...' : '') : 
        '*No text content could be extracted from this PDF.*';
        
      content = `# ${title}

**File Type:** PDF Document  
**Pages:** ${metadata.pageCount || 'Unknown'}  
**File Size:** ${(metadata.fileSize / 1024 / 1024).toFixed(2)} MB  
**Author:** ${metadata.author || 'Unknown'}  
**Last Modified:** ${metadata.modified.toLocaleDateString()}  

## Content Preview
${preview}

---
**File Location:** \`${filePath}\`

*This is a file card. The PDF can be viewed inline when expanded.*`;
    }

    return {
      title,
      content,
      metadata: {
        ...metadata,
        contentType: 'pdf-file-card',
        characterCount: content.length,
        isFileCard: true,
        hasFullText: !!fullText.trim(),
        contentPreview: fullText.substring(0, 500).trim()
      },
      fileInfo: {
        path: filePath,
        size: metadata.fileSize,
        modified: metadata.modified,
        created: metadata.created,
        pageCount: metadata.pageCount,
        author: metadata.author,
        title: metadata.title
      },
      processingInfo: {
        processor: 'pdf-enhanced',
        processedAt: new Date(),
        contentLength: content.length,
        textExtracted: !!fullText.trim(),
        fullTextLength: fullText.length,
        note: fullText.trim() ? 'PDF text successfully extracted' : 'PDF parsing completed but no text extracted'
      }
    };

  } catch (error) {
    console.error(`❌ Error processing PDF file ${filePath}:`, error.message);
    throw new Error(`Failed to process PDF file: ${error.message}`);
  }
}

/**
 * Validate PDF file
 * @param {string} filePath - Path to validate
 * @returns {Promise<boolean>} - True if valid PDF file
 */
async function validatePdfFile(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.pdf') {
      return false;
    }

    if (!(await fs.pathExists(filePath))) {
      return false;
    }

    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return false;
    }

    // Check file size (warn if > 100MB)
    if (stats.size > 100 * 1024 * 1024) {
      console.warn(`⚠️  PDF file is very large: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    }

    // Quick validation - check if file starts with PDF header
    const buffer = await fs.readFile(filePath, { encoding: null, start: 0, end: 8 });
    const header = buffer.toString('ascii', 0, 4);
    
    if (header !== '%PDF') {
      console.warn(`⚠️  File does not appear to be a valid PDF: ${filePath}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`❌ Error validating PDF file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Get supported file extensions
 * @returns {Array<string>} - Array of supported extensions
 */
function getSupportedExtensions() {
  return ['.pdf'];
}

/**
 * Check if full PDF text extraction is available
 * @returns {boolean} - True if text extraction is implemented
 */
function isTextExtractionAvailable() {
  return true; // Now fully implemented
}

/**
 * Extract text preview from PDF for card display
 * @param {string} filePath - Path to PDF file
 * @param {number} maxLength - Maximum preview length (default: 500)
 * @returns {Promise<string>} - Text preview
 */
async function extractTextPreview(filePath, maxLength = 500) {
  try {
    const { fullText } = await extractPdfMetadata(filePath);
    if (!fullText.trim()) {
      return '*No text content available in this PDF.*';
    }
    
    return fullText.substring(0, maxLength).trim() + (fullText.length > maxLength ? '...' : '');
  } catch (error) {
    console.error(`Error extracting PDF preview ${filePath}:`, error.message);
    return '*Error extracting PDF content.*';
  }
}

module.exports = {
  processPdfFile,
  validatePdfFile,
  getSupportedExtensions,
  extractPdfMetadata,
  generateTitle,
  isTextExtractionAvailable,
  extractTextPreview
};