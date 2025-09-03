const Stream = require('../models/Stream');
const StreamCard = require('../models/StreamCard');
const Card = require('../models/Card');
const Brain = require('../models/Brain');
const { query } = require('../models/database');

/**
 * Stream Manager Service
 * Orchestrates complex stream operations involving multiple models
 */

class StreamManager {
  /**
   * Create a welcome stream for a new brain with tutorial content
   * @param {string} brainId - Brain ID
   * @returns {Promise<Stream>} - Created welcome stream
   */
  static async createWelcomeStream(brainId) {
    // Create the welcome stream (will automatically create tutorial cards)
    const stream = await Stream.create(brainId, 'Welcome to Your Brain', true);
    
    console.log(`✅ Created welcome stream for brain ${brainId}`);
    return stream;
  }

  /**
   * Add a card to a stream with smart position management
   * @param {string} streamId - Stream ID
   * @param {string} cardId - Card ID
   * @param {number|null} insertAfterPosition - Position to insert after (null for end)
   * @param {number} depth - Nesting depth (default: 0)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Result with stream card and updated positions
   */
  static async addCardToStream(streamId, cardId, insertAfterPosition = null, depth = 0, options = {}) {
    // Calculate actual insertion position
    let insertPosition = 0;
    
    if (insertAfterPosition !== null) {
      insertPosition = insertAfterPosition + 1;
    } else {
      // Add at the end
      const stats = await StreamCard.getPositionStats(streamId);
      insertPosition = stats.expectedMaxPosition + 1;
    }

    // Add the card
    const streamCard = await StreamCard.addCardToStream(streamId, cardId, insertPosition, depth, options);
    
    // Get updated stream information
    const stream = await Stream.findById(streamId);
    const cards = await StreamCard.getStreamCards(streamId);
    
    return {
      streamCard,
      stream: await stream.toJSON(),
      totalCards: cards.length,
      insertedAt: insertPosition
    };
  }

  /**
   * Move a card to a new position within a stream
   * @param {string} streamId - Stream ID
   * @param {string} cardId - Card ID
   * @param {number} newPosition - New position
   * @param {number|null} newDepth - New depth (optional)
   * @returns {Promise<Object>} - Result with updated positions
   */
  static async moveCard(streamId, cardId, newPosition, newDepth = null) {
    const wasReordered = await StreamCard.reorderCard(streamId, cardId, newPosition, newDepth);
    
    if (!wasReordered) {
      return { changed: false };
    }

    // Get updated stream information
    const stream = await Stream.findById(streamId);
    const cards = await StreamCard.getStreamCards(streamId);
    
    return {
      changed: true,
      stream: await stream.toJSON(),
      cards,
      totalCards: cards.length
    };
  }

  /**
   * Remove a card from a stream and reposition remaining cards
   * @param {string} streamId - Stream ID
   * @param {string} cardId - Card ID
   * @returns {Promise<Object>} - Result with updated stream information
   */
  static async removeCardFromStream(streamId, cardId) {
    const wasRemoved = await StreamCard.removeCardFromStream(streamId, cardId);
    
    if (!wasRemoved) {
      return { removed: false };
    }

    // Get updated stream information
    const stream = await Stream.findById(streamId);
    const cards = await StreamCard.getStreamCards(streamId);
    
    return {
      removed: true,
      stream: await stream.toJSON(),  
      cards,
      totalCards: cards.length
    };
  }

  /**
   * Duplicate a stream with all cards and states
   * @param {string} streamId - Stream ID to duplicate
   * @param {string} newName - Name for the new stream
   * @returns {Promise<Object>} - Result with new stream information
   */
  static async duplicateStream(streamId, newName) {
    const originalStream = await Stream.findById(streamId);
    
    if (!originalStream) {
      throw new Error('Stream not found');
    }

    const newStream = await originalStream.duplicate(newName);
    const cards = await StreamCard.getStreamCards(newStream.id);
    
    return {
      originalStream: await originalStream.toJSON(),
      newStream: await newStream.toJSON(),
      cards,
      totalCards: cards.length
    };
  }

  /**
   * Get a stream with full card details and metadata
   * @param {string} streamId - Stream ID
   * @param {boolean} includeContent - Include full card content (default: false)
   * @returns {Promise<Object>} - Stream with complete card information
   */
  static async getStreamWithCards(streamId, includeContent = false) {
    const stream = await Stream.findById(streamId);
    
    if (!stream) {
      throw new Error('Stream not found');
    }

    // Update last accessed timestamp
    await stream.updateLastAccessed();
    
    const cards = await StreamCard.getStreamCards(streamId);
    const aiContextCards = await StreamCard.getAIContextCards(streamId);
    
    // Optionally include full content for each card
    if (includeContent) {
      for (const card of cards) {
        const fullCard = await Card.findById(card.id);
        if (fullCard) {
          card.content = await fullCard.getContent();
        }
      }
    }
    
    const streamData = await stream.toJSON();
    
    return {
      ...streamData,
      cards,
      aiContextCards,
      totalCards: cards.length,
      aiContextCount: aiContextCards.length
    };
  }

  /**
   * Search cards for adding to streams (current brain first, then others)
   * @param {string} brainId - Current brain ID
   * @param {string} query - Search query
   * @param {boolean} includeOtherBrains - Include cards from other brains (default: true)
   * @param {string} userId - User ID for cross-brain search
   * @returns {Promise<Object>} - Search results organized by brain
   */
  static async searchCardsForStream(brainId, searchQuery, includeOtherBrains = true, userId = null) {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return {
        currentBrain: [],
        otherBrains: [],
        totalResults: 0
      };
    }

    const results = {
      currentBrain: [],
      otherBrains: [],
      totalResults: 0
    };

    // Search current brain first
    const currentBrainCards = await Card.search(brainId, searchQuery, { 
      activeOnly: true, 
      limit: 25 
    });
    
    results.currentBrain = await Promise.all(
      currentBrainCards.map(async card => ({
        ...(await card.toJSON()),
        brainName: null // Will be filled below
      }))
    );

    // Get brain name for current brain
    if (results.currentBrain.length > 0) {
      const brain = await Brain.findById(brainId);
      results.currentBrain.forEach(card => {
        card.brainName = brain ? brain.name : 'Unknown Brain';
      });
    }

    // Search other brains if requested and user ID provided
    if (includeOtherBrains && userId) {
      const otherBrains = await Brain.findByUserId(userId);
      
      for (const brain of otherBrains) {
        if (brain.id === brainId) continue; // Skip current brain
        
        const brainCards = await Card.search(brain.id, searchQuery, { 
          activeOnly: true, 
          limit: 10 // Fewer results per other brain
        });
        
        const cardsWithBrainName = await Promise.all(
          brainCards.map(async card => ({
            ...(await card.toJSON()),
            brainName: brain.name
          }))
        );
        
        results.otherBrains.push(...cardsWithBrainName);
      }
    }

    results.totalResults = results.currentBrain.length + results.otherBrains.length;
    
    return results;
  }

  /**
   * Get comprehensive stream statistics
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object>} - Detailed stream statistics
   */
  static async getStreamStats(streamId) {
    const stream = await Stream.findById(streamId);
    
    if (!stream) {
      throw new Error('Stream not found');
    }

    const positionStats = await StreamCard.getPositionStats(streamId);
    const cards = await StreamCard.getStreamCards(streamId);
    const aiContextCards = await StreamCard.getAIContextCards(streamId);
    
    // Calculate depth distribution
    const depthDistribution = {};
    cards.forEach(card => {
      depthDistribution[card.depth] = (depthDistribution[card.depth] || 0) + 1;
    });
    
    // Calculate total content size for AI context cards
    let aiContextSize = 0;
    for (const contextCard of aiContextCards) {
      const card = await Card.findById(contextCard.id);
      if (card) {
        aiContextSize += card.fileSize || 0;
      }
    }
    
    return {
      streamId: stream.id,
      streamName: stream.name,
      brainId: stream.brainId,
      isFavorited: stream.isFavorited,
      createdAt: stream.createdAt,
      lastAccessedAt: stream.lastAccessedAt,
      ...positionStats,
      depthDistribution,
      aiContextSize,
      averageDepth: cards.length > 0 ? cards.reduce((sum, card) => sum + card.depth, 0) / cards.length : 0,
      hasNestedCards: Object.keys(depthDistribution).some(depth => parseInt(depth) > 0)
    };
  }

  /**
   * Reorder multiple cards at once (batch operation)
   * @param {string} streamId - Stream ID
   * @param {Array<Object>} reorderInstructions - Array of {cardId, newPosition, newDepth?}
   * @returns {Promise<Object>} - Result with updated stream information
   */
  static async batchReorderCards(streamId, reorderInstructions) {
    // Validate all cards exist in the stream first
    const currentCards = await StreamCard.getStreamCards(streamId);
    const currentCardIds = currentCards.map(card => card.id);
    
    for (const instruction of reorderInstructions) {
      if (!currentCardIds.includes(instruction.cardId)) {
        throw new Error(`Card ${instruction.cardId} not found in stream`);
      }
    }
    
    // Apply bulk position updates
    const updated = await StreamCard.bulkUpdatePositions(streamId, reorderInstructions);
    
    // Normalize positions to ensure no gaps
    await StreamCard.normalizePositions(streamId);
    
    // Get updated stream information
    const stream = await Stream.findById(streamId);
    const cards = await StreamCard.getStreamCards(streamId);
    
    return {
      updated,
      stream: await stream.toJSON(),
      cards,
      totalCards: cards.length
    };
  }

  /**
   * Get stream history and usage analytics
   * @param {string} brainId - Brain ID
   * @param {number} limit - Number of recent streams to return (default: 10)
   * @returns {Promise<Object>} - Stream usage analytics
   */
  static async getStreamAnalytics(brainId, limit = 10) {
    const result = await query(`
      SELECT 
        s.*,
        COUNT(sc.id) as card_count,
        COUNT(sc.id) FILTER (WHERE sc.is_in_ai_context = true) as ai_context_count,
        AVG(sc.depth) as avg_depth
      FROM streams s
      LEFT JOIN stream_cards sc ON s.id = sc.stream_id
      LEFT JOIN cards c ON sc.card_id = c.id AND c.is_active = true
      WHERE s.brain_id = $1
      GROUP BY s.id
      ORDER BY s.last_accessed_at DESC
      LIMIT $2
    `, [brainId, limit]);

    const recentStreams = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      isFavorited: row.is_favorited,
      cardCount: parseInt(row.card_count) || 0,
      aiContextCount: parseInt(row.ai_context_count) || 0,
      avgDepth: parseFloat(row.avg_depth) || 0,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at
    }));

    // Get overall statistics
    const statsResult = await query(`
      SELECT 
        COUNT(DISTINCT s.id) as total_streams,
        COUNT(DISTINCT s.id) FILTER (WHERE s.is_favorited = true) as favorited_streams,
        COUNT(DISTINCT sc.card_id) as unique_cards_in_streams,
        AVG(card_counts.card_count) as avg_cards_per_stream
      FROM streams s
      LEFT JOIN stream_cards sc ON s.id = sc.stream_id
      LEFT JOIN cards c ON sc.card_id = c.id AND c.is_active = true
      LEFT JOIN (
        SELECT stream_id, COUNT(*) as card_count
        FROM stream_cards sc2
        JOIN cards c2 ON sc2.card_id = c2.id AND c2.is_active = true
        GROUP BY stream_id
      ) card_counts ON s.id = card_counts.stream_id
      WHERE s.brain_id = $1
    `, [brainId]);

    const stats = statsResult.rows[0];

    return {
      recentStreams,
      analytics: {
        totalStreams: parseInt(stats.total_streams) || 0,
        favoritedStreams: parseInt(stats.favorited_streams) || 0,
        uniqueCardsInStreams: parseInt(stats.unique_cards_in_streams) || 0,
        avgCardsPerStream: parseFloat(stats.avg_cards_per_stream) || 0
      }
    };
  }
}

module.exports = StreamManager;