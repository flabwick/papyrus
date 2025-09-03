const express = require('express');
const router = express.Router();
const Stream = require('../models/Stream');
const StreamCard = require('../models/StreamCard');
const Brain = require('../models/Brain');
const Card = require('../models/Card');
const StreamManager = require('../services/streamManager');
const { requireAuth } = require('../middleware/auth');

// All stream routes require authentication
router.use(requireAuth);

// Input validation helpers
const validateStreamInput = (name) => {
  const errors = {};
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.name = 'Stream name is required';
  } else if (name.trim().length > 100) {
    errors.name = 'Stream name cannot exceed 100 characters';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

const validateUUID = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const validateBrainOwnership = async (brainId, userId) => {
  const brain = await Brain.findById(brainId);
  if (!brain) {
    throw new Error('Brain not found');
  }
  if (brain.userId !== userId) {
    throw new Error('Access denied to brain');
  }
  return brain;
};

const validateStreamOwnership = async (streamId, userId) => {
  const stream = await Stream.findById(streamId);
  if (!stream) {
    throw new Error('Stream not found');
  }
  
  const brain = await Brain.findById(stream.brainId);
  if (!brain || brain.userId !== userId) {
    throw new Error('Access denied to stream');
  }
  
  return { stream, brain };
};

/**
 * GET /api/streams
 * List all streams for user's brains
 */
router.get('/', async (req, res) => {
  try {
    const { brainId } = req.query;
    
    if (brainId) {
      // Get streams for specific brain
      if (!validateUUID(brainId)) {
        return res.status(400).json({
          error: 'Invalid brain ID',
          message: 'Brain ID must be a valid UUID'
        });
      }
      
      await validateBrainOwnership(brainId, req.session.userId);
      const streams = await Stream.findByBrainId(brainId);
      
      const streamsWithMetadata = await Promise.all(
        streams.map(async (stream) => await stream.toJSON())
      );
      
      return res.json({
        streams: streamsWithMetadata,
        count: streamsWithMetadata.length,
        brainId
      });
    }
    
    // Get streams for all user's brains
    const userBrains = await Brain.findByUserId(req.session.userId);
    const allStreams = [];
    
    for (const brain of userBrains) {
      const streams = await Stream.findByBrainId(brain.id);
      const streamsWithMetadata = await Promise.all(
        streams.map(async (stream) => ({
          ...(await stream.toJSON()),
          brainName: brain.name
        }))
      );
      allStreams.push(...streamsWithMetadata);
    }
    
    // Sort by last accessed date
    allStreams.sort((a, b) => new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt));
    
    res.json({
      streams: allStreams,
      count: allStreams.length
    });

  } catch (error) {
    console.error('❌ Get streams error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to retrieve streams',
      message: 'An error occurred while fetching streams'
    });
  }
});

/**
 * POST /api/streams
 * Create new stream
 */
router.post('/', async (req, res) => {
  try {
    const { name, brainId } = req.body;
    
    // Validate input
    const validation = validateStreamInput(name);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        fields: validation.errors
      });
    }
    
    if (!brainId || !validateUUID(brainId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Valid brain ID is required'
      });
    }
    
    // Verify brain ownership
    await validateBrainOwnership(brainId, req.session.userId);
    
    // Create stream
    const stream = await Stream.create(brainId, name.trim(), false);
    const streamData = await stream.toJSON();
    
    res.status(201).json({
      stream: streamData,
      message: 'Stream created successfully'
    });

  } catch (error) {
    console.error('❌ Create stream error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Stream already exists',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to create stream',
      message: 'An error occurred while creating the stream'
    });
  }
});

/**
 * GET /api/streams/:id
 * Get specific stream with cards
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeContent = false } = req.query;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid stream ID',
        message: 'Stream ID must be a valid UUID'
      });
    }
    
    // Verify ownership and get stream
    await validateStreamOwnership(id, req.session.userId);
    
    // Get stream with full details
    const streamData = await StreamManager.getStreamWithCards(id, includeContent === 'true');
    
    res.json({
      stream: streamData
    });

  } catch (error) {
    console.error('❌ Get stream error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to retrieve stream',
      message: 'An error occurred while fetching the stream'
    });
  }
});

/**
 * PUT /api/streams/:id
 * Update stream (title, favorite status)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isFavorited } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid stream ID',
        message: 'Stream ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    const { stream } = await validateStreamOwnership(id, req.session.userId);
    
    // Prepare updates
    const updates = {};
    if (name !== undefined) {
      const validation = validateStreamInput(name);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Please check your input',
          fields: validation.errors
        });
      }
      updates.name = name.trim();
    }
    
    if (isFavorited !== undefined) {
      updates.is_favorited = Boolean(isFavorited);
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
        message: 'Provide name or isFavorited to update'
      });
    }
    
    // Update stream
    await stream.update(updates);
    const streamData = await stream.toJSON();
    
    res.json({
      stream: streamData,
      message: 'Stream updated successfully'
    });

  } catch (error) {
    console.error('❌ Update stream error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Stream name already exists',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to update stream',
      message: 'An error occurred while updating the stream'
    });
  }
});

/**
 * DELETE /api/streams/:id
 * Delete stream
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid stream ID',
        message: 'Stream ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    const { stream } = await validateStreamOwnership(id, req.session.userId);
    const streamName = stream.name;
    
    // Delete stream
    await stream.delete();
    
    res.json({
      message: 'Stream deleted successfully',
      streamName: streamName,
      streamId: id
    });

  } catch (error) {
    console.error('❌ Delete stream error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to delete stream',
      message: 'An error occurred while deleting the stream'
    });
  }
});

/**
 * POST /api/streams/:id/access
 * Update last accessed timestamp
 */
router.post('/:id/access', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid stream ID',
        message: 'Stream ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    const { stream } = await validateStreamOwnership(id, req.session.userId);
    
    // Update last accessed
    await stream.updateLastAccessed();
    
    res.json({
      message: 'Stream access updated',
      lastAccessedAt: stream.lastAccessedAt
    });

  } catch (error) {
    console.error('❌ Update stream access error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to update stream access',
      message: 'An error occurred while updating stream access'
    });
  }
});

/**
 * GET /api/streams/:id/cards
 * Get cards in stream with ordering
 */
router.get('/:id/cards', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid stream ID',
        message: 'Stream ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    await validateStreamOwnership(id, req.session.userId);
    
    // Get mixed stream items (both cards and files)
    const StreamFile = require('../models/StreamFile');
    const items = await StreamFile.getStreamItems(id);
    const aiContextCards = await StreamCard.getAIContextCards(id);
    
    // Separate cards and files for backwards compatibility
    const cards = items.filter(item => item.itemType === 'card');
    const files = items.filter(item => item.itemType === 'file');
    
    res.json({
      items, // Mixed array of cards and files in position order
      cards, // Just cards (for backwards compatibility)
      files, // Just files
      aiContextCards,
      count: cards.length,
      aiContextCount: aiContextCards.length,
      streamId: id
    });

  } catch (error) {
    console.error('❌ Get stream cards error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to retrieve stream cards',
      message: 'An error occurred while fetching stream cards'
    });
  }
});

/**
 * POST /api/streams/:id/cards
 * Add card to stream
 */
router.post('/:id/cards', async (req, res) => {
  try {
    const { id } = req.params;
    const { cardId, position, depth = 0, isInAIContext = false, isCollapsed = false } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid stream ID',
        message: 'Stream ID must be a valid UUID'
      });
    }
    
    if (!cardId || !validateUUID(cardId)) {
      return res.status(400).json({
        error: 'Invalid card ID',
        message: 'Valid card ID is required'
      });
    }
    
    // Verify ownership
    await validateStreamOwnership(id, req.session.userId);
    
    // Add card to stream
    const result = await StreamManager.addCardToStream(id, cardId, position, depth, {
      isInAIContext,
      isCollapsed
    });
    
    res.status(201).json({
      ...result,
      message: 'Card added to stream successfully'
    });

  } catch (error) {
    console.error('❌ Add card to stream error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Card already in stream',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to add card to stream',
      message: 'An error occurred while adding the card'
    });
  }
});

/**
 * PUT /api/streams/:id/cards/:cardId
 * Update card state in stream
 */
router.put('/:id/cards/:cardId', async (req, res) => {
  try {
    const { id, cardId } = req.params;
    const { position, depth, isInAIContext, isCollapsed } = req.body;
    
    if (!validateUUID(id) || !validateUUID(cardId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Stream ID and card ID must be valid UUIDs'
      });
    }
    
    // Verify ownership
    await validateStreamOwnership(id, req.session.userId);
    
    // Handle position changes separately from state changes
    if (position !== undefined) {
      const result = await StreamManager.moveCard(id, cardId, position, depth);
      return res.json({
        ...result,
        message: 'Card position updated successfully'
      });
    }
    
    // Handle state updates
    const updates = {};
    if (depth !== undefined) updates.depth = depth;
    if (isInAIContext !== undefined) updates.is_in_ai_context = isInAIContext;
    if (isCollapsed !== undefined) updates.is_collapsed = isCollapsed;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
        message: 'Provide position, depth, isInAIContext, or isCollapsed to update'
      });
    }
    
    const streamCard = await StreamCard.updateCardState(id, cardId, updates);
    
    res.json({
      streamCard: streamCard,
      message: 'Card state updated successfully'
    });

  } catch (error) {
    console.error('❌ Update card in stream error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to update card in stream',
      message: 'An error occurred while updating the card'
    });
  }
});

/**
 * DELETE /api/streams/:id/cards/:cardId
 * Remove card from stream
 */
router.delete('/:id/cards/:cardId', async (req, res) => {
  try {
    const { id, cardId } = req.params;
    
    if (!validateUUID(id) || !validateUUID(cardId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Stream ID and card ID must be valid UUIDs'  
      });
    }
    
    // Verify ownership
    await validateStreamOwnership(id, req.session.userId);
    
    // Remove card from stream
    const result = await StreamManager.removeCardFromStream(id, cardId);
    
    if (!result.removed) {
      return res.status(404).json({
        error: 'Card not found in stream',
        message: 'The card is not in this stream'
      });
    }
    
    res.json({
      ...result,
      message: 'Card removed from stream successfully'
    });

  } catch (error) {
    console.error('❌ Remove card from stream error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to remove card from stream',
      message: 'An error occurred while removing the card'
    });
  }
});

/**
 * POST /api/streams/:id/duplicate
 * Clone stream
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid stream ID',
        message: 'Stream ID must be a valid UUID'
      });
    }
    
    const validation = validateStreamInput(name);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        fields: validation.errors
      });
    }
    
    // Verify ownership
    await validateStreamOwnership(id, req.session.userId);
    
    // Duplicate stream
    const result = await StreamManager.duplicateStream(id, name.trim());
    
    res.status(201).json({
      ...result,
      message: 'Stream duplicated successfully'
    });

  } catch (error) {
    console.error('❌ Duplicate stream error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Stream name already exists',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to duplicate stream',
      message: 'An error occurred while duplicating the stream'
    });
  }
});

/**
 * GET /api/streams/search/cards
 * Search cards for adding to streams
 */
router.get('/search/cards', async (req, res) => {
  try {
    const { q: query, brainId, includeOtherBrains = 'true' } = req.query;
    
    if (!query || query.trim().length === 0) {
      return res.json({
        currentBrain: [],
        otherBrains: [],
        totalResults: 0
      });
    }
    
    if (!brainId || !validateUUID(brainId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Valid brain ID is required for search'
      });
    }
    
    // Verify brain ownership
    await validateBrainOwnership(brainId, req.session.userId);
    
    // Search cards
    const results = await StreamManager.searchCardsForStream(
      brainId, 
      query.trim(), 
      includeOtherBrains === 'true',
      req.session.userId
    );
    
    res.json(results);

  } catch (error) {
    console.error('❌ Search cards error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to search cards',
      message: 'An error occurred while searching cards'
    });
  }
});

/**
 * GET /api/streams/:id/stats
 * Get comprehensive stream statistics
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid stream ID',
        message: 'Stream ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    await validateStreamOwnership(id, req.session.userId);
    
    // Get comprehensive stats
    const stats = await StreamManager.getStreamStats(id);
    
    res.json({
      stats,
      message: 'Stream statistics retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Get stream stats error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to get stream statistics',
      message: 'An error occurred while fetching stream statistics'
    });
  }
});

/**
 * DELETE /api/streams/:id/files/:fileId
 * Remove file from stream
 */
router.delete('/:id/files/:fileId', async (req, res) => {
  try {
    const { id, fileId } = req.params;
    
    if (!validateUUID(id) || !validateUUID(fileId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Stream ID and file ID must be valid UUIDs'  
      });
    }
    
    // Verify ownership
    await validateStreamOwnership(id, req.session.userId);
    
    // Remove file from stream
    const StreamFile = require('../models/StreamFile');
    const result = await StreamFile.removeFileFromStream(id, fileId);
    
    if (!result.removed) {
      return res.status(404).json({
        error: 'File not found in stream',
        message: 'The file is not in this stream'
      });
    }
    
    res.json({
      ...result,
      message: 'File removed from stream successfully'
    });

  } catch (error) {
    console.error('❌ Remove file from stream error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to remove file from stream',
      message: 'An error occurred while removing the file'
    });
  }
});

/**
 * POST /api/streams/:id/files
 * Add existing file to stream
 */
router.post('/:id/files', async (req, res) => {
  try {
    const { id } = req.params;
    const { fileId, position, depth = 0, isCollapsed = false } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid stream ID',
        message: 'Stream ID must be a valid UUID'
      });
    }
    
    if (!fileId || !validateUUID(fileId)) {
      return res.status(400).json({
        error: 'Invalid file ID',
        message: 'Valid file ID is required'
      });
    }
    
    // Verify ownership
    await validateStreamOwnership(id, req.session.userId);
    
    // Add file to stream
    const StreamFile = require('../models/StreamFile');
    const result = await StreamFile.addFileToStream(id, fileId, position, depth, {
      isCollapsed
    });
    
    res.status(201).json({
      streamFile: result,
      message: 'File added to stream successfully'
    });

  } catch (error) {
    console.error('❌ Add file to stream error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'File already in stream',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to add file to stream',
      message: 'An error occurred while adding the file'
    });
  }
});

/**
 * PUT /api/streams/:id/files/:fileId
 * Update file position in stream
 */
router.put('/:id/files/:fileId', async (req, res) => {
  try {
    const { id, fileId } = req.params;
    const { position } = req.body;
    
    if (!validateUUID(id) || !validateUUID(fileId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Stream ID and file ID must be valid UUIDs'
      });
    }
    
    if (position === undefined || !Number.isInteger(position) || position < 0) {
      return res.status(400).json({
        error: 'Invalid position',
        message: 'Position must be a non-negative integer'
      });
    }
    
    // Verify ownership
    await validateStreamOwnership(id, req.session.userId);
    
    // Update file position
    const StreamFile = require('../models/StreamFile');
    const result = await StreamFile.updateFilePosition(id, fileId, position);
    
    res.json({
      ...result,
      message: 'File position updated successfully'
    });

  } catch (error) {
    console.error('❌ Update file position error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to update file position',
      message: 'An error occurred while updating the file position'
    });
  }
});

/**
 * POST /api/streams/open-file
 * Create a new stream with a specific file
 */
router.post('/open-file', async (req, res) => {
  try {
    const { fileId, brainId, streamTitle } = req.body;
    
    if (!validateUUID(fileId) || !validateUUID(brainId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'File ID and brain ID must be valid UUIDs'
      });
    }
    
    // Verify file exists and user has access
    const { query } = require('../models/database');
    const fileResult = await query(`
      SELECT f.id, f.file_name, f.brain_id, b.user_id
      FROM files f
      JOIN brains b ON f.brain_id = b.id
      WHERE f.id = $1 AND f.brain_id = $2
    `, [fileId, brainId]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    const file = fileResult.rows[0];
    if (file.user_id !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this file'
      });
    }

    // Create new stream
    const Stream = require('../models/Stream');
    const title = streamTitle || `${file.file_name}`;
    const stream = await Stream.create({
      brainId,
      title,
      userId: req.session.userId
    });

    // Add file to stream
    const StreamFile = require('../models/StreamFile');
    await StreamFile.addFileToStream(stream.id, fileId, 0); // Position 0 (first item)

    res.status(201).json({
      success: true,
      stream: {
        id: stream.id,
        title: stream.title,
        brainId: stream.brainId,
        createdAt: stream.createdAt
      },
      fileId,
      fileName: file.file_name,
      message: `Created new stream "${title}" with file`
    });

  } catch (error) {
    console.error('❌ Open file in stream error:', error);
    res.status(500).json({
      error: 'Failed to open file in stream',
      message: 'An error occurred while creating the stream'
    });
  }
});

module.exports = router;