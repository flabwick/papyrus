const { query, transaction } = require('./database');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * Card Model
 * Handles card-related database operations and file system integration
 */

class Card {
  constructor(data) {
    this.id = data.id;
    this.brainId = data.brain_id;
    this.title = data.title;
    this.filePath = data.file_path;
    this.fileHash = data.file_hash;
    this.contentPreview = data.content_preview;
    this.fileSize = data.file_size;
    this.isActive = data.is_active;
    this.lastModified = data.last_modified;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
    // Card Type System properties (legacy - now simplified to titled/untitled)
    this.cardType = data.card_type || 'saved';
    this.isBrainWide = data.is_brain_wide !== undefined ? data.is_brain_wide : true;
    this.streamSpecificId = data.stream_specific_id || null;
    this.fileId = data.file_id || null;
  }

  /**
   * Create a new card with optional file system integration
   * @param {string} brainId - Brain ID that owns the card
   * @param {string} title - Card title (optional for unsaved cards)
   * @param {Object} options - Card creation options
   * @param {string} options.content - Card content (markdown)
   * @param {string} options.filePath - Path to source file (optional)
   * @param {string} options.fileHash - File hash for sync (optional)
   * @param {number} options.fileSize - File size in bytes (optional)
   * @param {string} options.streamId - Stream ID for unsaved cards
   * @param {string} options.fileId - File ID for file cards
   * @returns {Promise<Card>} - Created card instance
   */
  static async create(brainId, title, options = {}) {
    const {
      content = '',
      filePath = null,
      fileHash = null,
      fileSize = 0,
      streamId = null,
      fileId = null
    } = options;
    
    let cardType = options.cardType || null; // Use let for reassignment

    // Determine card type based on title and context
    if (!cardType) {
      if (fileId) {
        cardType = 'file';
      } else if (title && title.trim().length > 0) {
        cardType = 'saved'; // Titled cards are saved
      } else {
        cardType = 'unsaved'; // Untitled cards are unsaved
      }
    }

    // Normalize empty strings to null for untitled cards
    if (title && title.trim().length === 0) {
      title = null;
    }

    // Validate stream requirements for untitled cards
    if (!title && !streamId) {
      throw new Error('Stream ID is required for untitled cards');
    }

    // Validate file card requirements
    if (cardType === 'file' && !fileId) {
      throw new Error('File ID is required for file cards');
    }

    if (title && title.length > 200) {
      throw new Error('Card title cannot exceed 200 characters');
    }

    return await transaction(async (client) => {
      // Verify brain exists and get brain info
      const brainResult = await client.query(
        'SELECT id, folder_path, user_id FROM brains WHERE id = $1',
        [brainId]
      );

      if (brainResult.rows.length === 0) {
        throw new Error('Brain not found');
      }

      const brain = brainResult.rows[0];

      // Check if card title already exists in this brain (only for titled cards)
      if (title && title.trim()) {
        const existingCard = await client.query(
          'SELECT id FROM cards WHERE brain_id = $1 AND title = $2 AND is_active = true',
          [brainId, title.trim()]
        );

        if (existingCard.rows.length > 0) {
          throw new Error(`Card '${title}' already exists in this brain`);
        }
      }

      // Validate stream exists for untitled cards
      if (!title) {
        const streamResult = await client.query(
          'SELECT id FROM streams WHERE id = $1 AND brain_id = $2',
          [streamId, brainId]
        );
        
        if (streamResult.rows.length === 0) {
          throw new Error('Stream not found or does not belong to this brain');
        }
      }

      // Generate content preview (first 500 characters)
      const contentPreview = content.substring(0, 500);

      // Calculate file hash if content provided
      let calculatedHash = fileHash;
      if (content && !fileHash) {
        calculatedHash = crypto.createHash('sha256').update(content).digest('hex');
      }

      // Set card type specific properties
      const isBrainWide = !!title; // Titled cards are brain-wide
      const streamSpecificId = !title ? streamId : null; // Untitled cards are stream-specific
      const titleToStore = title ? title.trim() : null;

      // Insert card into database
      const result = await client.query(`
        INSERT INTO cards (
          brain_id, title, file_path, file_hash, content_preview, file_size, is_active, 
          last_modified, card_type, is_brain_wide, stream_specific_id, file_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, $9, $10, $11)
        RETURNING *
      `, [
        brainId, titleToStore, filePath, calculatedHash, contentPreview, fileSize, true,
        cardType, isBrainWide, streamSpecificId, fileId
      ]);

      const card = new Card(result.rows[0]);

      // If content provided and no file path, save as markdown file (only for titled cards)
      if (content && !filePath && titleToStore) {
        const sanitizedTitle = titleToStore.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
        const fileName = `${sanitizedTitle}.md`;
        const cardFilePath = path.join(brain.folder_path, 'cards', fileName);
        
        await fs.ensureDir(path.dirname(cardFilePath));
        await fs.writeFile(cardFilePath, content, 'utf8');
        
        // Update card with file path
        await client.query(
          'UPDATE cards SET file_path = $1 WHERE id = $2',
          [cardFilePath, card.id]
        );
        card.filePath = cardFilePath;
      }

      // Update brain storage usage
      await client.query(
        'UPDATE brains SET storage_used = storage_used + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [fileSize, brainId]
      );

      console.log(`✅ Created card: ${title} in brain ${brainId}`);
      return card;
    });
  }

  /**
   * Find card by ID
   * @param {string} cardId - Card ID to find
   * @returns {Promise<Card|null>} - Card instance or null
   */
  static async findById(cardId) {
    const result = await query(
      'SELECT * FROM cards WHERE id = $1',
      [cardId]
    );

    return result.rows.length > 0 ? new Card(result.rows[0]) : null;
  }

  /**
   * Find card by brain and title
   * @param {string} brainId - Brain ID
   * @param {string} title - Card title
   * @param {boolean} activeOnly - Only return active cards (default: true)
   * @returns {Promise<Card|null>} - Card instance or null
   */
  static async findByBrainAndTitle(brainId, title, activeOnly = true) {
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT * FROM cards 
      WHERE brain_id = $1 AND title = $2 ${whereClause}
    `, [brainId, title]);

    return result.rows.length > 0 ? new Card(result.rows[0]) : null;
  }

  /**
   * Find card by file path
   * @param {string} filePath - File path to find
   * @returns {Promise<Card|null>} - Card instance or null
   */
  static async findByFilePath(filePath) {
    const result = await query(
      'SELECT * FROM cards WHERE file_path = $1 AND is_active = true',
      [filePath]
    );

    return result.rows.length > 0 ? new Card(result.rows[0]) : null;
  }

  /**
   * Get all cards in a brain
   * @param {string} brainId - Brain ID
   * @param {Object} options - Query options
   * @param {boolean} options.activeOnly - Only return active cards (default: true)
   * @param {number} options.limit - Limit number of results
   * @param {number} options.offset - Offset for pagination
   * @param {string} options.orderBy - Order by field (default: 'title')
   * @returns {Promise<Array<Card>>} - Array of card instances
   */
  static async findByBrainId(brainId, options = {}) {
    const {
      activeOnly = true,
      limit = null,
      offset = 0,
      orderBy = 'title'
    } = options;

    const whereClause = activeOnly ? 'AND is_active = true' : '';
    const limitClause = limit ? `LIMIT ${limit} OFFSET ${offset}` : '';
    
    const result = await query(`
      SELECT * FROM cards 
      WHERE brain_id = $1 ${whereClause}
      ORDER BY ${orderBy}
      ${limitClause}
    `, [brainId]);

    return result.rows.map(row => new Card(row));
  }

  /**
   * Search cards by title or content preview
   * @param {string} brainId - Brain ID to search within
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Array<Card>>} - Array of matching cards
   */
  static async search(brainId, searchTerm, options = {}) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return [];
    }

    const { activeOnly = true, limit = 50 } = options;
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT * FROM cards 
      WHERE brain_id = $1 ${whereClause}
      AND (
        title ILIKE $2 
        OR content_preview ILIKE $2
      )
      ORDER BY 
        CASE WHEN title ILIKE $2 THEN 1 ELSE 2 END,
        title
      LIMIT $3
    `, [brainId, `%${searchTerm.trim()}%`, limit]);

    return result.rows.map(row => new Card(row));
  }

  /**
   * Get full content of card from file system
   * @returns {Promise<string>} - Card content
   */
  async getContent() {
    if (!this.filePath) {
      return this.contentPreview || '';
    }

    try {
      if (await fs.pathExists(this.filePath)) {
        return await fs.readFile(this.filePath, 'utf8');
      } else {
        console.warn(`⚠️  Card file not found: ${this.filePath}`);
        return this.contentPreview || '';
      }
    } catch (error) {
      console.error(`❌ Error reading card file ${this.filePath}:`, error.message);
      return this.contentPreview || '';
    }
  }

  /**
   * Update card content and optionally save to file system
   * @param {string} content - New card content
   * @param {Object} options - Update options
   * @param {boolean} options.updateFile - Update file system file (default: true)
   * @returns {Promise<void>}
   */
  async updateContent(content, options = {}) {
    const { updateFile = true } = options;

    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }

    const contentPreview = content.substring(0, 500);
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    const fileSize = Buffer.byteLength(content, 'utf8');

    await transaction(async (client) => {
      // Get current file size for storage calculation
      const currentCard = await client.query(
        'SELECT file_size FROM cards WHERE id = $1',
        [this.id]
      );

      if (currentCard.rows.length === 0) {
        throw new Error('Card not found');
      }

      const oldFileSize = currentCard.rows[0].file_size || 0;
      const sizeDifference = fileSize - oldFileSize;

      // Update card in database
      await client.query(`
        UPDATE cards 
        SET content_preview = $1, file_hash = $2, file_size = $3, 
            last_modified = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [contentPreview, fileHash, fileSize, this.id]);

      // Update brain storage usage
      if (sizeDifference !== 0) {
        await client.query(
          'UPDATE brains SET storage_used = storage_used + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [sizeDifference, this.brainId]
        );
      }

      // Update file system if requested and file path exists
      if (updateFile && this.filePath) {
        try {
          await fs.ensureDir(path.dirname(this.filePath));
          await fs.writeFile(this.filePath, content, 'utf8');
        } catch (error) {
          console.error(`❌ Error writing card file ${this.filePath}:`, error.message);
          throw new Error('Failed to update card file');
        }
      }

      // Update instance properties
      this.contentPreview = contentPreview;
      this.fileHash = fileHash;
      this.fileSize = fileSize;
      this.lastModified = new Date();
      this.updatedAt = new Date();
    });

    console.log(`✅ Updated card: ${this.title}`);
  }

  /**
   * Update card metadata (title, file path, etc.)
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async update(updates) {
    const allowedFields = ['title', 'file_path', 'file_hash', 'content_preview', 'file_size', 'card_type', 'is_brain_wide', 'stream_specific_id', 'file_id'];
    const validUpdates = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        validUpdates[key] = value;
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Legacy card type validation (now simplified)
    if (validUpdates.card_type && !['saved', 'file', 'unsaved'].includes(validUpdates.card_type)) {
      throw new Error('Invalid card type. Must be saved, file, or unsaved');
    }

    // Check title uniqueness if title is being updated
    if (validUpdates.title && validUpdates.title !== this.title) {
      const existing = await Card.findByBrainAndTitle(this.brainId, validUpdates.title);
      if (existing && existing.id !== this.id) {
        throw new Error(`Card '${validUpdates.title}' already exists in this brain`);
      }
    }

    const setClause = Object.keys(validUpdates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [this.id, ...Object.values(validUpdates)];

    await query(`
      UPDATE cards 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, values);

    // Update instance properties
    Object.assign(this, validUpdates);
    this.updatedAt = new Date();

    console.log(`✅ Updated card metadata: ${this.title || 'Untitled'}`);
  }

  /**
   * Add title to untitled card (converts to titled/saved)
   * @param {string} title - New title for the card
   * @returns {Promise<void>}
   */
  async addTitle(title) {
    if (this.hasTitle()) {
      throw new Error('Card already has a title');
    }

    if (!title || title.trim().length === 0) {
      throw new Error('Title is required');
    }

    if (title.length > 200) {
      throw new Error('Card title cannot exceed 200 characters');
    }

    // Check title uniqueness
    const existing = await Card.findByBrainAndTitle(this.brainId, title.trim());
    if (existing && existing.id !== this.id) {
      throw new Error(`Card '${title}' already exists in this brain`);
    }

    await transaction(async (client) => {
      // Get brain info for file path
      const brainResult = await client.query(
        'SELECT folder_path FROM brains WHERE id = $1',
        [this.brainId]
      );

      if (brainResult.rows.length === 0) {
        throw new Error('Brain not found');
      }

      const brain = brainResult.rows[0];

      // Update card to saved type
      await client.query(`
        UPDATE cards 
        SET title = $1, card_type = 'saved', is_brain_wide = true, 
            stream_specific_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [title.trim(), this.id]);

      // Create markdown file if content exists
      if (this.contentPreview || await this.getContent()) {
        const content = await this.getContent();
        const sanitizedTitle = title.trim().replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
        const fileName = `${sanitizedTitle}.md`;
        const cardFilePath = path.join(brain.folder_path, 'cards', fileName);
        
        await fs.ensureDir(path.dirname(cardFilePath));
        await fs.writeFile(cardFilePath, content, 'utf8');
        
        // Update card with file path
        await client.query(
          'UPDATE cards SET file_path = $1 WHERE id = $2',
          [cardFilePath, this.id]
        );
        this.filePath = cardFilePath;
      }

      // Update instance properties
      this.title = title.trim();
      this.cardType = 'saved';
      this.isBrainWide = true;
      this.streamSpecificId = null;
      this.updatedAt = new Date();
    });

    console.log(`✅ Added title to card: ${title}`);
  }

  /**
   * Check if card can be added to AI context
   * @returns {boolean}
   */
  canBeInAIContext() {
    // All card types can be used in AI context if they have content
    return this.isActive && (this.contentPreview || this.hasTitle());
  }

  /**
   * Check if card has a title
   * @returns {boolean}
   */
  hasTitle() {
    return !!(this.title && this.title.trim().length > 0);
  }

  /**
   * Check if card appears in brain cards list (has title)
   * @returns {boolean}
   */
  appearsInCardsList() {
    return this.hasTitle();
  }

  /**
   * Get display title for card (with fallback for titleless cards)
   * @returns {string}
   */
  getDisplayTitle() {
    if (this.hasTitle()) {
      return this.title;
    }
    
    if (!this.hasTitle()) {
      return 'Click to add title...';
    }
    
    return 'Untitled';
  }

  /**
   * Get card type display information
   * @returns {Object} - Type info with icon and label
   */
  getTypeInfo() {
    const typeMap = {
      saved: { icon: '💾', label: 'Titled Card', description: 'Appears in cards list' },
      file: { icon: '📄', label: 'File Card', description: 'Linked document or file' },
      unsaved: { icon: '📝', label: 'Untitled Card', description: 'Stream-only content' }
    };

    return typeMap[this.cardType] || typeMap.saved;
  }

  /**
   * Soft delete card (mark as inactive)
   * @param {Object} options - Delete options
   * @param {boolean} options.deleteFile - Delete file from file system (default: false)
   * @returns {Promise<void>}
   */
  async delete(options = {}) {
    const { deleteFile = false } = options;

    await transaction(async (client) => {
      // Mark card as inactive
      await client.query(
        'UPDATE cards SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [this.id]
      );

      // Delete all links involving this card
      await client.query(
        'DELETE FROM card_links WHERE source_card_id = $1 OR target_card_id = $1',
        [this.id]
      );

      // Update brain storage usage
      await client.query(
        'UPDATE brains SET storage_used = storage_used - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [this.fileSize, this.brainId]
      );

      // Optionally delete file from file system
      if (deleteFile && this.filePath) {
        try {
          if (await fs.pathExists(this.filePath)) {
            await fs.remove(this.filePath);
            console.log(`✅ Deleted card file: ${this.filePath}`);
          }
        } catch (error) {
          console.error(`❌ Error deleting card file ${this.filePath}:`, error.message);
        }
      }

      this.isActive = false;
      this.updatedAt = new Date();
    });

    console.log(`✅ Deleted card: ${this.title}`);
  }

  /**
   * Hard delete card (permanently remove from database)
   * @returns {Promise<void>}
   */
  async hardDelete() {
    await transaction(async (client) => {
      // Delete all links involving this card
      await client.query(
        'DELETE FROM card_links WHERE source_card_id = $1 OR target_card_id = $1',
        [this.id]
      );

      // Delete card from database
      await client.query('DELETE FROM cards WHERE id = $1', [this.id]);

      // Update brain storage usage
      await client.query(
        'UPDATE brains SET storage_used = storage_used - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [this.fileSize, this.brainId]
      );

      // Delete file from file system if it exists
      if (this.filePath) {
        try {
          if (await fs.pathExists(this.filePath)) {
            await fs.remove(this.filePath);
            console.log(`✅ Deleted card file: ${this.filePath}`);
          }
        } catch (error) {
          console.error(`❌ Error deleting card file ${this.filePath}:`, error.message);
        }
      }
    });

    console.log(`✅ Hard deleted card: ${this.title}`);
  }

  /**
   * Get cards that link to this card (backlinks)
   * @returns {Promise<Array<Object>>} - Array of cards with link info
   */
  async getBacklinks() {
    const result = await query(`
      SELECT c.*, cl.link_text, cl.position_in_source
      FROM cards c
      JOIN card_links cl ON c.id = cl.source_card_id
      WHERE cl.target_card_id = $1 AND cl.is_valid = true AND c.is_active = true
      ORDER BY c.title
    `, [this.id]);

    return result.rows.map(row => ({
      card: new Card(row),
      linkText: row.link_text,
      position: row.position_in_source
    }));
  }

  /**
   * Get cards that this card links to (forward links)
   * @returns {Promise<Array<Object>>} - Array of cards with link info
   */
  async getForwardLinks() {
    const result = await query(`
      SELECT c.*, cl.link_text, cl.position_in_source
      FROM cards c
      JOIN card_links cl ON c.id = cl.target_card_id
      WHERE cl.source_card_id = $1 AND cl.is_valid = true AND c.is_active = true
      ORDER BY cl.position_in_source
    `, [this.id]);

    return result.rows.map(row => ({
      card: new Card(row),
      linkText: row.link_text,
      position: row.position_in_source
    }));
  }

  /**
   * Check if file system file has been modified since last sync
   * @returns {Promise<boolean>} - True if file has been modified
   */
  async hasFileChanged() {
    if (!this.filePath || !this.fileHash) {
      return false;
    }

    try {
      if (!(await fs.pathExists(this.filePath))) {
        return true; // File was deleted
      }

      const content = await fs.readFile(this.filePath, 'utf8');
      const currentHash = crypto.createHash('sha256').update(content).digest('hex');
      
      return currentHash !== this.fileHash;
    } catch (error) {
      console.error(`❌ Error checking file changes for ${this.filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Sync card with file system (update from file)
   * @returns {Promise<boolean>} - True if card was updated
   */
  async syncWithFile() {
    if (!this.filePath) {
      return false;
    }

    try {
      if (!(await fs.pathExists(this.filePath))) {
        // File was deleted, mark card as inactive
        await this.delete();
        return true;
      }

      const content = await fs.readFile(this.filePath, 'utf8');
      const currentHash = crypto.createHash('sha256').update(content).digest('hex');
      
      if (currentHash !== this.fileHash) {
        await this.updateContent(content, { updateFile: false });
        console.log(`✅ Synced card with file: ${this.title}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error syncing card with file ${this.filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Get card info for API responses
   * @param {boolean} includeContent - Include full content (default: false)
   * @returns {Promise<Object>} - Card data
   */
  async toJSON(includeContent = false) {
    const typeInfo = this.getTypeInfo();
    
    const data = {
      id: this.id,
      brainId: this.brainId,
      title: this.title,
      displayTitle: this.getDisplayTitle(),
      contentPreview: this.contentPreview,
      fileSize: this.fileSize,
      hasFile: !!this.filePath,
      filePath: this.filePath,
      lastModified: this.lastModified,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Card Type System fields
      cardType: this.cardType,
      isBrainWide: this.isBrainWide,
      streamSpecificId: this.streamSpecificId,
      fileId: this.fileId,
      isFileCard: this.cardType === 'file' || !!this.fileId,
      hasTitle: this.hasTitle(),
      appearsInCardsList: this.appearsInCardsList(),
      canBeInAIContext: this.canBeInAIContext(),
      typeInfo: typeInfo
    };

    // If this is a file card, get file type information
    if (this.fileId) {
      try {
        const fileResult = await query(
          'SELECT file_type FROM files WHERE id = $1',
          [this.fileId]
        );
        if (fileResult.rows.length > 0) {
          data.fileType = fileResult.rows[0].file_type;
        }
      } catch (error) {
        console.error('Failed to get file type for card:', error);
      }
    }

    if (includeContent) {
      data.content = await this.getContent();
    }

    return data;
  }

  /**
   * Count total cards in a brain
   * @param {string} brainId - Brain ID
   * @param {boolean} activeOnly - Count only active cards (default: true)
   * @returns {Promise<number>} - Card count
   */
  static async countByBrainId(brainId, activeOnly = true) {
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT COUNT(*) as count 
      FROM cards 
      WHERE brain_id = $1 ${whereClause}
    `, [brainId]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Find cards by type
   * @param {string} brainId - Brain ID
   * @param {string} cardType - Card type to filter by
   * @param {Object} options - Query options
   * @returns {Promise<Array<Card>>} - Array of cards
   */
  static async findByType(brainId, cardType, options = {}) {
    const {
      activeOnly = true,
      limit = null,
      offset = 0,
      orderBy = 'created_at DESC'
    } = options;

    if (!['saved', 'file', 'unsaved'].includes(cardType)) {
      throw new Error('Invalid card type. Must be saved, file, or unsaved');
    }

    const whereClause = activeOnly ? 'AND is_active = true' : '';
    const limitClause = limit ? `LIMIT ${limit} OFFSET ${offset}` : '';
    
    const result = await query(`
      SELECT * FROM cards 
      WHERE brain_id = $1 AND card_type = $2 ${whereClause}
      ORDER BY ${orderBy}
      ${limitClause}
    `, [brainId, cardType]);

    return result.rows.map(row => new Card(row));
  }

  /**
   * Find untitled cards in a specific stream
   * @param {string} streamId - Stream ID
   * @param {Object} options - Query options
   * @returns {Promise<Array<Card>>} - Array of untitled cards in stream
   */
  static async findUntitledInStream(streamId, options = {}) {
    const {
      activeOnly = true,
      orderBy = 'created_at ASC'
    } = options;

    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT * FROM cards 
      WHERE stream_specific_id = $1 AND (title IS NULL OR title = '') ${whereClause}
      ORDER BY ${orderBy}
    `, [streamId]);

    return result.rows.map(row => new Card(row));
  }

  /**
   * Get card type statistics for a brain
   * @param {string} brainId - Brain ID
   * @returns {Promise<Object>} - Statistics object
   */
  static async getTypeStatistics(brainId) {
    const result = await query(`
      SELECT 
        card_type,
        COUNT(*) as count,
        SUM(file_size) as total_size,
        AVG(file_size) as avg_size,
        MAX(updated_at) as last_updated
      FROM cards 
      WHERE brain_id = $1 AND is_active = true
      GROUP BY card_type
      ORDER BY count DESC
    `, [brainId]);

    const stats = {
      total: 0,
      saved: 0,
      file: 0,
      unsaved: 0,
      totalSize: 0
    };

    result.rows.forEach(row => {
      stats.total += parseInt(row.count);
      stats[row.card_type] = parseInt(row.count);
      stats.totalSize += parseInt(row.total_size || 0);
      stats[`${row.card_type}_size`] = parseInt(row.total_size || 0);
      stats[`${row.card_type}_avg_size`] = parseFloat(row.avg_size || 0);
      stats[`${row.card_type}_last_updated`] = row.last_updated;
    });

    return stats;
  }
}

module.exports = Card;