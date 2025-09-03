const { query, transaction } = require('./database');

/**
 * StreamCard Model
 * Handles the many-to-many relationship between streams and cards
 * with position management, AI context, and collapsed state
 */

class StreamCard {
  constructor(data) {
    this.id = data.id;
    this.streamId = data.stream_id;
    this.cardId = data.card_id;
    this.position = data.position;
    this.depth = data.depth;
    this.isInAIContext = data.is_in_ai_context;
    this.isCollapsed = data.is_collapsed;
    this.addedAt = data.added_at;
  }

  /**
   * Add a card to a stream at a specific position
   * @param {string} streamId - Stream ID
   * @param {string} cardId - Card ID  
   * @param {number} position - Position in stream (0-based)
   * @param {number} depth - Nesting depth (default: 0)
   * @param {Object} options - Additional options
   * @returns {Promise<StreamCard>} - Created StreamCard instance
   */
  static async addCardToStream(streamId, cardId, position = null, depth = 0, options = {}) {
    const { isInAIContext = false, isCollapsed = false } = options;

    return await transaction(async (client) => {
      // Verify stream exists
      const streamResult = await client.query(
        'SELECT id FROM streams WHERE id = $1',
        [streamId]
      );

      if (streamResult.rows.length === 0) {
        throw new Error('Stream not found');
      }

      // Verify card exists and is active
      const cardResult = await client.query(
        'SELECT id FROM cards WHERE id = $1 AND is_active = true',
        [cardId]
      );

      if (cardResult.rows.length === 0) {
        throw new Error('Card not found or inactive');
      }

      // Check if card already exists in this stream
      const existingResult = await client.query(
        'SELECT id FROM stream_cards WHERE stream_id = $1 AND card_id = $2',
        [streamId, cardId]
      );

      if (existingResult.rows.length > 0) {
        throw new Error('Card already exists in this stream');
      }

      // If no position specified, add at the end
      if (position === null) {
        const maxPositionResult = await client.query(
          'SELECT COALESCE(MAX(position), -1) as max_position FROM stream_cards WHERE stream_id = $1',
          [streamId]
        );
        position = maxPositionResult.rows[0].max_position + 1;
      }

      // Debug: Check current positions before shifting
      const beforeShift = await client.query(
        'SELECT card_id, position FROM stream_cards WHERE stream_id = $1 ORDER BY position',
        [streamId]
      );
      console.log(`🔍 Before shift - Stream positions:`, beforeShift.rows.map(r => `${r.card_id.substring(0,8)}:${r.position}`));
      console.log(`🎯 Inserting card ${cardId.substring(0,8)} at position ${position}`);

      // Shift existing cards at this position and after to make room
      // Get cards that need to be shifted (in reverse order to avoid conflicts)
      const cardsToShift = await client.query(
        'SELECT id, position FROM stream_cards WHERE stream_id = $1 AND position >= $2 ORDER BY position DESC',
        [streamId, position]
      );
      
      // Shift each card individually from highest position to lowest
      let shiftedCount = 0;
      for (const cardToShift of cardsToShift.rows) {
        await client.query(
          'UPDATE stream_cards SET position = $1 WHERE id = $2',
          [cardToShift.position + 1, cardToShift.id]
        );
        shiftedCount++;
      }
      console.log(`📊 Shifted ${shiftedCount} cards up by 1 from position ${position}`);

      // Debug: Check positions after shifting
      const afterShift = await client.query(
        'SELECT card_id, position FROM stream_cards WHERE stream_id = $1 ORDER BY position',
        [streamId]
      );
      console.log(`🔍 After shift - Stream positions:`, afterShift.rows.map(r => `${r.card_id.substring(0,8)}:${r.position}`));

      // Insert the new stream_card relationship
      const result = await client.query(`
        INSERT INTO stream_cards (stream_id, card_id, position, depth, is_in_ai_context, is_collapsed)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [streamId, cardId, position, depth, isInAIContext, isCollapsed]);

      console.log(`✅ Added card ${cardId} to stream ${streamId} at position ${position}`);
      return new StreamCard(result.rows[0]);
    });
  }

  /**
   * Remove a card from a stream
   * @param {string} streamId - Stream ID
   * @param {string} cardId - Card ID
   * @returns {Promise<boolean>} - True if card was removed
   */
  static async removeCardFromStream(streamId, cardId) {
    return await transaction(async (client) => {
      // Lock entire stream to prevent concurrent modifications
      await client.query(
        'SELECT id FROM streams WHERE id = $1 FOR UPDATE',
        [streamId]
      );

      // Check if card exists in stream
      const cardResult = await client.query(
        'SELECT position FROM stream_cards WHERE stream_id = $1 AND card_id = $2',
        [streamId, cardId]
      );

      if (cardResult.rows.length === 0) {
        return false; // Card not in stream
      }

      const removedPosition = cardResult.rows[0].position;
      console.log(`🗑️  Removing card ${cardId.substring(0,8)} from position ${removedPosition} in stream ${streamId.substring(0,8)}`);

      // Ultra-simple approach: move all cards to negative positions first, 
      // then delete, then reassign positive sequential positions
      // This completely avoids any constraint conflicts
      
      // Step 1: Move all cards in this stream to negative positions to avoid conflicts
      await client.query(`
        UPDATE stream_cards 
        SET position = -1000 - position
        WHERE stream_id = $1
      `, [streamId]);

      // Step 2: Delete the target card (now at a negative position)
      await client.query(
        'DELETE FROM stream_cards WHERE stream_id = $1 AND card_id = $2',
        [streamId, cardId]
      );

      // Step 3: Reassign all remaining cards to sequential positive positions
      await client.query(`
        WITH sequential_positions AS (
          SELECT 
            id,
            ROW_NUMBER() OVER (ORDER BY 
              -position, -- Since positions are negative, this preserves original order
              added_at
            ) - 1 as new_position
          FROM stream_cards
          WHERE stream_id = $1
        )
        UPDATE stream_cards 
        SET position = sequential_positions.new_position
        FROM sequential_positions
        WHERE stream_cards.id = sequential_positions.id
      `, [streamId]);

      console.log(`✅ Removed card ${cardId} from stream ${streamId} using conflict-free approach`);
      return true;
    });
  }

  /**
   * Reorder a card to a new position within a stream
   * @param {string} streamId - Stream ID
   * @param {string} cardId - Card ID
   * @param {number} newPosition - New position (0-based)
   * @param {number} newDepth - New depth (optional)
   * @returns {Promise<boolean>} - True if card was reordered
   */
  static async reorderCard(streamId, cardId, newPosition, newDepth = null) {
    return await transaction(async (client) => {
      // Get current position and depth
      const currentResult = await client.query(
        'SELECT position, depth FROM stream_cards WHERE stream_id = $1 AND card_id = $2',
        [streamId, cardId]
      );

      if (currentResult.rows.length === 0) {
        throw new Error('Card not found in stream');
      }

      const currentPosition = currentResult.rows[0].position;
      const currentDepth = currentResult.rows[0].depth;

      // If position hasn't changed and depth hasn't changed, nothing to do
      if (currentPosition === newPosition && (newDepth === null || currentDepth === newDepth)) {
        return false;
      }

      // Get max position to validate new position
      const maxResult = await client.query(
        'SELECT COALESCE(MAX(position), 0) as max_position FROM stream_cards WHERE stream_id = $1',
        [streamId]
      );
      const maxPosition = maxResult.rows[0].max_position;

      // Allow negative positions for temporary swapping, but validate non-negative positions
      if (newPosition >= 0 && newPosition > maxPosition) {
        throw new Error(`Invalid position: ${newPosition}. Must be between 0 and ${maxPosition}`);
      }

      // Atomic position reordering with better edge case handling
      if (currentPosition !== newPosition) {
        console.log(`🚀 Starting atomic reorder: card ${cardId.substring(0,8)} from position ${currentPosition} to ${newPosition}`);
        
        // Ensure newPosition is valid (>= 0)
        if (newPosition < 0) {
          console.log(`⚠️  Invalid target position ${newPosition}, normalizing to 0`);
          newPosition = 0;
        }
        
        // Get stream lock and normalize all positions first
        await client.query(`
          SELECT id FROM streams WHERE id = $1 FOR UPDATE
        `, [streamId]);
        
        // Normalize positions to ensure no gaps or negatives
        await client.query(`
          WITH normalized_positions AS (
            SELECT 
              card_id,
              ROW_NUMBER() OVER (ORDER BY 
                CASE WHEN position >= 0 THEN position ELSE 9999 END,
                added_at
              ) - 1 as norm_position
            FROM stream_cards
            WHERE stream_id = $1
          )
          UPDATE stream_cards 
          SET position = normalized_positions.norm_position
          FROM normalized_positions
          WHERE stream_cards.stream_id = $1 
            AND stream_cards.card_id = normalized_positions.card_id
            AND stream_cards.position != normalized_positions.norm_position
        `, [streamId]);
        
        // Get the normalized current position
        const normalizedResult = await client.query(
          'SELECT position FROM stream_cards WHERE stream_id = $1 AND card_id = $2',
          [streamId, cardId]
        );
        const normalizedCurrentPosition = normalizedResult.rows[0].position;
        
        // Simple, foolproof reordering: temporarily move target card to very negative position,
        // then shift others, then move target card to final position
        if (normalizedCurrentPosition !== newPosition) {
          // Step 1: Move target card to temporary position far from any real positions
          await client.query(
            'UPDATE stream_cards SET position = $1 WHERE stream_id = $2 AND card_id = $3',
            [-999999, streamId, cardId]
          );
          
          // Step 2: Shift other cards based on direction
          if (normalizedCurrentPosition < newPosition) {
            // Moving down: shift cards between old and new position up by 1
            await client.query(`
              UPDATE stream_cards 
              SET position = position - 1 
              WHERE stream_id = $1 AND position > $2 AND position <= $3
            `, [streamId, normalizedCurrentPosition, newPosition]);
          } else {
            // Moving up: shift cards between new and old position down by 1
            await client.query(`
              UPDATE stream_cards 
              SET position = position + 1 
              WHERE stream_id = $1 AND position >= $2 AND position < $3
            `, [streamId, newPosition, normalizedCurrentPosition]);
          }
          
          // Step 3: Move target card to final position
          await client.query(
            'UPDATE stream_cards SET position = $1 WHERE stream_id = $2 AND card_id = $3',
            [newPosition, streamId, cardId]
          );
        }
        
        console.log(`🔄 Atomically reordered card ${cardId} from position ${normalizedCurrentPosition} to ${newPosition}`);
        return true;
      }

      // Update depth if provided (position was already updated above)
      if (newDepth !== null) {
        await client.query(
          'UPDATE stream_cards SET depth = $1 WHERE stream_id = $2 AND card_id = $3',
          [newDepth, streamId, cardId]
        );
        console.log(`📏 Updated card ${cardId} depth to ${newDepth}`);
      }

      console.log(`✅ Reordered card ${cardId} in stream ${streamId} to position ${newPosition}`);
      return true;
    });
  }

  /**
   * Toggle AI context for a card in a stream
   * @param {string} streamId - Stream ID
   * @param {string} cardId - Card ID
   * @returns {Promise<boolean>} - New AI context state
   */
  static async toggleAIContext(streamId, cardId) {
    const result = await query(`
      UPDATE stream_cards 
      SET is_in_ai_context = NOT is_in_ai_context 
      WHERE stream_id = $1 AND card_id = $2
      RETURNING is_in_ai_context
    `, [streamId, cardId]);

    if (result.rows.length === 0) {
      throw new Error('Card not found in stream');
    }

    const newState = result.rows[0].is_in_ai_context;
    console.log(`✅ Toggled AI context for card ${cardId} in stream ${streamId}: ${newState}`);
    return newState;
  }

  /**
   * Toggle collapsed state for a card in a stream
   * @param {string} streamId - Stream ID
   * @param {string} cardId - Card ID
   * @returns {Promise<boolean>} - New collapsed state
   */
  static async toggleCollapsed(streamId, cardId) {
    const result = await query(`
      UPDATE stream_cards 
      SET is_collapsed = NOT is_collapsed 
      WHERE stream_id = $1 AND card_id = $2
      RETURNING is_collapsed
    `, [streamId, cardId]);

    if (result.rows.length === 0) {
      throw new Error('Card not found in stream');
    }

    const newState = result.rows[0].is_collapsed;
    console.log(`✅ Toggled collapsed state for card ${cardId} in stream ${streamId}: ${newState}`);
    return newState;
  }

  /**
   * Update card state in stream (AI context, collapsed, depth)
   * @param {string} streamId - Stream ID
   * @param {string} cardId - Card ID
   * @param {Object} updates - State updates
   * @returns {Promise<StreamCard>} - Updated StreamCard instance
   */
  static async updateCardState(streamId, cardId, updates) {
    const allowedFields = ['is_in_ai_context', 'is_collapsed', 'depth'];
    const validUpdates = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        validUpdates[key] = value;
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = Object.keys(validUpdates).map((key, index) => `${key} = $${index + 3}`).join(', ');
    const values = [streamId, cardId, ...Object.values(validUpdates)];

    const result = await query(`
      UPDATE stream_cards 
      SET ${setClause}
      WHERE stream_id = $1 AND card_id = $2
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Card not found in stream');
    }

    return new StreamCard(result.rows[0]);
  }

  /**
   * Get all cards in a stream with proper ordering
   * @param {string} streamId - Stream ID
   * @returns {Promise<Array<Object>>} - Array of cards with stream metadata
   */
  static async getStreamCards(streamId) {
    const result = await query(`
      SELECT c.*, sc.position, sc.depth, sc.is_in_ai_context, sc.is_collapsed, sc.added_at
      FROM cards c
      JOIN stream_cards sc ON c.id = sc.card_id
      WHERE sc.stream_id = $1 AND c.is_active = true
      ORDER BY sc.position
    `, [streamId]);

    const Card = require('./Card');
    const cards = [];
    
    for (const row of result.rows) {
      const card = new Card(row);
      const cardData = await card.toJSON(false); // Get full card data with file info
      
      // Add stream-specific metadata
      cardData.position = row.position;
      cardData.depth = row.depth;
      cardData.isInAIContext = row.is_in_ai_context;
      cardData.isCollapsed = row.is_collapsed;
      cardData.addedAt = row.added_at;
      
      cards.push(cardData);
    }
    
    return cards;
  }

  /**
   * Get all streams that contain a specific card
   * @param {string} cardId - Card ID
   * @returns {Promise<Array<Object>>} - Array of streams with position info
   */
  static async getCardStreams(cardId) {
    const result = await query(`
      SELECT s.*, sc.position, sc.depth, sc.is_in_ai_context, sc.is_collapsed, sc.added_at
      FROM streams s
      JOIN stream_cards sc ON s.id = sc.stream_id
      WHERE sc.card_id = $1
      ORDER BY s.name
    `, [cardId]);

    return result.rows.map(row => ({
      id: row.id,
      brainId: row.brain_id,
      name: row.name,
      isFavorited: row.is_favorited,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      // Card position in this stream
      position: row.position,
      depth: row.depth,
      isInAIContext: row.is_in_ai_context,
      isCollapsed: row.is_collapsed,
      addedAt: row.added_at
    }));
  }

  /**
   * Get cards in AI context for a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<Array<Object>>} - Array of cards in AI context
   */
  static async getAIContextCards(streamId) {
    const result = await query(`
      SELECT c.id, c.title, c.content_preview, sc.position, sc.depth
      FROM cards c
      JOIN stream_cards sc ON c.id = sc.card_id
      WHERE sc.stream_id = $1 AND sc.is_in_ai_context = true AND c.is_active = true
      ORDER BY sc.position
    `, [streamId]);

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      contentPreview: row.content_preview,
      position: row.position,
      depth: row.depth
    }));
  }

  /**
   * Normalize positions in a stream (fix gaps and duplicates)
   * @param {string} streamId - Stream ID
   * @returns {Promise<number>} - Number of cards reordered
   */
  static async normalizePositions(streamId) {
    return await transaction(async (client) => {
      // Get all cards in order
      const result = await client.query(`
        SELECT id, position 
        FROM stream_cards 
        WHERE stream_id = $1 
        ORDER BY position, added_at
      `, [streamId]);

      // Update positions to be sequential starting from 0
      let updated = 0;
      for (let i = 0; i < result.rows.length; i++) {
        const card = result.rows[i];
        if (card.position !== i) {
          await client.query(
            'UPDATE stream_cards SET position = $1 WHERE id = $2',
            [i, card.id]
          );
          updated++;
        }
      }

      if (updated > 0) {
        console.log(`✅ Normalized ${updated} card positions in stream ${streamId}`);
      }

      return updated;
    });
  }

  /**
   * Get position statistics for a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object>} - Position statistics
   */
  static async getPositionStats(streamId) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_cards,
        MIN(position) as min_position,
        MAX(position) as max_position,
        COUNT(DISTINCT position) as unique_positions,
        COUNT(*) FILTER (WHERE is_in_ai_context = true) as ai_context_count
      FROM stream_cards 
      WHERE stream_id = $1
    `, [streamId]);

    const stats = result.rows[0];
    return {
      totalCards: parseInt(stats.total_cards),
      minPosition: parseInt(stats.min_position || 0),
      maxPosition: parseInt(stats.max_position || 0),
      uniquePositions: parseInt(stats.unique_positions),
      aiContextCount: parseInt(stats.ai_context_count),
      hasGaps: parseInt(stats.unique_positions) !== parseInt(stats.total_cards),
      expectedMaxPosition: parseInt(stats.total_cards) - 1
    };
  }

  /**
   * Bulk update positions for multiple cards
   * @param {string} streamId - Stream ID
   * @param {Array<Object>} updates - Array of {cardId, position, depth?} objects
   * @returns {Promise<number>} - Number of cards updated
   */
  static async bulkUpdatePositions(streamId, updates) {
    return await transaction(async (client) => {
      let updated = 0;
      
      for (const update of updates) {
        const { cardId, position, depth } = update;
        
        const setFields = ['position = $3'];
        const values = [streamId, cardId, position];
        
        if (depth !== undefined) {
          setFields.push('depth = $4');
          values.push(depth);
        }
        
        const result = await client.query(`
          UPDATE stream_cards 
          SET ${setFields.join(', ')}
          WHERE stream_id = $1 AND card_id = $2
        `, values);
        
        updated += result.rowCount;
      }
      
      console.log(`✅ Bulk updated ${updated} card positions in stream ${streamId}`);
      return updated;
    });
  }
}

module.exports = StreamCard;