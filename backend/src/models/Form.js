const { query, transaction } = require('./database');

/**
 * Form Model
 * Handles form-related database operations and business logic
 * Forms are workspace-specific cards that can be added to AI context
 */

class Form {
  constructor(data) {
    this.id = data.id;
    this.libraryId = data.library_id;
    this.title = data.title;
    this.content = data.content;
    this.formData = data.form_data;
    this.isActive = data.is_active;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  /**
   * Create a new form
   * @param {string} libraryId - Library ID that owns the form
   * @param {string} title - Form title (default: 'Untitled Form')
   * @param {string} content - Form content (default: '')
   * @param {Object} formData - Form data as JSON (default: {})
   * @returns {Promise<Form>} - Created form instance
   */
  static async create(libraryId, title = 'Untitled Form', content = '', formData = {}) {
    if (!libraryId) {
      throw new Error('Library ID is required');
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

      // Insert form into database
      const result = await client.query(`
        INSERT INTO forms (library_id, title, content, form_data)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [libraryId, title, content, JSON.stringify(formData)]);

      const form = new Form(result.rows[0]);
      console.log(`✅ Created form: ${title} in library ${libraryId}`);
      return form;
    });
  }

  /**
   * Find form by ID
   * @param {string} formId - Form ID to find
   * @returns {Promise<Form|null>} - Form instance or null
   */
  static async findById(formId) {
    const result = await query(
      'SELECT * FROM forms WHERE id = $1 AND is_active = true',
      [formId]
    );

    return result.rows.length > 0 ? new Form(result.rows[0]) : null;
  }

  /**
   * Find all forms in a library
   * @param {string} libraryId - Library ID
   * @param {Object} options - Query options
   * @returns {Promise<Array<Form>>} - Array of form instances
   */
  static async findByLibraryId(libraryId, options = {}) {
    const { orderBy = 'created_at DESC', limit = null } = options;
    
    let queryText = `
      SELECT * FROM forms 
      WHERE library_id = $1 AND is_active = true
      ORDER BY ${orderBy}
    `;
    
    if (limit) {
      queryText += ` LIMIT ${parseInt(limit)}`;
    }

    const result = await query(queryText, [libraryId]);
    return result.rows.map(row => new Form(row));
  }

  /**
   * Update form content and metadata
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async update(updates) {
    const allowedFields = ['title', 'content', 'form_data'];
    const validUpdates = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'form_data') {
          validUpdates[key] = JSON.stringify(value);
        } else {
          validUpdates[key] = value;
        }
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = Object.keys(validUpdates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [this.id, ...Object.values(validUpdates)];

    await query(`
      UPDATE forms 
      SET ${setClause}
      WHERE id = $1
    `, values);

    // Update instance properties
    Object.assign(this, updates);
    this.updatedAt = new Date();

    console.log(`✅ Updated form: ${this.title}`);
  }

  /**
   * Soft delete form (mark as inactive)
   * @returns {Promise<void>}
   */
  async delete() {
    await transaction(async (client) => {
      // Remove from all workspaces first
      await client.query('DELETE FROM workspace_forms WHERE form_id = $1', [this.id]);
      
      // Soft delete the form
      await client.query(
        'UPDATE forms SET is_active = false WHERE id = $1',
        [this.id]
      );
      
      this.isActive = false;
      console.log(`✅ Deleted form: ${this.title}`);
    });
  }

  /**
   * Get all workspaces that contain this form
   * @returns {Promise<Array<Object>>} - Array of workspaces with position info
   */
  async getWorkspaces() {
    const result = await query(`
      SELECT w.*, wf.position, wf.depth, wf.is_in_ai_context, wf.is_collapsed, wf.added_at
      FROM workspaces w
      JOIN workspace_forms wf ON w.id = wf.workspace_id
      WHERE wf.form_id = $1
      ORDER BY w.name
    `, [this.id]);

    return result.rows.map(row => ({
      id: row.id,
      libraryId: row.library_id,
      name: row.name,
      isFavorited: row.is_favorited,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      // Form position in this workspace
      position: row.position,
      depth: row.depth,
      isInAIContext: row.is_in_ai_context,
      isCollapsed: row.is_collapsed,
      addedAt: row.added_at
    }));
  }

  /**
   * Get form info for API responses
   * @param {boolean} includeContent - Include full content (default: false)
   * @returns {Promise<Object>} - Form data
   */
  async toJSON(includeContent = false) {
    const data = {
      id: this.id,
      libraryId: this.libraryId,
      title: this.title,
      formData: this.formData,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Mark as form for frontend
      itemType: 'form'
    };

    if (includeContent) {
      data.content = this.content;
    } else {
      // Provide content preview (first 200 characters)
      data.contentPreview = this.content ? 
        (this.content.length > 200 ? this.content.substring(0, 200) + '...' : this.content) : 
        '';
    }

    return data;
  }

  /**
   * Search forms by title or content
   * @param {string} libraryId - Library ID to search within
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Array<Form>>} - Array of matching forms
   */
  static async search(libraryId, searchTerm, options = {}) {
    const { limit = 50 } = options;
    
    const result = await query(`
      SELECT * FROM forms 
      WHERE library_id = $1 AND is_active = true
      AND (
        title ILIKE $2 OR 
        content ILIKE $2
      )
      ORDER BY 
        CASE WHEN title ILIKE $2 THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT $3
    `, [libraryId, `%${searchTerm}%`, limit]);

    return result.rows.map(row => new Form(row));
  }

  /**
   * Get form statistics for a library
   * @param {string} libraryId - Library ID
   * @returns {Promise<Object>} - Form statistics
   */
  static async getLibraryStats(libraryId) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_forms,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as recent_forms,
        COUNT(DISTINCT wf.workspace_id) as workspaces_with_forms
      FROM forms f
      LEFT JOIN workspace_forms wf ON f.id = wf.form_id
      WHERE f.library_id = $1 AND f.is_active = true
    `, [libraryId]);

    const stats = result.rows[0];
    return {
      totalForms: parseInt(stats.total_forms),
      recentForms: parseInt(stats.recent_forms),
      workspacesWithForms: parseInt(stats.workspaces_with_forms)
    };
  }
}

module.exports = Form;
