const express = require('express');
const router = express.Router();
const Library = require('../models/Library');
const Page = require('../models/Page');
const { requireAuth } = require('../middleware/auth');
const { validateLibraryName } = require('../utils/fileSystem');
const { recreateWelcomeStream } = require('../services/welcomeContent');

// All library routes require authentication
router.use(requireAuth);

// Helper function for library ownership validation
const validateLibraryOwnership = async (libraryId, userId) => {
  const library = await Library.findById(libraryId);
  if (!library) {
    return { valid: false, status: 404, error: 'Library not found', message: 'The requested library does not exist' };
  }
  
  if (library.userId !== userId) {
    return { valid: false, status: 403, error: 'Access denied', message: 'You do not have permission to access this library' };
  }
  
  return { valid: true, library };
};

// Input validation helpers
const validateLibraryInput = (name) => {
  const errors = {};
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.name = 'Library name is required';
  } else if (!validateLibraryName(name.trim())) {
    errors.name = 'Library name contains invalid characters or format';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

const validateUUID = (id) => {
  // Accept any valid UUID format, including nil UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

/**
 * GET /api/libraries
 * Get all libraries for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const libraries = await Library.findByUserId(req.session.userId);
    
    // Get additional metadata for each library
    const librariesWithMetadata = await Promise.all(
      libraries.map(async (library) => {
        return await library.toJSON();
      })
    );

    res.json({
      libraries: librariesWithMetadata,
      count: librariesWithMetadata.length
    });

  } catch (error) {
    console.error('❌ Get libraries error:', error);
    res.status(500).json({
      error: 'Failed to retrieve libraries',
      message: 'An error occurred while fetching your libraries'
    });
  }
});

/**
 * POST /api/libraries
 * Create a new library for the authenticated user
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    
    // Validate input
    const validation = validateLibraryInput(name);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        fields: validation.errors
      });
    }

    // Create library
    const library = await Library.create(req.session.userId, name.trim());
    const libraryData = await library.toJSON();

    res.status(201).json({
      library: libraryData,
      message: 'Library created successfully'
    });

  } catch (error) {
    console.error('❌ Create library error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Library already exists',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to create library',
      message: 'An error occurred while creating the library'
    });
  }
});

/**
 * GET /api/libraries/:id
 * Get a specific library by ID (must belong to authenticated user)
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid library ID',
        message: 'Library ID must be a valid UUID'
      });
    }

    const library = await Library.findById(id);
    
    if (!library) {
      return res.status(404).json({
        error: 'Library not found',
        message: 'The requested library does not exist'
      });
    }

    // Check ownership
    if (library.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this library'
      });
    }

    const libraryData = await library.toJSON();

    res.json({
      library: libraryData
    });

  } catch (error) {
    console.error('❌ Get library error:', error);
    res.status(500).json({
      error: 'Failed to retrieve library',
      message: 'An error occurred while fetching the library'
    });
  }
});

/**
 * GET /api/libraries/:id/pages
 * Get all pages for a specific library
 */
router.get('/:id/pages', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid library ID',
        message: 'Library ID must be a valid UUID'
      });
    }

    const library = await Library.findById(id);
    
    if (!library) {
      return res.status(404).json({
        error: 'Library not found',
        message: 'The requested library does not exist'
      });
    }

    // Check ownership
    if (library.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this library'
      });
    }

    const pages = await library.getPages();

    res.json({
      pages: pages,
      count: pages.length,
      libraryId: library.id,
      libraryName: library.name
    });

  } catch (error) {
    console.error('❌ Get library pages error:', error);
    res.status(500).json({
      error: 'Failed to retrieve pages',
      message: 'An error occurred while fetching library pages'
    });
  }
});

/**
 * GET /api/libraries/:id/pages/check-title
 * Check if a page title exists in the library
 */
router.get('/:id/pages/check-title', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.query;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid library ID',
        message: 'Library ID must be a valid UUID'
      });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        error: 'Invalid title',
        message: 'Title parameter is required'
      });
    }

    const library = await Library.findById(id);
    
    if (!library) {
      return res.status(404).json({
        error: 'Library not found',
        message: 'The requested library does not exist'
      });
    }

    // Check ownership
    if (library.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this library'
      });
    }

    // Check if page with this title exists
    const existingPage = await Page.findByLibraryAndTitle(id, title.trim());

    res.json({
      exists: !!existingPage,
      title: title.trim()
    });

  } catch (error) {
    console.error('❌ Check title error:', error);
    res.status(500).json({
      error: 'Failed to check title',
      message: 'An error occurred while checking page title'
    });
  }
});

/**
 * GET /api/libraries/:id/files
 * Get all files in a library
 */
router.get('/:id/files', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid library ID',
        message: 'Library ID must be a valid UUID'
      });
    }

    const library = await Library.findById(id);
    
    if (!library) {
      return res.status(404).json({
        error: 'Library not found',
        message: 'The requested library does not exist'
      });
    }

    // Check ownership
    if (library.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this library'
      });
    }

    // Get files from database
    const db = require('../models/database');
    const result = await db.query(`
      SELECT 
        f.*,
        CASE 
          WHEN f.file_type = 'pdf' THEN f.pdf_title
          WHEN f.file_type = 'epub' THEN f.epub_title
          ELSE f.file_name
        END as display_title
      FROM files f 
      WHERE f.library_id = $1
      ORDER BY f.uploaded_at DESC
    `, [id]);

    const files = result.rows || [];
    
    res.json({
      files: files,
      totalFiles: files.length,
      libraryId: id,
      libraryName: library.name
    });

  } catch (error) {
    console.error('❌ Get library files error:', error);
    res.status(500).json({
      error: 'Failed to retrieve files',
      message: 'An error occurred while fetching library files'
    });
  }
});

/**
 * DELETE /api/libraries/:id
 * Delete a library (archives files, removes from database)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid library ID',
        message: 'Library ID must be a valid UUID'
      });
    }

    const library = await Library.findById(id);
    
    if (!library) {
      return res.status(404).json({
        error: 'Library not found',
        message: 'The requested library does not exist'
      });
    }

    // Check ownership
    if (library.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to delete this library'
      });
    }

    // Store library name for response
    const libraryName = library.name;
    
    // Delete library (archives files and removes from database)
    await library.delete();

    res.json({
      message: 'Library deleted successfully',
      libraryName: libraryName,
      libraryId: id
    });

  } catch (error) {
    console.error('❌ Delete library error:', error);
    res.status(500).json({
      error: 'Failed to delete library',
      message: 'An error occurred while deleting the library'
    });
  }
});

/**
 * POST /api/libraries/:id/sync
 * Force synchronization of library files with database
 */
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid library ID',
        message: 'Library ID must be a valid UUID'
      });
    }

    const library = await Library.findById(id);
    
    if (!library) {
      return res.status(404).json({
        error: 'Library not found',
        message: 'The requested library does not exist'
      });
    }

    // Check ownership
    if (library.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to sync this library'
      });
    }

    // Force sync
    const pageCount = await library.forceSync();

    res.json({
      message: 'Library synchronized successfully',
      libraryId: library.id,
      libraryName: library.name,
      pageCount: pageCount,
      lastScannedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Sync library error:', error);
    res.status(500).json({
      error: 'Failed to sync library',
      message: 'An error occurred while synchronizing the library'
    });
  }
});

/**
 * POST /api/libraries/:id/welcome
 * Recreate welcome stream for existing library (if user deleted it)
 */
router.post('/:id/welcome', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid library ID',
        message: 'Library ID must be a valid UUID'
      });
    }

    const library = await Library.findById(id);
    
    if (!library) {
      return res.status(404).json({
        error: 'Library not found',
        message: 'The requested library does not exist'
      });
    }

    // Check ownership
    if (library.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this library'
      });
    }

    // Recreate welcome stream
    const result = await recreateWelcomeStream(library.id);

    res.status(201).json({
      ...result,
      libraryId: library.id,
      libraryName: library.name
    });

  } catch (error) {
    console.error('❌ Recreate welcome stream error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Welcome stream already exists',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to recreate welcome stream',
      message: 'An error occurred while recreating the welcome stream'
    });
  }
});

/**
 * GET /api/libraries/:id/files
 * Get all files in a library
 */
router.get('/:id/files', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid library ID',
        message: 'Library ID must be a valid UUID'
      });
    }
    
    const library = await Library.findById(id);
    
    if (!library) {
      return res.status(404).json({
        error: 'Library not found',
        message: 'The requested library does not exist'
      });
    }

    // Check ownership
    if (library.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this library'
      });
    }

    // Get files from database
    const { query } = require('../models/database');
    const result = await query(`
      SELECT 
        id,
        library_id,
        file_name,
        file_type,
        file_size,
        file_path,
        pdf_page_count,
        pdf_author,
        pdf_title,
        epub_title,
        epub_author,
        epub_description,
        epub_chapter_count,
        content_preview,
        processing_status,
        uploaded_at
      FROM files
      WHERE library_id = $1
      ORDER BY uploaded_at DESC
    `, [id]);

    const files = result.rows.map(row => ({
      id: row.id,
      libraryId: row.library_id,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      filePath: row.file_path,
      // Use appropriate title/author based on file type
      title: row.file_type === 'epub' ? row.epub_title : row.pdf_title,
      author: row.file_type === 'epub' ? row.epub_author : row.pdf_author,
      description: row.epub_description,
      pageCount: row.pdf_page_count,
      chapterCount: row.epub_chapter_count,
      contentPreview: row.content_preview,
      processingStatus: row.processing_status,
      uploadedAt: row.uploaded_at
    }));

    res.json({
      files,
      count: files.length,
      libraryId: id
    });

  } catch (error) {
    console.error('❌ Get library files error:', error);
    res.status(500).json({
      error: 'Failed to get library files',
      message: 'An error occurred while fetching library files'
    });
  }
});

/**
 * DELETE /api/libraries/:id/files/:fileId
 * Delete a file from a library
 */
router.delete('/:id/files/:fileId', async (req, res) => {
  try {
    const { id, fileId } = req.params;
    
    // Validate UUID formats
    if (!validateUUID(id) || !validateUUID(fileId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Library ID and file ID must be valid UUIDs'
      });
    }
    
    const library = await Library.findById(id);
    
    if (!library) {
      return res.status(404).json({
        error: 'Library not found',
        message: 'The requested library does not exist'
      });
    }

    // Check ownership
    if (library.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to delete files from this library'
      });
    }

    // Get file information before deletion
    const { query } = require('../models/database');
    const fileResult = await query(`
      SELECT file_path, file_name, cover_image_path
      FROM files
      WHERE id = $1 AND library_id = $2
    `, [fileId, id]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The requested file does not exist in this library'
      });
    }

    const file = fileResult.rows[0];
    const fs = require('fs-extra');

    // Delete file from filesystem
    try {
      if (file.file_path && await fs.pathExists(file.file_path)) {
        await fs.remove(file.file_path);
        console.log(`✅ Deleted file from filesystem: ${file.file_path}`);
      }

      // Delete cover image if it exists
      if (file.cover_image_path && await fs.pathExists(file.cover_image_path)) {
        await fs.remove(file.cover_image_path);
        console.log(`✅ Deleted cover image: ${file.cover_image_path}`);
      }
    } catch (fsError) {
      console.warn('⚠️ Could not delete file from filesystem:', fsError.message);
      // Continue with database deletion even if file system deletion fails
    }

    // Remove file references from all streams first
    await query('DELETE FROM stream_files WHERE file_id = $1', [fileId]);

    // Delete file record from database
    await query('DELETE FROM files WHERE id = $1', [fileId]);

    res.json({
      success: true,
      message: `File "${file.file_name}" deleted successfully`,
      fileId,
      fileName: file.file_name
    });

  } catch (error) {
    console.error('❌ Delete file error:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      message: 'An error occurred while deleting the file'
    });
  }
});

/**
 * GET /api/libraries/:id/files/:fileId/cover
 * Serve cover image for a file
 */
router.get('/:id/files/:fileId/cover', async (req, res) => {
  try {
    const { id: libraryId, fileId } = req.params;
    
    // Validate library ownership
    const libraryValidation = await validateLibraryOwnership(libraryId, req.session.userId);
    if (!libraryValidation.valid) {
      return res.status(libraryValidation.status).json({
        error: libraryValidation.error,
        message: libraryValidation.message
      });
    }

    const library = libraryValidation.library;

    // Get file info from database
    const { query } = require('../models/database');
    const fileResult = await query(`
      SELECT file_path, file_name, file_type, cover_image_path
      FROM files
      WHERE id = $1 AND library_id = $2
    `, [fileId, libraryId]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    const file = fileResult.rows[0];
    
    // Check if this is an EPUB file
    if (file.file_type !== 'epub') {
      return res.status(400).json({
        error: 'Invalid file type',
        message: 'Cover images are only available for EPUB files'
      });
    }

    // Construct cover image path
    const path = require('path');
    const fs = require('fs-extra');
    
    let coverPath = file.cover_image_path;
    
    // If no cover_image_path in database, try to find it in the covers subdirectory
    if (!coverPath) {
      const libraryFolderPath = library.folderPath || 
                                path.join(process.cwd(), 'backend', 'storage', library.userId, 'libraries', library.name);
      const coversDir = path.join(libraryFolderPath, 'files', 'covers');
      const baseFileName = path.basename(file.file_name, '.epub');
      
      // Try different extensions
      const possibleExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      for (const ext of possibleExtensions) {
        const possiblePath = path.join(coversDir, `${baseFileName}_cover${ext}`);
        if (await fs.pathExists(possiblePath)) {
          coverPath = possiblePath;
          break;
        }
      }
    }

    if (!coverPath || !(await fs.pathExists(coverPath))) {
      return res.status(404).json({
        error: 'Cover image not found',
        message: 'No cover image available for this EPUB file'
      });
    }

    // Determine content type from file extension
    const ext = path.extname(coverPath).toLowerCase();
    let contentType = 'image/jpeg'; // default
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';

    // Serve the image file
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    const imageBuffer = await fs.readFile(coverPath);
    res.send(imageBuffer);

  } catch (error) {
    console.error('❌ Serve cover image error:', error);
    res.status(500).json({
      error: 'Failed to serve cover image',
      message: 'An error occurred while serving the cover image'
    });
  }
});

module.exports = router;