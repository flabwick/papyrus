const express = require('express');
const router = express.Router();
const Brain = require('../models/Brain');
const Card = require('../models/Card');
const { requireAuth } = require('../middleware/auth');
const { validateBrainName } = require('../utils/fileSystem');
const { recreateWelcomeStream } = require('../services/welcomeContent');

// All brain routes require authentication
router.use(requireAuth);

// Helper function for brain ownership validation
const validateBrainOwnership = async (brainId, userId) => {
  const brain = await Brain.findById(brainId);
  if (!brain) {
    return { valid: false, status: 404, error: 'Brain not found', message: 'The requested brain does not exist' };
  }
  
  if (brain.userId !== userId) {
    return { valid: false, status: 403, error: 'Access denied', message: 'You do not have permission to access this brain' };
  }
  
  return { valid: true, brain };
};

// Input validation helpers
const validateBrainInput = (name) => {
  const errors = {};
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.name = 'Brain name is required';
  } else if (!validateBrainName(name.trim())) {
    errors.name = 'Brain name contains invalid characters or format';
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
 * GET /api/brains
 * Get all brains for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const brains = await Brain.findByUserId(req.session.userId);
    
    // Get additional metadata for each brain
    const brainsWithMetadata = await Promise.all(
      brains.map(async (brain) => {
        return await brain.toJSON();
      })
    );

    res.json({
      brains: brainsWithMetadata,
      count: brainsWithMetadata.length
    });

  } catch (error) {
    console.error('❌ Get brains error:', error);
    res.status(500).json({
      error: 'Failed to retrieve brains',
      message: 'An error occurred while fetching your brains'
    });
  }
});

/**
 * POST /api/brains
 * Create a new brain for the authenticated user
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    
    // Validate input
    const validation = validateBrainInput(name);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        fields: validation.errors
      });
    }

    // Create brain
    const brain = await Brain.create(req.session.userId, name.trim());
    const brainData = await brain.toJSON();

    res.status(201).json({
      brain: brainData,
      message: 'Brain created successfully'
    });

  } catch (error) {
    console.error('❌ Create brain error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Brain already exists',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to create brain',
      message: 'An error occurred while creating the brain'
    });
  }
});

/**
 * GET /api/brains/:id
 * Get a specific brain by ID (must belong to authenticated user)
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Brain ID must be a valid UUID'
      });
    }

    const brain = await Brain.findById(id);
    
    if (!brain) {
      return res.status(404).json({
        error: 'Brain not found',
        message: 'The requested brain does not exist'
      });
    }

    // Check ownership
    if (brain.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this brain'
      });
    }

    const brainData = await brain.toJSON();

    res.json({
      brain: brainData
    });

  } catch (error) {
    console.error('❌ Get brain error:', error);
    res.status(500).json({
      error: 'Failed to retrieve brain',
      message: 'An error occurred while fetching the brain'
    });
  }
});

/**
 * GET /api/brains/:id/cards
 * Get all cards for a specific brain
 */
router.get('/:id/cards', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Brain ID must be a valid UUID'
      });
    }

    const brain = await Brain.findById(id);
    
    if (!brain) {
      return res.status(404).json({
        error: 'Brain not found',
        message: 'The requested brain does not exist'
      });
    }

    // Check ownership
    if (brain.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this brain'
      });
    }

    const cards = await brain.getCards();

    res.json({
      cards: cards,
      count: cards.length,
      brainId: brain.id,
      brainName: brain.name
    });

  } catch (error) {
    console.error('❌ Get brain cards error:', error);
    res.status(500).json({
      error: 'Failed to retrieve cards',
      message: 'An error occurred while fetching brain cards'
    });
  }
});

/**
 * GET /api/brains/:id/cards/check-title
 * Check if a card title exists in the brain
 */
router.get('/:id/cards/check-title', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.query;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Brain ID must be a valid UUID'
      });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        error: 'Invalid title',
        message: 'Title parameter is required'
      });
    }

    const brain = await Brain.findById(id);
    
    if (!brain) {
      return res.status(404).json({
        error: 'Brain not found',
        message: 'The requested brain does not exist'
      });
    }

    // Check ownership
    if (brain.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this brain'
      });
    }

    // Check if card with this title exists
    const existingCard = await Card.findByBrainAndTitle(id, title.trim());

    res.json({
      exists: !!existingCard,
      title: title.trim()
    });

  } catch (error) {
    console.error('❌ Check title error:', error);
    res.status(500).json({
      error: 'Failed to check title',
      message: 'An error occurred while checking card title'
    });
  }
});

/**
 * GET /api/brains/:id/files
 * Get all files in a brain
 */
router.get('/:id/files', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Brain ID must be a valid UUID'
      });
    }

    const brain = await Brain.findById(id);
    
    if (!brain) {
      return res.status(404).json({
        error: 'Brain not found',
        message: 'The requested brain does not exist'
      });
    }

    // Check ownership
    if (brain.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this brain'
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
      WHERE f.brain_id = $1
      ORDER BY f.uploaded_at DESC
    `, [id]);

    const files = result.rows || [];
    
    res.json({
      files: files,
      totalFiles: files.length,
      brainId: id,
      brainName: brain.name
    });

  } catch (error) {
    console.error('❌ Get brain files error:', error);
    res.status(500).json({
      error: 'Failed to retrieve files',
      message: 'An error occurred while fetching brain files'
    });
  }
});

/**
 * DELETE /api/brains/:id
 * Delete a brain (archives files, removes from database)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Brain ID must be a valid UUID'
      });
    }

    const brain = await Brain.findById(id);
    
    if (!brain) {
      return res.status(404).json({
        error: 'Brain not found',
        message: 'The requested brain does not exist'
      });
    }

    // Check ownership
    if (brain.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to delete this brain'
      });
    }

    // Store brain name for response
    const brainName = brain.name;
    
    // Delete brain (archives files and removes from database)
    await brain.delete();

    res.json({
      message: 'Brain deleted successfully',
      brainName: brainName,
      brainId: id
    });

  } catch (error) {
    console.error('❌ Delete brain error:', error);
    res.status(500).json({
      error: 'Failed to delete brain',
      message: 'An error occurred while deleting the brain'
    });
  }
});

/**
 * POST /api/brains/:id/sync
 * Force synchronization of brain files with database
 */
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Brain ID must be a valid UUID'
      });
    }

    const brain = await Brain.findById(id);
    
    if (!brain) {
      return res.status(404).json({
        error: 'Brain not found',
        message: 'The requested brain does not exist'
      });
    }

    // Check ownership
    if (brain.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to sync this brain'
      });
    }

    // Force sync
    const cardCount = await brain.forceSync();

    res.json({
      message: 'Brain synchronized successfully',
      brainId: brain.id,
      brainName: brain.name,
      cardCount: cardCount,
      lastScannedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Sync brain error:', error);
    res.status(500).json({
      error: 'Failed to sync brain',
      message: 'An error occurred while synchronizing the brain'
    });
  }
});

/**
 * POST /api/brains/:id/welcome
 * Recreate welcome stream for existing brain (if user deleted it)
 */
router.post('/:id/welcome', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Brain ID must be a valid UUID'
      });
    }

    const brain = await Brain.findById(id);
    
    if (!brain) {
      return res.status(404).json({
        error: 'Brain not found',
        message: 'The requested brain does not exist'
      });
    }

    // Check ownership
    if (brain.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this brain'
      });
    }

    // Recreate welcome stream
    const result = await recreateWelcomeStream(brain.id);

    res.status(201).json({
      ...result,
      brainId: brain.id,
      brainName: brain.name
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
 * GET /api/brains/:id/files
 * Get all files in a brain
 */
router.get('/:id/files', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate UUID format
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Brain ID must be a valid UUID'
      });
    }
    
    const brain = await Brain.findById(id);
    
    if (!brain) {
      return res.status(404).json({
        error: 'Brain not found',
        message: 'The requested brain does not exist'
      });
    }

    // Check ownership
    if (brain.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this brain'
      });
    }

    // Get files from database
    const { query } = require('../models/database');
    const result = await query(`
      SELECT 
        id,
        brain_id,
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
      WHERE brain_id = $1
      ORDER BY uploaded_at DESC
    `, [id]);

    const files = result.rows.map(row => ({
      id: row.id,
      brainId: row.brain_id,
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
      brainId: id
    });

  } catch (error) {
    console.error('❌ Get brain files error:', error);
    res.status(500).json({
      error: 'Failed to get brain files',
      message: 'An error occurred while fetching brain files'
    });
  }
});

/**
 * DELETE /api/brains/:id/files/:fileId
 * Delete a file from a brain
 */
router.delete('/:id/files/:fileId', async (req, res) => {
  try {
    const { id, fileId } = req.params;
    
    // Validate UUID formats
    if (!validateUUID(id) || !validateUUID(fileId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Brain ID and file ID must be valid UUIDs'
      });
    }
    
    const brain = await Brain.findById(id);
    
    if (!brain) {
      return res.status(404).json({
        error: 'Brain not found',
        message: 'The requested brain does not exist'
      });
    }

    // Check ownership
    if (brain.userId !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to delete files from this brain'
      });
    }

    // Get file information before deletion
    const { query } = require('../models/database');
    const fileResult = await query(`
      SELECT file_path, file_name, cover_image_path
      FROM files
      WHERE id = $1 AND brain_id = $2
    `, [fileId, id]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The requested file does not exist in this brain'
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
 * GET /api/brains/:id/files/:fileId/cover
 * Serve cover image for a file
 */
router.get('/:id/files/:fileId/cover', async (req, res) => {
  try {
    const { id: brainId, fileId } = req.params;
    
    // Validate brain ownership
    const brainValidation = await validateBrainOwnership(brainId, req.session.userId);
    if (!brainValidation.valid) {
      return res.status(brainValidation.status).json({
        error: brainValidation.error,
        message: brainValidation.message
      });
    }

    const brain = brainValidation.brain;

    // Get file info from database
    const { query } = require('../models/database');
    const fileResult = await query(`
      SELECT file_path, file_name, file_type, cover_image_path
      FROM files
      WHERE id = $1 AND brain_id = $2
    `, [fileId, brainId]);

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
      const brainFolderPath = brain.folderPath || 
                             path.join(process.cwd(), 'backend', 'storage', brain.userId, 'brains', brain.name);
      const coversDir = path.join(brainFolderPath, 'files', 'covers');
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