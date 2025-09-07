const fs = require('fs-extra');
const path = require('path');

// Try to require sharp, fallback gracefully if not available
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.warn('Sharp module not available. Image processing will be limited.');
  sharp = null;
}

/**
 * Image File Processor
 * Handles JPEG, JPG, and PNG image files
 */

/**
 * Validate image file
 * @param {string} filePath - Path to image file
 * @returns {Promise<boolean>} - True if valid image file
 */
async function validateImageFile(filePath) {
  try {
    if (!(await fs.pathExists(filePath))) {
      return false;
    }

    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return false;
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return false;
    }

    // If sharp is available, try to read image metadata
    if (sharp) {
      try {
        const metadata = await sharp(filePath).metadata();
        return !!(metadata.width && metadata.height);
      } catch (error) {
        console.warn(`Sharp validation failed for ${filePath}, falling back to basic validation`);
      }
    }

    // Basic validation - just check if file exists and has correct extension
    return true;

  } catch (error) {
    console.error(`Error validating image file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Process image file
 * @param {string} filePath - Path to image file
 * @param {Object} options - Processing options
 * @param {string} options.title - Custom title (optional)
 * @returns {Promise<Object>} - Processing result
 */
async function processImageFile(filePath, options = {}) {
  try {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const stats = await fs.stat(filePath);
    
    // Generate title from filename or use custom title
    const title = options.title || path.basename(fileName, ext)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());

    let metadata = null;
    let content = `# ${title}

**Image Details:**
- **Format:** ${ext.substring(1).toUpperCase()}
- **File Size:** ${(stats.size / 1024).toFixed(1)} KB`;

    // Try to get detailed metadata if sharp is available
    if (sharp) {
      try {
        metadata = await sharp(filePath).metadata();
        content = `# ${title}

**Image Details:**
- **Dimensions:** ${metadata.width} × ${metadata.height} pixels
- **Format:** ${metadata.format?.toUpperCase() || ext.substring(1).toUpperCase()}
- **File Size:** ${(stats.size / 1024).toFixed(1)} KB
- **Color Space:** ${metadata.space || 'Unknown'}
${metadata.density ? `- **Density:** ${metadata.density} DPI` : ''}
${metadata.hasAlpha ? '- **Transparency:** Yes' : ''}`;
      } catch (error) {
        console.warn(`Could not extract detailed metadata for ${filePath}:`, error.message);
      }
    }

    content += `

**File Information:**
- **Original Filename:** ${fileName}
- **File Path:** ${filePath}
`;

    return {
      title,
      content,
      processingInfo: {
        processor: 'image',
        fileType: ext.substring(1), // Remove the dot
        originalPath: filePath,
        metadata: metadata ? {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: stats.size,
          colorSpace: metadata.space,
          density: metadata.density,
          hasAlpha: metadata.hasAlpha,
          channels: metadata.channels
        } : {
          size: stats.size,
          format: ext.substring(1)
        }
      }
    };

  } catch (error) {
    console.error(`Error processing image file ${filePath}:`, error.message);
    throw new Error(`Failed to process image file: ${error.message}`);
  }
}

/**
 * Generate thumbnail for image
 * @param {string} filePath - Path to image file
 * @param {string} outputPath - Path for thumbnail output
 * @param {Object} options - Thumbnail options
 * @param {number} options.width - Thumbnail width (default: 300)
 * @param {number} options.height - Thumbnail height (default: 300)
 * @param {boolean} options.fit - Fit mode (default: 'cover')
 * @returns {Promise<string>} - Path to generated thumbnail
 */
async function generateThumbnail(filePath, outputPath, options = {}) {
  const { width = 300, height = 300, fit = 'cover' } = options;
  
  if (!sharp) {
    throw new Error('Sharp module not available for thumbnail generation');
  }
  
  try {
    await fs.ensureDir(path.dirname(outputPath));
    
    await sharp(filePath)
      .resize(width, height, { fit })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
      
    return outputPath;
  } catch (error) {
    console.error(`Error generating thumbnail for ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Get image dimensions
 * @param {string} filePath - Path to image file
 * @returns {Promise<Object>} - Image dimensions and metadata
 */
async function getImageInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    
    if (!sharp) {
      return {
        size: stats.size,
        format: path.extname(filePath).substring(1)
      };
    }
    
    const metadata = await sharp(filePath).metadata();
    
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: stats.size,
      colorSpace: metadata.space,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      channels: metadata.channels
    };
  } catch (error) {
    console.error(`Error getting image info for ${filePath}:`, error.message);
    throw error;
  }
}

module.exports = {
  validateImageFile,
  processImageFile,
  generateThumbnail,
  getImageInfo
};
