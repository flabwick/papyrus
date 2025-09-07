const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

const Page = require('../models/Page');
const Library = require('../models/Library');
const { requireAuth } = require('../middleware/auth');
const pageProcessor = require('../services/pageProcessor');
const linkParser = require('../services/linkParser');
const PageFactory = require('../services/PageFactory');
const pdfProcessor = require('../utils/fileProcessors/pdfProcessor');
const epubProcessor = require('../utils/fileProcessors/epubProcessor');

// All page routes require authentication
router.use(requireAuth);

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/clarity-uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 10 // Maximum 10 files per upload
  },
  fileFilter: (req, file, cb) => {
    const supportedExtensions = pageProcessor.getSupportedExtensions();
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (supportedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported: ${ext}`), false);
    }
  }
});

// Input validation helpers
const validateUUID = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const validatePageInput = (title, content = '', pageType = 'saved', options = {}) => {
  const errors = {};
  
  // Validate page type
  if (!['saved', 'file', 'unsaved'].includes(pageType)) {
    errors.pageType = 'Invalid page type. Must be saved, file, or unsaved';
  }
  
  // Title validation based on page type
  if (pageType === 'saved' && (!title || typeof title !== 'string' || title.trim().length === 0)) {
    errors.title = 'Page title is required for saved pages';
  } else if (title && title.length > 200) {
    errors.title = 'Page title cannot exceed 200 characters';
  }
  
  // Unsaved pages can have no title or empty title
  if (pageType === 'unsaved' && title !== undefined && title !== null && typeof title !== 'string') {
    errors.title = 'Page title must be a string if provided';
  }
  
  // Content validation
  if (content && typeof content !== 'string') {
    errors.content = 'Page content must be a string';
  }
  
  // Type-specific validation
  if (pageType === 'unsaved' && !options.workspaceId) {
    errors.workspaceId = 'Workspace ID is required for unsaved pages';
  }
  
  if (pageType === 'file' && !options.fileId) {
    errors.fileId = 'File ID is required for file pages';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

const validateLibraryOwnership = async (libraryId, userId) => {
  const library = await Library.findById(libraryId);
  if (!library) {
    return { valid: false, error: 'Library not found' };
  }
  
  if (library.userId !== userId) {
    return { valid: false, error: 'Access denied' };
  }
  
  return { valid: true, library };
};

const validatePageOwnership = async (pageId, userId) => {
  const page = await Page.findById(pageId);
  if (!page) {
    return { valid: false, error: 'Page not found' };
  }
  
  const libraryValidation = await validateLibraryOwnership(page.libraryId, userId);
  if (!libraryValidation.valid) {
    return libraryValidation;
  }
  
  return { valid: true, page, library: libraryValidation.library };
};

/**
 * GET /api/pages/:id
 * Get single page with content
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid UUID'
      });
    }

    const validation = await validatePageOwnership(id, req.session.userId);
    if (!validation.valid) {
      const status = validation.error === 'Page not found' ? 404 : 403;
      return res.status(status).json({
        error: validation.error,
        message: `Cannot access page: ${validation.error}`
      });
    }

    const pageData = await validation.page.toJSON(true); // Include content
    
    // Get forward and back links
    const [forwardLinks, backlinks] = await Promise.all([
      validation.page.getForwardLinks(),
      validation.page.getBacklinks()
    ]);

    res.json({
      page: {
        ...pageData,
        forwardLinks: forwardLinks.map(link => ({
          page: link.page.toJSON ? link.page.toJSON() : link.page,
          linkText: link.linkText,
          position: link.position
        })),
        backlinks: backlinks.map(link => ({
          page: link.page.toJSON ? link.page.toJSON() : link.page,
          linkText: link.linkText,
          position: link.position
        }))
      }
    });

  } catch (error) {
    console.error('❌ Get page error:', error);
    res.status(500).json({
      error: 'Failed to retrieve page',
      message: 'An error occurred while fetching the page'
    });
  }
});

/**
 * POST /api/pages
 * Create new page from content with type support
 */
router.post('/', async (req, res) => {
  try {
    const { title, content = '', libraryId, pageType = 'saved', workspaceId, fileId } = req.body;
    
    // Validate input
    const validation = validatePageInput(title, content, pageType, { workspaceId, fileId });
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        fields: validation.errors
      });
    }

    if (!libraryId || !validateUUID(libraryId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'A valid brain ID is required'
      });
    }

    // Validate brain ownership
    const brainValidation = await validateLibraryOwnership(libraryId, req.session.userId);
    if (!brainValidation.valid) {
      const status = brainValidation.error === 'Brain not found' ? 404 : 403;
      return res.status(status).json({
        error: brainValidation.error,
        message: `Cannot create page: ${brainValidation.error}`
      });
    }

    let card;

    // Create card using PageFactory based on type
    try {
      switch (pageType) {
        case 'saved':
          card = await PageFactory.createSavedCard(libraryId, title.trim(), content);
          break;
          
        case 'unsaved':
          card = await PageFactory.createUnsavedCard(libraryId, workspaceId, content);
          break;
          
        case 'file':
          card = await PageFactory.createFileCard(libraryId, fileId, title.trim(), {
            content: content
          });
          break;
          
        default:
          // Fallback to old method for compatibility
          const result = await pageProcessor.createCardFromContent(libraryId, title.trim(), content);
          if (!result.success) {
            return res.status(400).json({
              error: 'Failed to create page',
              message: result.error
            });
          }
          card = result.card;
      }
    } catch (createError) {
      return res.status(400).json({
        error: 'Failed to create page',
        message: createError.message
      });
    }

    // Process links in the content (only for cards with content)
    if (content && content.trim()) {
      await linkParser.processCardLinks(card.id, content);
    }

    const pageData = await card.toJSON(true);

    res.status(201).json({
      page: pageData,
      message: `${pageData.typeInfo.label} created successfully`
    });

  } catch (error) {
    console.error('❌ Create page error:', error);
    res.status(500).json({
      error: 'Failed to create page',
      message: 'An error occurred while creating the page'
    });
  }
});

/**
 * PUT /api/pages/:id
 * Update card content
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid UUID'
      });
    }

    const validation = await validatePageOwnership(id, req.session.userId);
    if (!validation.valid) {
      const status = validation.error === 'Page not found' ? 404 : 403;
      return res.status(status).json({
        error: validation.error,
        message: `Cannot update page: ${validation.error}`
      });
    }

    const card = validation.page;
    const updates = {};

    // Update title if provided
    if (title !== undefined) {
      if (!title || title.trim().length === 0) {
        return res.status(400).json({
          error: 'Invalid title',
          message: 'Card title cannot be empty'
        });
      }
      
      if (title.length > 200) {
        return res.status(400).json({
          error: 'Invalid title',
          message: 'Card title cannot exceed 200 characters'
        });
      }

      updates.title = title.trim();
    }

    // Update content if provided
    if (content !== undefined) {
      if (typeof content !== 'string') {
        return res.status(400).json({
          error: 'Invalid content',
          message: 'Card content must be a string'
        });
      }

      await card.updateContent(content);
      
      // Process links in the updated content
      await linkParser.processPageLinks(card.id, content);
    }

    // Update other fields if provided
    if (Object.keys(updates).length > 0) {
      await card.update(updates);
    }

    const pageData = await card.toJSON(true);

    res.json({
      page: pageData,
      message: 'Page updated successfully'
    });

  } catch (error) {
    console.error('❌ Update page error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Page title already exists',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to update page',
      message: 'An error occurred while updating the page'
    });
  }
});

/**
 * DELETE /api/pages/:id
 * Delete card (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { hard = false } = req.query;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid UUID'
      });
    }

    const validation = await validatePageOwnership(id, req.session.userId);
    if (!validation.valid) {
      const status = validation.error === 'Page not found' ? 404 : 403;
      return res.status(status).json({
        error: validation.error,
        message: `Cannot delete page: ${validation.error}`
      });
    }

    const card = validation.page;
    const cardTitle = card.title;
    const cardId = card.id;

    if (hard === 'true') {
      await card.hardDelete();
    } else {
      await card.delete();
    }

    res.json({
      message: hard === 'true' ? 'Card permanently deleted' : 'Card deleted successfully',
      cardTitle,
      cardId,
      deletionType: hard === 'true' ? 'hard' : 'soft'
    });

  } catch (error) {
    console.error('❌ Delete page error:', error);
    res.status(500).json({
      error: 'Failed to delete page',
      message: 'An error occurred while deleting the page'
    });
  }
});

/**
 * POST /api/pages/upload
 * Upload files to create cards
 */
router.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const { libraryId } = req.body;
    
    if (!libraryId || !validateUUID(libraryId)) {
      // Clean up uploaded files
      if (req.files) {
        for (const file of req.files) {
          await fs.remove(file.path).catch(() => {});
        }
      }
      
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'A valid brain ID is required'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: 'At least one file must be uploaded'
      });
    }

    // Validate brain ownership
    const brainValidation = await validateLibraryOwnership(libraryId, req.session.userId);
    if (!brainValidation.valid) {
      // Clean up uploaded files
      for (const file of req.files) {
        await fs.remove(file.path).catch(() => {});
      }
      
      const status = brainValidation.error === 'Brain not found' ? 404 : 403;
      return res.status(status).json({
        error: brainValidation.error,
        message: `Cannot upload files: ${brainValidation.error}`
      });
    }

    const filePaths = req.files.map(file => {
      // Restore original filename
      const originalPath = path.join(path.dirname(file.path), file.originalname);
      fs.moveSync(file.path, originalPath);
      return originalPath;
    });

    // Process files
    const results = await pageProcessor.processFiles(filePaths, libraryId, {
      copyFile: true,
      updateExisting: false
    });

    // Clean up temporary files
    for (const filePath of filePaths) {
      await fs.remove(filePath).catch(() => {});
    }

    // Process links for successfully created cards
    for (const result of results) {
      if (result.success && result.card) {
        const content = await result.card.getContent();
        await linkParser.processCardLinks(result.card.id, content);
      }
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.status(201).json({
      message: `Processed ${results.length} files: ${successful.length} succeeded, ${failed.length} failed`,
      results: {
        successful: successful.map(r => ({
          fileName: path.basename(r.filePath),
          pageId: r.card.id,
          cardTitle: r.card.title,
          action: r.action
        })),
        failed: failed.map(r => ({
          fileName: path.basename(r.filePath),
          error: r.error
        }))
      },
      summary: {
        totalFiles: results.length,
        successful: successful.length,
        failed: failed.length
      }
    });

  } catch (error) {
    console.error('❌ Upload files error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        await fs.remove(file.path).catch(() => {});
      }
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        message: 'File size exceeds the 100MB limit'
      });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({
        error: 'Too many files',
        message: 'Maximum 10 files per upload'
      });
    }

    res.status(500).json({
      error: 'Failed to upload files',
      message: 'An error occurred while processing uploaded files'
    });
  }
});

/**
 * POST /api/pages/:id/links
 * Update card links after content changes
 */
router.post('/:id/links', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid UUID'
      });
    }

    const validation = await validatePageOwnership(id, req.session.userId);
    if (!validation.valid) {
      const status = validation.error === 'Page not found' ? 404 : 403;
      return res.status(status).json({
        error: validation.error,
        message: `Cannot update links: ${validation.error}`
      });
    }

    const card = validation.page;
    const content = await card.getContent();
    
    // Process links
    const result = await linkParser.processCardLinks(card.id, content);

    res.json({
      message: 'Card links updated successfully',
      linkStats: {
        linksFound: result.linksFound,
        linksResolved: result.linksResolved,
        brokenLinks: result.brokenLinks
      },
      details: result.details
    });

  } catch (error) {
    console.error('❌ Update page links error:', error);
    res.status(500).json({
      error: 'Failed to update page links',
      message: 'An error occurred while updating card links'
    });
  }
});

/**
 * GET /api/pages/:id/links
 * Get card's forward and back links
 */
router.get('/:id/links', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid UUID'
      });
    }

    const validation = await validatePageOwnership(id, req.session.userId);
    if (!validation.valid) {
      const status = validation.error === 'Page not found' ? 404 : 403;
      return res.status(status).json({
        error: validation.error,
        message: `Cannot access card links: ${validation.error}`
      });
    }

    const [forwardLinks, backlinks] = await Promise.all([
      validation.page.getForwardLinks(),
      validation.page.getBacklinks()
    ]);

    res.json({
      pageId: id,
      forwardLinks: forwardLinks.map(link => ({
        card: {
          id: link.page.id,
          title: link.page.title,
          contentPreview: link.page.contentPreview,
          libraryId: link.page.libraryId
        },
        linkText: link.linkText,
        position: link.position
      })),
      backlinks: backlinks.map(link => ({
        card: {
          id: link.page.id,
          title: link.page.title,
          contentPreview: link.page.contentPreview,
          libraryId: link.page.libraryId
        },
        linkText: link.linkText,
        position: link.position
      })),
      summary: {
        forwardLinksCount: forwardLinks.length,
        backlinksCount: backlinks.length
      }
    });

  } catch (error) {
    console.error('❌ Get card links error:', error);
    res.status(500).json({
      error: 'Failed to retrieve page links',
      message: 'An error occurred while fetching page links'
    });
  }
});

/**
 * POST /api/pages/:id/sync
 * Sync card with its file system file
 */
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid UUID'
      });
    }

    const validation = await validatePageOwnership(id, req.session.userId);
    if (!validation.valid) {
      const status = validation.error === 'Page not found' ? 404 : 403;
      return res.status(status).json({
        error: validation.error,
        message: `Cannot sync page: ${validation.error}`
      });
    }

    const result = await pageProcessor.syncCard(id);

    if (!result.success) {
      return res.status(400).json({
        error: 'Sync failed',
        message: result.error
      });
    }

    // If card was updated, reprocess links
    if (result.action === 'updated') {
      const content = await validation.page.getContent();
      await linkParser.processCardLinks(id, content);
    }

    res.json({
      message: result.action === 'updated' ? 'Card synced successfully' : 'Card is already up to date',
      syncResult: result.action,
      pageId: id
    });

  } catch (error) {
    console.error('❌ Sync page error:', error);
    res.status(500).json({
      error: 'Failed to sync page',
      message: 'An error occurred while syncing the page'
    });
  }
});

/**
 * POST /api/pages/:id/convert-to-saved
 * Convert unsaved card to saved card
 */
router.post('/:id/convert-to-saved', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid UUID'
      });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid title',
        message: 'Title is required to convert unsaved card to saved'
      });
    }

    const validation = await validatePageOwnership(id, req.session.userId);
    if (!validation.valid) {
      const status = validation.error === 'Page not found' ? 404 : 403;
      return res.status(status).json({
        error: validation.error,
        message: `Cannot convert page: ${validation.error}`
      });
    }

    const card = validation.page;

    if (card.pageType !== 'unsaved') {
      return res.status(400).json({
        error: 'Invalid operation',
        message: 'Only unsaved cards can be converted to saved'
      });
    }

    // Convert using PageFactory
    await PageFactory.convertUnsavedToSaved(id, title.trim());

    // Refresh page data
    const updatedPage = await Page.findById(id);
    const pageData = await updatedPage.toJSON(true);

    res.json({
      page: pageData,
      message: `Page successfully converted to saved: ${title.trim()}`
    });

  } catch (error) {
    console.error('❌ Convert page error:', error);
    res.status(500).json({
      error: 'Failed to convert page',
      message: error.message || 'An error occurred while converting the page'
    });
  }
});

/**
 * GET /api/pages/by-type/:libraryId/:pageType
 * Get cards by type within a brain
 */
router.get('/by-type/:libraryId/:pageType', async (req, res) => {
  try {
    const { libraryId, pageType } = req.params;
    const { limit, offset, orderBy } = req.query;
    
    if (!validateUUID(libraryId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Library ID must be a valid UUID'
      });
    }

    if (!['saved', 'file', 'unsaved'].includes(pageType)) {
      return res.status(400).json({
        error: 'Invalid page type',
        message: 'Card type must be saved, file, or unsaved'
      });
    }

    // Validate brain ownership
    const brainValidation = await validateLibraryOwnership(libraryId, req.session.userId);
    if (!brainValidation.valid) {
      const status = brainValidation.error === 'Brain not found' ? 404 : 403;
      return res.status(status).json({
        error: brainValidation.error,
        message: `Cannot access cards: ${brainValidation.error}`
      });
    }

    const options = {};
    if (limit) options.limit = parseInt(limit);
    if (offset) options.offset = parseInt(offset);
    if (orderBy) options.orderBy = orderBy;

    const cards = await Page.findByType(libraryId, pageType, options);
    
    // Convert cards to JSON format
    const pageData = await Promise.all(
      cards.map(card => card.toJSON(false)) // Don't include full content by default
    );

    res.json({
      cards: pageData,
      total: pageData.length,
      pageType: pageType,
      libraryId: libraryId
    });

  } catch (error) {
    console.error('❌ Get pages by type error:', error);
    res.status(500).json({
      error: 'Failed to retrieve pages',
      message: 'An error occurred while fetching pages by type'
    });
  }
});

/**
 * GET /api/pages/statistics/:libraryId
 * Get card type statistics for a brain
 */
router.get('/statistics/:libraryId', async (req, res) => {
  try {
    const { libraryId } = req.params;
    
    if (!validateUUID(libraryId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Library ID must be a valid UUID'
      });
    }

    // Validate brain ownership
    const brainValidation = await validateLibraryOwnership(libraryId, req.session.userId);
    if (!brainValidation.valid) {
      const status = brainValidation.error === 'Brain not found' ? 404 : 403;
      return res.status(status).json({
        error: brainValidation.error,
        message: `Cannot access statistics: ${brainValidation.error}`
      });
    }

    const statistics = await Page.getTypeStatistics(libraryId);

    res.json({
      libraryId: libraryId,
      statistics: statistics,
      summary: {
        totalCards: statistics.total,
        distribution: {
          saved: {
            count: statistics.saved,
            percentage: statistics.total > 0 ? Math.round((statistics.saved / statistics.total) * 100) : 0
          },
          file: {
            count: statistics.file,
            percentage: statistics.total > 0 ? Math.round((statistics.file / statistics.total) * 100) : 0
          },
          unsaved: {
            count: statistics.unsaved,
            percentage: statistics.total > 0 ? Math.round((statistics.unsaved / statistics.total) * 100) : 0
          }
        }
      }
    });

  } catch (error) {
    console.error('❌ Get page statistics error:', error);
    res.status(500).json({
      error: 'Failed to retrieve statistics',
      message: 'An error occurred while fetching page statistics'
    });
  }
});

/**
 * POST /api/pages/ai-generate
 * Generate AI card (creates unsaved card)
 */
router.post('/ai-generate', async (req, res) => {
  try {
    const { libraryId, workspaceId, generatedContent } = req.body;
    
    if (!libraryId || !validateUUID(libraryId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'A valid brain ID is required'
      });
    }

    if (!workspaceId || !validateUUID(workspaceId)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'A valid workspace ID is required for AI-generated cards'
      });
    }

    if (!generatedContent || typeof generatedContent !== 'string' || generatedContent.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid content',
        message: 'Generated content is required'
      });
    }

    // Validate brain ownership
    const brainValidation = await validateLibraryOwnership(libraryId, req.session.userId);
    if (!brainValidation.valid) {
      const status = brainValidation.error === 'Brain not found' ? 404 : 403;
      return res.status(status).json({
        error: brainValidation.error,
        message: `Cannot create AI card: ${brainValidation.error}`
      });
    }

    // Create AI-generated unsaved card
    const card = await PageFactory.createFromAIGeneration(libraryId, workspaceId, generatedContent);

    // Process any links in the generated content
    if (generatedContent.includes('[[')) {
      await linkParser.processCardLinks(card.id, generatedContent);
    }

    const pageData = await card.toJSON(true);

    res.status(201).json({
      page: pageData,
      message: 'AI-generated page created successfully'
    });

  } catch (error) {
    console.error('❌ AI generate page error:', error);
    res.status(500).json({
      error: 'Failed to create AI page',
      message: error.message || 'An error occurred while creating AI-generated page'
    });
  }
});

/**
 * POST /api/pages/create-empty
 * Create empty unsaved card for immediate editing (streamlined flow)
 */
router.post('/create-empty', async (req, res) => {
  try {
    const { libraryId, workspaceId, position, insertAfterPosition } = req.body;
    
    if (!libraryId || !validateUUID(libraryId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'A valid brain ID is required'
      });
    }

    if (!workspaceId || !validateUUID(workspaceId)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'A valid workspace ID is required'
      });
    }

    // Validate brain ownership
    const brainValidation = await validateLibraryOwnership(libraryId, req.session.userId);
    if (!brainValidation.valid) {
      const status = brainValidation.error === 'Brain not found' ? 404 : 403;
      return res.status(status).json({
        error: brainValidation.error,
        message: `Cannot create page: ${brainValidation.error}`
      });
    }

    // Create empty unsaved card for immediate editing
    // Use insertAfterPosition if provided, otherwise use position
    const insertPosition = insertAfterPosition !== undefined ? insertAfterPosition : position;
    const card = await PageFactory.createEmptyUnsavedPage(libraryId, workspaceId, insertPosition, insertAfterPosition !== undefined);

    const pageData = await card.toJSON(true);

    res.status(201).json({
      page: pageData,
      message: 'Empty page created successfully'
    });

  } catch (error) {
    console.error('❌ Create empty page error:', error);
    res.status(500).json({
      error: 'Failed to create empty page',
      message: error.message || 'An error occurred while creating the empty page'
    });
  }
});

/**
 * PUT /api/pages/:id/update-with-title
 * Update card content and optionally add title (for unsaved card conversion)
 */
router.put('/:id/update-with-title', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid UUID'
      });
    }

    const validation = await validatePageOwnership(id, req.session.userId);
    if (!validation.valid) {
      const status = validation.error === 'Page not found' ? 404 : 403;
      return res.status(status).json({
        error: validation.error,
        message: `Cannot update page: ${validation.error}`
      });
    }

    const card = validation.page;

    // Update content if provided
    if (content !== undefined) {
      await card.updateContent(content);
    }

    // If title is provided and not empty, update it (and auto-convert unsaved to saved)
    if (title !== undefined && title !== null && typeof title === 'string' && title.trim && title.trim() !== '') {
      const trimmedTitle = title.trim();
      if (card.pageType === 'unsaved') {
        // This will trigger the database trigger to convert to saved
        await card.update({ title: trimmedTitle });
      } else {
        await card.update({ title: trimmedTitle });
      }
    }

    // Process links in the content if updated
    if (content && content.includes('[[')) {
      await linkParser.processCardLinks(card.id, content);
    }

    // Refresh card data to get updated state
    const updatedCard = await Page.findById(id);
    const pageData = await updatedPage.toJSON(true);

    res.json({
      page: pageData,
      message: updatedPage.pageType === 'saved' ? 'Page saved to library' : 'Page updated'
    });

  } catch (error) {
    console.error('❌ Update page with title error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Page title already exists',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to update page',
      message: error.message || 'An error occurred while updating the page'
    });
  }
});

// ========================================
// FILE CARDS ENDPOINTS
// ========================================

/**
 * POST /api/pages/check-file-duplicates
 * Check for duplicate files before upload
 */
router.post('/check-file-duplicates', async (req, res) => {
  try {
    const { libraryId, fileName } = req.body;
    
    if (!libraryId || !validateUUID(libraryId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'A valid brain ID is required'
      });
    }

    if (!fileName) {
      return res.status(400).json({
        error: 'Missing filename',
        message: 'Filename is required'
      });
    }

    // Validate brain ownership
    const brainValidation = await validateLibraryOwnership(libraryId, req.session.userId);
    if (!brainValidation.valid) {
      const status = brainValidation.error === 'Brain not found' ? 404 : 403;
      return res.status(status).json({
        error: brainValidation.error,
        message: `Cannot check files: ${brainValidation.error}`
      });
    }

    // Check for existing file with same name
    const { query } = require('../models/database');
    const result = await query(`
      SELECT id, file_name, file_type, file_size, uploaded_at, 
             epub_title, pdf_title, epub_author, pdf_author
      FROM files 
      WHERE brain_id = $1 AND file_name = $2
      ORDER BY uploaded_at DESC
    `, [libraryId, fileName]);

    const duplicates = result.rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      uploadedAt: row.uploaded_at,
      title: row.file_type === 'epub' ? row.epub_title : row.pdf_title,
      author: row.file_type === 'epub' ? row.epub_author : row.pdf_author
    }));

    res.json({
      hasDuplicates: duplicates.length > 0,
      duplicates,
      fileName
    });

  } catch (error) {
    console.error('❌ Check file duplicates error:', error);
    res.status(500).json({
      error: 'Failed to check file duplicates',
      message: 'An error occurred while checking for duplicate files'
    });
  }
});

/**
 * POST /api/pages/upload-file
 * Upload PDF/EPUB/Image files and create file cards with stream positioning
 */
router.post('/upload-file', upload.single('file'), async (req, res) => {
  try {
    const { libraryId, workspaceId, position, action, replaceFileId, newFileName } = req.body;
    
    if (!libraryId || !validateUUID(libraryId)) {
      // Clean up uploaded file
      if (req.file) {
        await fs.remove(req.file.path).catch(() => {});
      }
      
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'A valid brain ID is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'A PDF, EPUB, or image file must be uploaded'
      });
    }

    // Validate file type
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    if (!['.pdf', '.epub', '.jpg', '.jpeg', '.png'].includes(fileExt)) {
      await fs.remove(req.file.path).catch(() => {});
      return res.status(400).json({
        error: 'Unsupported file type',
        message: 'Only PDF, EPUB, and image files (JPEG, PNG) are supported'
      });
    }

    // Validate brain ownership
    const brainValidation = await validateLibraryOwnership(libraryId, req.session.userId);
    if (!brainValidation.valid) {
      await fs.remove(req.file.path).catch(() => {});
      const status = brainValidation.error === 'Brain not found' ? 404 : 403;
      return res.status(status).json({
        error: brainValidation.error,
        message: `Cannot upload file: ${brainValidation.error}`
      });
    }

    const library = brainValidation.library;
    
    // Process file based on type
    let processResult;
    const tempFilePath = req.file.path;
    
    try {
      console.log(`Processing ${fileExt} file: ${req.file.originalname}`);
      if (fileExt === '.pdf') {
        processResult = await pdfProcessor.processPdfFile(tempFilePath, {
          title: path.basename(req.file.originalname, '.pdf')
        });
      } else if (fileExt === '.epub') {
        // Create output directory for cover images
        const libraryFolderPath = library.folderPath || 
                               path.join(process.cwd(), 'backend', 'storage', library.userId || req.session.userId, 'libraries', library.name);
        const filesDir = path.join(libraryFolderPath, 'files');
        
        processResult = await epubProcessor.processEpubFile(tempFilePath, {
          title: path.basename(req.file.originalname, '.epub'),
          filesDir: filesDir
        });
      } else if (['.jpg', '.jpeg', '.png'].includes(fileExt)) {
        const { processImageFile } = require('../utils/fileProcessors/imageProcessor');
        processResult = await processImageFile(tempFilePath, {
          title: path.basename(req.file.originalname, fileExt)
        });
      }
      console.log(`Successfully processed file, got result:`, {
        title: processResult.title,
        hasFileInfo: !!processResult.fileInfo,
        hasMetadata: !!processResult.metadata
      });
      
      // Move file to library storage
      const libraryFolderPath = library.folderPath || 
                             path.join(process.cwd(), 'backend', 'storage', library.userId || req.session.userId, 'libraries', library.name);
      console.log(`Library folder path: ${libraryFolderPath}`);
      const libraryStoragePath = path.join(libraryFolderPath, 'files');
      console.log(`Creating storage directory: ${libraryStoragePath}`);
      await fs.ensureDir(libraryStoragePath);
      
      // Handle duplicate handling based on user choice
      let finalFileName = newFileName || req.file.originalname;
      let finalFilePath = path.join(libraryStoragePath, finalFileName);
      let actualFinalPath = finalFilePath;
      
      if (action === 'replace' && replaceFileId) {
        // Replace existing file - remove old file from database and filesystem
        const { query } = require('../models/database');
        const oldFileResult = await query('SELECT file_path FROM files WHERE id = $1 AND library_id = $2', 
                                          [replaceFileId, libraryId]);
        if (oldFileResult.rows.length > 0) {
          const oldFilePath = oldFileResult.rows[0].file_path;
          await fs.remove(oldFilePath).catch(() => {}); // Remove old file
          await query('DELETE FROM files WHERE id = $1', [replaceFileId]); // Remove from database
        }
        // Use the same filename as being replaced
        actualFinalPath = finalFilePath;
      } else if (action === 'rename') {
        // Use new filename provided by user
        actualFinalPath = finalFilePath;
      } else {
        // Default behavior - add number suffix if file exists
        let counter = 1;
        while (await fs.pathExists(actualFinalPath)) {
          const nameWithoutExt = path.basename(finalFileName, fileExt);
          actualFinalPath = path.join(libraryStoragePath, `${nameWithoutExt}_${counter}${fileExt}`);
          finalFileName = `${nameWithoutExt}_${counter}${fileExt}`;
          counter++;
        }
      }
      
      await fs.move(tempFilePath, actualFinalPath);
      
      // Create file record in database (assuming we run the migration)
      const db = require('../models/database');
      let fileInsertQuery, fileInsertParams;
      
      if (fileExt === '.pdf') {
        fileInsertQuery = `
          INSERT INTO files (
            library_id, file_name, file_type, file_size, file_path, 
            pdf_page_count, pdf_author, pdf_title,
            content_preview, processing_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `;
        fileInsertParams = [
          libraryId,
          path.basename(actualFinalPath),
          'pdf',
          processResult.fileInfo.size,
          actualFinalPath,
          processResult.fileInfo.pageCount || null,
          processResult.fileInfo.author || null,
          processResult.fileInfo.title || null,
          processResult.metadata.contentPreview || processResult.title,
          'complete'
        ];
      } else if (fileExt === '.epub') {
        fileInsertQuery = `
          INSERT INTO files (
            library_id, file_name, file_type, file_size, file_path, 
            epub_title, epub_author, epub_description, epub_chapter_count,
            content_preview, processing_status, cover_image_path
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `;
        fileInsertParams = [
          libraryId,
          path.basename(actualFinalPath),
          'epub',
          processResult.fileInfo.size,
          actualFinalPath,
          processResult.fileInfo.title || null,
          processResult.fileInfo.author || null,
          processResult.metadata.contentPreview || null,
          processResult.fileInfo.chapterCount || null,
          processResult.metadata.contentPreview || processResult.title,
          'complete',
          processResult.epubInfo?.coverImagePath || null
        ];
      } else if (['.jpg', '.jpeg', '.png'].includes(fileExt)) {
        // Handle image files
        fileInsertQuery = `
          INSERT INTO files (
            library_id, file_name, file_type, file_size, file_path, 
            content_preview, processing_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;
        fileInsertParams = [
          libraryId,
          path.basename(actualFinalPath),
          'image',
          processResult.processingInfo.metadata.size,
          actualFinalPath,
          processResult.title,
          'complete'
        ];
      }
      
      console.log('Inserting file record:', { 
        libraryId, 
        fileName: path.basename(actualFinalPath),
        fileType: fileExt.substring(1)
      });
      
      const fileRecord = await db.query(fileInsertQuery, fileInsertParams);
      
      // Files are NOT cards - add file directly to stream if specified
      if (workspaceId && validateUUID(workspaceId) && position !== undefined) {
        const WorkspaceFile = require('../models/WorkspaceFile');
        await WorkspaceFile.addFileToWorkspace(workspaceId, fileRecord.rows[0].id, parseInt(position) + 1);
      }
      
      // Prepare response data based on file type
      let fileSize, title, author, description;
      
      if (['.jpg', '.jpeg', '.png'].includes(fileExt)) {
        // Image file response
        fileSize = processResult.processingInfo.metadata.size;
        title = processResult.title;
        author = null;
        description = null;
      } else {
        // PDF/EPUB file response
        fileSize = processResult.fileInfo.size;
        title = processResult.fileInfo.title || processResult.title;
        author = processResult.fileInfo.author;
        description = processResult.metadata.contentPreview;
      }

      res.status(201).json({
        success: true,
        data: {
          fileId: fileRecord.rows[0].id,
          fileName: path.basename(actualFinalPath),
          fileType: fileExt.substring(1),
          fileSize: fileSize,
          file: {
            id: fileRecord.rows[0].id,
            fileName: path.basename(actualFinalPath),
            fileType: fileExt.substring(1),
            fileSize: fileSize,
            filePath: actualFinalPath,
            title: title,
            author: author,
            description: description,
            processingStatus: 'complete'
          }
        },
        message: `${fileExt.toUpperCase()} file uploaded and processed successfully`
      });
      
    } catch (processError) {
      // Clean up file on processing error
      await fs.remove(tempFilePath).catch(() => {});
      console.error('File processing error:', processError);
      
      return res.status(500).json({
        error: 'File processing failed',
        message: processError.message
      });
    }

  } catch (error) {
    console.error('❌ Upload file error:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        message: 'File size exceeds the 100MB limit'
      });
    }
    
    res.status(500).json({
      error: 'Failed to upload file',
      message: 'An error occurred while uploading the file'
    });
  }
});

/**
 * GET /api/pages/:id/file-info
 * Get file information for a file card
 */
router.get('/:id/file-info', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid UUID'
      });
    }

    const validation = await validatePageOwnership(id, req.session.userId);
    if (!validation.valid) {
      const status = validation.error === 'Page not found' ? 404 : 403;
      return res.status(status).json({
        error: validation.error,
        message: `Cannot access file info: ${validation.error}`
      });
    }

    const card = validation.page;
    
    if (!card.file_id) {
      return res.status(404).json({
        error: 'Not a file page',
        message: 'This card is not associated with a file'
      });
    }

    // Get file information from database
    const db = require('../models/database');
    const result = await db.query(`
      SELECT f.*, 
        CASE 
          WHEN f.file_type = 'pdf' THEN f.pdf_title
          WHEN f.file_type = 'epub' THEN f.epub_title
          ELSE f.file_name
        END as display_title
      FROM files f 
      WHERE f.id = $1
    `, [card.file_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        message: 'Associated file record not found'
      });
    }

    const fileRecord = result.rows[0];
    
    // Format file info for frontend
    const fileInfo = {
      id: fileRecord.id,
      fileName: fileRecord.file_name,
      filePath: fileRecord.file_path,
      fileSize: fileRecord.file_size,
      fileType: fileRecord.file_type,
      title: fileRecord.display_title,
      contentPreview: fileRecord.content_preview,
      processingStatus: fileRecord.processing_status,
      uploadedAt: fileRecord.uploaded_at
    };

    // Add type-specific metadata
    if (fileRecord.file_type === 'pdf') {
      fileInfo.pageCount = fileRecord.pdf_page_count;
      fileInfo.author = fileRecord.pdf_author;
      fileInfo.subject = fileRecord.pdf_subject;
    } else if (fileRecord.file_type === 'epub') {
      fileInfo.author = fileRecord.epub_author;
      fileInfo.publisher = fileRecord.epub_publisher;
      fileInfo.language = fileRecord.epub_language;
      fileInfo.isbn = fileRecord.epub_isbn;
      fileInfo.publicationDate = fileRecord.epub_publication_date;
      fileInfo.description = fileRecord.epub_description;
      fileInfo.chapterCount = fileRecord.epub_chapter_count;
      fileInfo.hasImages = fileRecord.epub_has_images;
      fileInfo.hasToc = fileRecord.epub_has_toc;
      fileInfo.coverImagePath = fileRecord.cover_image_path;
    }

    res.json({
      fileInfo
    });

  } catch (error) {
    console.error('❌ Get file info error:', error);
    res.status(500).json({
      error: 'Failed to get file information',
      message: 'An error occurred while retrieving file information'
    });
  }
});

/**
 * GET /api/files/:id/content
 * Serve file content for viewing (PDF/EPUB)
 */
router.get('/files/:id/content', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid file ID',
        message: 'File ID must be a valid UUID'
      });
    }

    // Get file record and verify ownership through brain
    const db = require('../models/database');
    const result = await db.query(`
      SELECT f.*, b.user_id 
      FROM files f
      JOIN brains b ON f.brain_id = b.id
      WHERE f.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        message: 'File record not found'
      });
    }

    const fileRecord = result.rows[0];
    
    if (fileRecord.user_id !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this file'
      });
    }

    if (!await fs.pathExists(fileRecord.file_path)) {
      return res.status(404).json({
        error: 'File not found',
        message: 'Physical file not found on disk'
      });
    }

    // Set appropriate content type and headers
    const mimeTypes = {
      pdf: 'application/pdf',
      epub: 'application/epub+zip',
      image: 'image/jpeg' // Default for image type, will be overridden below
    };

    let contentType = mimeTypes[fileRecord.file_type] || 'application/octet-stream';
    
    // For image files, determine specific MIME type from file extension
    if (fileRecord.file_type === 'image') {
      const ext = path.extname(fileRecord.file_name).toLowerCase();
      const imageMimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png'
      };
      contentType = imageMimeTypes[ext] || 'image/jpeg';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileRecord.file_name}"`);
    
    // Stream file content
    const fileStream = fs.createReadStream(fileRecord.file_path);
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ Serve file content error:', error);
    res.status(500).json({
      error: 'Failed to serve file content',
      message: 'An error occurred while serving the file'
    });
  }
});

/**
 * GET /api/files/:id/download
 * Download file with proper filename and headers
 */
router.get('/files/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid file ID',
        message: 'File ID must be a valid UUID'
      });
    }

    // Get file record and verify ownership
    const db = require('../models/database');
    const result = await db.query(`
      SELECT f.*, l.user_id 
      FROM files f
      JOIN libraries l ON f.library_id = l.id
      WHERE f.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    const fileRecord = result.rows[0];
    
    if (fileRecord.user_id !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    if (!await fs.pathExists(fileRecord.file_path)) {
      return res.status(404).json({
        error: 'File not found on disk'
      });
    }

    // Set download headers
    const mimeTypes = {
      pdf: 'application/pdf',
      epub: 'application/epub+zip',
      image: 'image/jpeg' // Default for image type, will be overridden below
    };

    let contentType = mimeTypes[fileRecord.file_type] || 'application/octet-stream';
    
    // For image files, determine specific MIME type from file extension
    if (fileRecord.file_type === 'image') {
      const ext = path.extname(fileRecord.file_name).toLowerCase();
      const imageMimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png'
      };
      contentType = imageMimeTypes[ext] || 'image/jpeg';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.file_name}"`);
    
    // Stream file for download
    const fileStream = fs.createReadStream(fileRecord.file_path);
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ Download file error:', error);
    res.status(500).json({
      error: 'Failed to download file'
    });
  }
});

/**
 * GET /api/files/:id/cover
 * Serve EPUB cover image
 */
router.get('/files/:id/cover', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid file ID'
      });
    }

    // Get file record and verify ownership
    const db = require('../models/database');
    const result = await db.query(`
      SELECT f.cover_image_path, b.user_id 
      FROM files f
      JOIN brains b ON f.brain_id = b.id
      WHERE f.id = $1 AND f.file_type = 'epub'
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'EPUB file not found'
      });
    }

    const fileRecord = result.rows[0];
    
    if (fileRecord.user_id !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    if (!fileRecord.cover_image_path || !await fs.pathExists(fileRecord.cover_image_path)) {
      return res.status(404).json({
        error: 'Cover image not found'
      });
    }

    // Determine image type from file extension
    const ext = path.extname(fileRecord.cover_image_path).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    
    // Stream cover image
    const imageStream = fs.createReadStream(fileRecord.cover_image_path);
    imageStream.pipe(res);

  } catch (error) {
    console.error('❌ Serve cover image error:', error);
    res.status(500).json({
      error: 'Failed to serve cover image'
    });
  }
});

module.exports = router;