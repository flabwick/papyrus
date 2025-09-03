const { query, transaction } = require('./database');

/**
 * Stream Model
 * Handles stream-related database operations and business logic
 */

class Stream {
  constructor(data) {
    this.id = data.id;
    this.brainId = data.brain_id;
    this.name = data.name;
    this.isFavorited = data.is_favorited;
    this.createdAt = data.created_at;
    this.lastAccessedAt = data.last_accessed_at;
  }

  /**
   * Create a new stream
   * @param {string} brainId - Brain ID that owns the stream
   * @param {string} name - Stream name (must be unique within brain)
   * @param {boolean} isWelcomeStream - Whether this is a welcome stream with tutorial content
   * @returns {Promise<Stream>} - Created stream instance
   */
  static async create(brainId, name, isWelcomeStream = false) {
    if (!name || name.trim().length === 0) {
      throw new Error('Stream name is required');
    }

    if (name.length > 100) {
      throw new Error('Stream name cannot exceed 100 characters');
    }

    return await transaction(async (client) => {
      // Verify brain exists
      const brainResult = await client.query(
        'SELECT id FROM brains WHERE id = $1',
        [brainId]
      );

      if (brainResult.rows.length === 0) {
        throw new Error('Brain not found');
      }

      // Check if stream name already exists in this brain
      const existingStream = await client.query(
        'SELECT id FROM streams WHERE brain_id = $1 AND name = $2',
        [brainId, name.trim()]
      );

      if (existingStream.rows.length > 0) {
        throw new Error(`Stream '${name}' already exists in this brain`);
      }

      // Insert stream into database
      const result = await client.query(`
        INSERT INTO streams (brain_id, name, is_favorited)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [brainId, name.trim(), isWelcomeStream]);

      const stream = new Stream(result.rows[0]);

      // If this is a welcome stream, create tutorial content
      if (isWelcomeStream) {
        const welcomeContent = require('../services/welcomeContent');
        await welcomeContent.createWelcomeCards(brainId, stream.id);
      }

      console.log(`✅ Created stream: ${name} in brain ${brainId}`);
      return stream;
    });
  }

  /**
   * Find stream by ID
   * @param {string} streamId - Stream ID to find
   * @returns {Promise<Stream|null>} - Stream instance or null
   */
  static async findById(streamId) {
    const result = await query(
      'SELECT * FROM streams WHERE id = $1',
      [streamId]
    );

    return result.rows.length > 0 ? new Stream(result.rows[0]) : null;
  }

  /**
   * Find stream by brain and name
   * @param {string} brainId - Brain ID
   * @param {string} name - Stream name
   * @returns {Promise<Stream|null>} - Stream instance or null
   */
  static async findByBrainAndName(brainId, name) {
    const result = await query(
      'SELECT * FROM streams WHERE brain_id = $1 AND name = $2',
      [brainId, name]
    );

    return result.rows.length > 0 ? new Stream(result.rows[0]) : null;
  }

  /**
   * Get all streams for a brain with automatic cleanup
   * @param {string} brainId - Brain ID
   * @param {Object} options - Query options
   * @returns {Promise<Array<Stream>>} - Array of stream instances
   */
  static async findByBrainId(brainId, options = {}) {
    // First, cleanup expired unfavorited streams
    await Stream.cleanupExpired();

    const { orderBy = 'name' } = options;
    
    const result = await query(`
      SELECT * FROM streams 
      WHERE brain_id = $1
      ORDER BY ${orderBy}
    `, [brainId]);

    return result.rows.map(row => new Stream(row));
  }

  /**
   * Clean up expired unfavorited streams (older than 30 days)
   * @returns {Promise<number>} - Number of streams deleted
   */
  static async cleanupExpired() {
    try {
      const result = await query(`
        DELETE FROM streams 
        WHERE is_favorited = false 
        AND last_accessed_at < NOW() - INTERVAL '30 days'
        RETURNING id, name
      `);

      if (result.rows.length > 0) {
        console.log(`✅ Cleaned up ${result.rows.length} expired streams`);
      }

      return result.rows.length;
    } catch (error) {
      console.error('❌ Error cleaning up expired streams:', error.message);
      return 0;
    }
  }

  /**
   * Update last accessed timestamp
   * @returns {Promise<void>}
   */
  async updateLastAccessed() {
    await query(
      'UPDATE streams SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = $1',
      [this.id]
    );

    this.lastAccessedAt = new Date();
  }

  /**
   * Toggle favorite status
   * @returns {Promise<void>}
   */
  async toggleFavorite() {
    const result = await query(
      'UPDATE streams SET is_favorited = NOT is_favorited WHERE id = $1 RETURNING is_favorited',
      [this.id]
    );

    this.isFavorited = result.rows[0].is_favorited;
    console.log(`✅ Stream '${this.name}' favorite status: ${this.isFavorited}`);
  }

  /**
   * Update stream metadata
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async update(updates) {
    const allowedFields = ['name', 'is_favorited'];
    const validUpdates = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        validUpdates[key] = value;
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Check name uniqueness if name is being updated
    if (validUpdates.name && validUpdates.name !== this.name) {
      const existing = await Stream.findByBrainAndName(this.brainId, validUpdates.name);
      if (existing && existing.id !== this.id) {
        throw new Error(`Stream '${validUpdates.name}' already exists in this brain`);
      }
    }

    const setClause = Object.keys(validUpdates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [this.id, ...Object.values(validUpdates)];

    await query(`
      UPDATE streams 
      SET ${setClause}
      WHERE id = $1
    `, values);

    // Update instance properties
    Object.assign(this, validUpdates);

    console.log(`✅ Updated stream: ${this.name}`);
  }

  /**
   * Get all cards in this stream with proper ordering
   * @returns {Promise<Array<Object>>} - Array of cards with stream metadata
   */
  async getCards() {
    const result = await query(`
      SELECT c.*, sc.position, sc.depth, sc.is_in_ai_context, sc.is_collapsed, sc.added_at
      FROM cards c
      JOIN stream_cards sc ON c.id = sc.card_id
      WHERE sc.stream_id = $1 AND c.is_active = true
      ORDER BY sc.position
    `, [this.id]);

    return result.rows.map(row => ({
      id: row.id,
      brainId: row.brain_id,
      title: row.title,
      contentPreview: row.content_preview,
      fileSize: row.file_size,
      hasFile: !!row.file_path,
      filePath: row.file_path,
      lastModified: row.last_modified,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Stream-specific metadata
      position: row.position,
      depth: row.depth,
      isInAIContext: row.is_in_ai_context,
      isCollapsed: row.is_collapsed,
      addedAt: row.added_at
    }));
  }

  /**
   * Get card count for this stream
   * @returns {Promise<number>} - Card count
   */
  async getCardCount() {
    const result = await query(`
      SELECT COUNT(*) as count 
      FROM stream_cards sc
      JOIN cards c ON sc.card_id = c.id
      WHERE sc.stream_id = $1 AND c.is_active = true
    `, [this.id]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Get cards in AI context for this stream
   * @returns {Promise<Array<Object>>} - Array of cards in AI context
   */
  async getAIContextCards() {
    const result = await query(`
      SELECT c.*, sc.position, sc.depth
      FROM cards c
      JOIN stream_cards sc ON c.id = sc.card_id
      WHERE sc.stream_id = $1 AND sc.is_in_ai_context = true AND c.is_active = true
      ORDER BY sc.position
    `, [this.id]);

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      contentPreview: row.content_preview,
      position: row.position,
      depth: row.depth
    }));
  }

  /**
   * Delete stream and all its stream_cards relationships
   * @returns {Promise<void>}
   */
  async delete() {
    await transaction(async (client) => {
      // First, delete any stream-specific (unsaved) cards that belong only to this stream
      await client.query('DELETE FROM cards WHERE stream_specific_id = $1', [this.id]);
      
      // Delete stream_cards relationships
      await client.query('DELETE FROM stream_cards WHERE stream_id = $1', [this.id]);
      
      // Delete stream_files relationships
      await client.query('DELETE FROM stream_files WHERE stream_id = $1', [this.id]);
      
      // Finally, delete the stream itself
      await client.query('DELETE FROM streams WHERE id = $1', [this.id]);
      
      console.log(`✅ Deleted stream: ${this.name} and all associated data`);
    });
  }

  /**
   * Duplicate stream with all cards and their states
   * @param {string} newName - Name for the duplicated stream
   * @returns {Promise<Stream>} - New stream instance
   */
  async duplicate(newName) {
    return await transaction(async (client) => {
      // Create new stream
      const streamResult = await client.query(`
        INSERT INTO streams (brain_id, name, is_favorited)
        VALUES ($1, $2, false)
        RETURNING *
      `, [this.brainId, newName]);

      const newStream = new Stream(streamResult.rows[0]);

      // Copy all stream_cards relationships
      await client.query(`
        INSERT INTO stream_cards (stream_id, card_id, position, depth, is_in_ai_context, is_collapsed)
        SELECT $1, card_id, position, depth, is_in_ai_context, is_collapsed
        FROM stream_cards
        WHERE stream_id = $2
        ORDER BY position
      `, [newStream.id, this.id]);

      console.log(`✅ Duplicated stream '${this.name}' as '${newName}'`);
      return newStream;
    });
  }

  /**
   * Get stream info for API responses
   * @param {boolean} includeCards - Include card information (default: false)
   * @returns {Promise<Object>} - Stream data
   */
  async toJSON(includeCards = false) {
    const cardCount = await this.getCardCount();
    const aiContextCount = (await this.getAIContextCards()).length;
    
    const data = {
      id: this.id,
      brainId: this.brainId,
      name: this.name,
      isFavorited: this.isFavorited,
      cardCount,
      aiContextCount,
      createdAt: this.createdAt,
      lastAccessedAt: this.lastAccessedAt
    };

    if (includeCards) {
      data.cards = await this.getCards();
    }

    return data;
  }
}

module.exports = Stream;