const { query, transaction } = require('./database');

/**
 * Workspace Model
 * Handles workspace-related database operations and business logic
 */

class Workspace {
  constructor(data) {
    this.id = data.id;
    this.libraryId = data.library_id;
    this.name = data.name;
    this.isFavorited = data.is_favorited;
    this.createdAt = data.created_at;
    this.lastAccessedAt = data.last_accessed_at;
  }

  /**
   * Create a new workspace
   * @param {string} libraryId - Library ID that owns the workspace
   * @param {string} name - Workspace name (must be unique within library)
   * @param {boolean} isWelcomeWorkspace - Whether this is a welcome workspace with tutorial content
   * @returns {Promise<Workspace>} - Created workspace instance
   */
  static async create(libraryId, name, isWelcomeWorkspace = false) {
    if (!name || name.trim().length === 0) {
      throw new Error('Workspace name is required');
    }

    if (name.length > 100) {
      throw new Error('Workspace name cannot exceed 100 characters');
    }

    return await transaction(async (client) => {
      // Verify library exists
      const libraryResult = await client.query(
        'SELECT id FROM libraries WHERE id = $1',
        [libraryId]
      );

      if (libraryResult.rows.length === 0) {
        throw new Error('Library not found');
      }

      // Check if workspace name already exists in this library
      const existingWorkspace = await client.query(
        'SELECT id FROM workspaces WHERE library_id = $1 AND name = $2',
        [libraryId, name.trim()]
      );

      if (existingWorkspace.rows.length > 0) {
        throw new Error(`Workspace '${name}' already exists in this library`);
      }

      // Insert workspace into database
      const result = await client.query(`
        INSERT INTO workspaces (library_id, name, is_favorited)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [libraryId, name.trim(), isWelcomeWorkspace]);

      const workspace = new Workspace(result.rows[0]);

      // If this is a welcome workspace, create tutorial content
      if (isWelcomeWorkspace) {
        const welcomeContent = require('../services/welcomeContent');
        await welcomeContent.createWelcomeCards(libraryId, workspace.id);
      }

      console.log(`✅ Created workspace: ${name} in library ${libraryId}`);
      return workspace;
    });
  }

  /**
   * Find workspace by ID
   * @param {string} workspaceId - Workspace ID to find
   * @returns {Promise<Workspace|null>} - Workspace instance or null
   */
  static async findById(workspaceId) {
    const result = await query(
      'SELECT * FROM workspaces WHERE id = $1',
      [workspaceId]
    );

    return result.rows.length > 0 ? new Workspace(result.rows[0]) : null;
  }

  /**
   * Find workspace by library and name
   * @param {string} libraryId - Library ID
   * @param {string} name - Workspace name
   * @returns {Promise<Workspace|null>} - Workspace instance or null
   */
  static async findByLibraryAndName(libraryId, name) {
    const result = await query(
      'SELECT * FROM workspaces WHERE library_id = $1 AND name = $2',
      [libraryId, name]
    );

    return result.rows.length > 0 ? new Workspace(result.rows[0]) : null;
  }

  /**
   * Get all workspaces for a library with automatic cleanup
   * @param {string} libraryId - Library ID
   * @param {Object} options - Query options
   * @returns {Promise<Array<Workspace>>} - Array of workspace instances
   */
  static async findByLibraryId(libraryId, options = {}) {
    // First, cleanup expired unfavorited workspaces
    await Workspace.cleanupExpired();

    const { orderBy = 'name' } = options;
    
    const result = await query(`
      SELECT * FROM workspaces 
      WHERE library_id = $1
      ORDER BY ${orderBy}
    `, [libraryId]);

    return result.rows.map(row => new Workspace(row));
  }

  /**
   * Clean up expired unfavorited workspaces (older than 30 days)
   * @returns {Promise<number>} - Number of workspaces deleted
   */
  static async cleanupExpired() {
    try {
      const result = await query(`
        DELETE FROM workspaces 
        WHERE is_favorited = false 
        AND last_accessed_at < NOW() - INTERVAL '30 days'
        RETURNING id, name
      `);

      if (result.rows.length > 0) {
        console.log(`✅ Cleaned up ${result.rows.length} expired workspaces`);
      }

      return result.rows.length;
    } catch (error) {
      console.error('❌ Error cleaning up expired workspaces:', error.message);
      return 0;
    }
  }

  /**
   * Update last accessed timestamp
   * @returns {Promise<void>}
   */
  async updateLastAccessed() {
    await query(
      'UPDATE workspaces SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = $1',
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
      'UPDATE workspaces SET is_favorited = NOT is_favorited WHERE id = $1 RETURNING is_favorited',
      [this.id]
    );

    this.isFavorited = result.rows[0].is_favorited;
    console.log(`✅ Workspace '${this.name}' favorite status: ${this.isFavorited}`);
  }

  /**
   * Update workspace metadata
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
      const existing = await Workspace.findByLibraryAndName(this.libraryId, validUpdates.name);
      if (existing && existing.id !== this.id) {
        throw new Error(`Workspace '${validUpdates.name}' already exists in this library`);
      }
    }

    const setClause = Object.keys(validUpdates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [this.id, ...Object.values(validUpdates)];

    await query(`
      UPDATE workspaces 
      SET ${setClause}
      WHERE id = $1
    `, values);

    // Update instance properties
    Object.assign(this, validUpdates);

    console.log(`✅ Updated workspace: ${this.name}`);
  }

  /**
   * Get all pages in this workspace with proper ordering
   * @returns {Promise<Array<Object>>} - Array of pages with workspace metadata
   */
  async getPages() {
    const result = await query(`
      SELECT p.*, wp.position, wp.depth, wp.is_in_ai_context, wp.is_collapsed, wp.added_at
      FROM pages p
      JOIN workspace_pages wp ON p.id = wp.page_id
      WHERE wp.workspace_id = $1 AND p.is_active = true
      ORDER BY wp.position
    `, [this.id]);

    return result.rows.map(row => ({
      id: row.id,
      libraryId: row.library_id,
      title: row.title,
      contentPreview: row.content_preview,
      fileSize: row.file_size,
      hasFile: !!row.file_path,
      filePath: row.file_path,
      lastModified: row.last_modified,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Workspace-specific metadata
      position: row.position,
      depth: row.depth,
      isInAIContext: row.is_in_ai_context,
      isCollapsed: row.is_collapsed,
      addedAt: row.added_at,
      // Frontend compatibility - mark all items as cards (pages)
      itemType: 'card'
    }));
  }

  /**
   * Get page count for this workspace
   * @returns {Promise<number>} - Page count
   */
  async getPageCount() {
    const result = await query(`
      SELECT COUNT(*) as count 
      FROM workspace_pages wp
      JOIN pages p ON wp.page_id = p.id
      WHERE wp.workspace_id = $1 AND p.is_active = true
    `, [this.id]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Get pages in AI context for this workspace
   * @returns {Promise<Array<Object>>} - Array of pages in AI context
   */
  async getAIContextPages() {
    const result = await query(`
      SELECT p.*, wp.position, wp.depth
      FROM pages p
      JOIN workspace_pages wp ON p.id = wp.page_id
      WHERE wp.workspace_id = $1 AND wp.is_in_ai_context = true AND p.is_active = true
      ORDER BY wp.position
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
   * Delete workspace and all its relationships
   * @returns {Promise<void>}
   */
  async delete() {
    await transaction(async (client) => {
      // First, delete any workspace-specific (unsaved) pages that belong only to this workspace
      await client.query('DELETE FROM pages WHERE workspace_specific_id = $1', [this.id]);
      
      // Delete workspace_pages relationships
      await client.query('DELETE FROM workspace_pages WHERE workspace_id = $1', [this.id]);
      
      // Delete workspace_files relationships
      await client.query('DELETE FROM workspace_files WHERE workspace_id = $1', [this.id]);
      
      // Finally, delete the workspace itself
      await client.query('DELETE FROM workspaces WHERE id = $1', [this.id]);
      
      console.log(`✅ Deleted workspace: ${this.name} and all associated data`);
    });
  }

  /**
   * Duplicate workspace with all pages and their states
   * @param {string} newName - Name for the duplicated workspace
   * @returns {Promise<Workspace>} - New workspace instance
   */
  async duplicate(newName) {
    return await transaction(async (client) => {
      // Create new workspace
      const workspaceResult = await client.query(`
        INSERT INTO workspaces (library_id, name, is_favorited)
        VALUES ($1, $2, false)
        RETURNING *
      `, [this.libraryId, newName]);

      const newWorkspace = new Workspace(workspaceResult.rows[0]);

      // Copy all workspace_pages relationships
      await client.query(`
        INSERT INTO workspace_pages (workspace_id, page_id, position, depth, is_in_ai_context, is_collapsed)
        SELECT $1, page_id, position, depth, is_in_ai_context, is_collapsed
        FROM workspace_pages
        WHERE workspace_id = $2
        ORDER BY position
      `, [newWorkspace.id, this.id]);

      console.log(`✅ Duplicated workspace '${this.name}' as '${newName}'`);
      return newWorkspace;
    });
  }

  /**
   * Get workspace info for API responses
   * @param {boolean} includePages - Include page information (default: false)
   * @returns {Promise<Object>} - Workspace data
   */
  async toJSON(includePages = false) {
    const pageCount = await this.getPageCount();
    const aiContextCount = (await this.getAIContextPages()).length;
    
    const data = {
      id: this.id,
      libraryId: this.libraryId,
      name: this.name,
      isFavorited: this.isFavorited,
      pageCount,
      aiContextCount,
      createdAt: this.createdAt,
      lastAccessedAt: this.lastAccessedAt
    };

    if (includePages) {
      data.pages = await this.getPages();
    }

    return data;
  }
}

module.exports = Workspace;