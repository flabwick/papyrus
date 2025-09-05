const { query, transaction } = require('./database');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * Page Model
 * Handles page-related database operations and file system integration
 */

class Page {
  constructor(data) {
    this.id = data.id;
    this.libraryId = data.library_id;
    this.title = data.title;
    this.filePath = data.file_path;
    this.fileHash = data.file_hash;
    this.contentPreview = data.content_preview;
    this.fileSize = data.file_size;
    this.isActive = data.is_active;
    this.lastModified = data.last_modified;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
    // Page Type System properties (legacy - now simplified to titled/untitled)
    this.pageType = data.page_type || 'saved';
    this.isLibraryWide = data.is_library_wide !== undefined ? data.is_library_wide : true;
    this.workspaceSpecificId = data.workspace_specific_id || null;
    this.fileId = data.file_id || null;
  }

  /**
   * Create a new page with optional file system integration
   * @param {string} libraryId - Library ID that owns the page
   * @param {string} title - Page title (optional for unsaved pages)
   * @param {Object} options - Page creation options
   * @param {string} options.content - Page content (markdown)
   * @param {string} options.filePath - Path to source file (optional)
   * @param {string} options.fileHash - File hash for sync (optional)
   * @param {number} options.fileSize - File size in bytes (optional)
   * @param {string} options.streamId - Stream ID for unsaved pages
   * @param {string} options.fileId - File ID for file pages
   * @returns {Promise<Page>} - Created page instance
   */
  static async create(libraryId, title, options = {}) {
    const {
      content = '',
      filePath = null,
      fileHash = null,
      fileSize = 0,
      streamId = null,
      fileId = null
    } = options;
    
    let pageType = options.pageType || null; // Use let for reassignment

    // Determine page type based on title and context
    if (!pageType) {
      if (fileId) {
        pageType = 'file';
      } else if (title && title.trim().length > 0) {
        pageType = 'saved'; // Titled pages are saved
      } else {
        pageType = 'unsaved'; // Untitled pages are unsaved
      }
    }

    // Normalize empty strings to null for untitled pages
    if (title && title.trim().length === 0) {
      title = null;
    }

    // Validate stream requirements for untitled pages
    if (!title && !streamId) {
      throw new Error('Stream ID is required for untitled pages');
    }

    // Validate file page requirements
    if (pageType === 'file' && !fileId) {
      throw new Error('File ID is required for file pages');
    }

    if (title && title.length > 200) {
      throw new Error('Page title cannot exceed 200 characters');
    }

    return await transaction(async (client) => {
      // Verify library exists and get library info
      const libraryResult = await client.query(
        'SELECT id, folder_path, user_id FROM libraries WHERE id = $1',
        [libraryId]
      );

      if (libraryResult.rows.length === 0) {
        throw new Error('Library not found');
      }

      const library = libraryResult.rows[0];

      // Check if page title already exists in this library (only for titled pages)
      if (title && title.trim()) {
        const existingPage = await client.query(
          'SELECT id FROM pages WHERE library_id = $1 AND title = $2 AND is_active = true',
          [libraryId, title.trim()]
        );

        if (existingPage.rows.length > 0) {
          throw new Error(`Page '${title}' already exists in this library`);
        }
      }

      // Validate workspace exists for untitled pages
      if (!title) {
        const workspaceResult = await client.query(
          'SELECT id FROM workspaces WHERE id = $1 AND library_id = $2',
          [streamId, libraryId]
        );
        
        if (workspaceResult.rows.length === 0) {
          throw new Error('Workspace not found or does not belong to this library');
        }
      }

      // Generate content preview (use full content, no 500 char limit)
      const contentPreview = content;

      // Calculate file hash if content provided
      let calculatedHash = fileHash;
      if (content && !fileHash) {
        calculatedHash = crypto.createHash('sha256').update(content).digest('hex');
      }

      // Set page type specific properties
      const isLibraryWide = !!title; // Titled pages are library-wide
      const workspaceSpecificId = !title ? streamId : null; // Untitled pages are workspace-specific
      const titleToStore = title ? title.trim() : null;

      // Insert page into database
      const result = await client.query(`
        INSERT INTO pages (
          library_id, title, file_path, file_hash, content_preview, file_size, is_active, 
          last_modified, page_type, is_library_wide, workspace_specific_id, file_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, $9, $10, $11)
        RETURNING *
      `, [
        libraryId, titleToStore, filePath, calculatedHash, contentPreview, fileSize, true,
        pageType, isLibraryWide, workspaceSpecificId, fileId
      ]);

      const page = new Page(result.rows[0]);

      // If content provided and no file path, save as markdown file (only for titled pages)
      if (content && !filePath && titleToStore) {
        const sanitizedTitle = titleToStore.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
        const fileName = `${sanitizedTitle}.md`;
        const pageFilePath = path.join(library.folder_path, 'pages', fileName);
        
        await fs.ensureDir(path.dirname(pageFilePath));
        await fs.writeFile(pageFilePath, content, 'utf8');
        
        // Update page with file path
        await client.query(
          'UPDATE pages SET file_path = $1 WHERE id = $2',
          [pageFilePath, page.id]
        );
        page.filePath = pageFilePath;
      }

      // Update library storage usage
      await client.query(
        'UPDATE libraries SET storage_used = storage_used + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [fileSize, libraryId]
      );

      console.log(`✅ Created page: ${title} in library ${libraryId}`);
      return page;
    });
  }

  /**
   * Find page by ID
   * @param {string} pageId - Page ID to find
   * @returns {Promise<Page|null>} - Page instance or null
   */
  static async findById(pageId) {
    const result = await query(
      'SELECT * FROM pages WHERE id = $1',
      [pageId]
    );

    return result.rows.length > 0 ? new Page(result.rows[0]) : null;
  }

  /**
   * Find page by library and title
   * @param {string} libraryId - Library ID
   * @param {string} title - Page title
   * @param {boolean} activeOnly - Only return active pages (default: true)
   * @returns {Promise<Page|null>} - Page instance or null
   */
  static async findByLibraryAndTitle(libraryId, title, activeOnly = true) {
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT * FROM pages 
      WHERE library_id = $1 AND title = $2 ${whereClause}
    `, [libraryId, title]);

    return result.rows.length > 0 ? new Page(result.rows[0]) : null;
  }

  /**
   * Find page by file path
   * @param {string} filePath - File path to find
   * @returns {Promise<Page|null>} - Page instance or null
   */
  static async findByFilePath(filePath) {
    const result = await query(
      'SELECT * FROM pages WHERE file_path = $1 AND is_active = true',
      [filePath]
    );

    return result.rows.length > 0 ? new Page(result.rows[0]) : null;
  }

  /**
   * Get all pages in a library
   * @param {string} libraryId - Library ID
   * @param {Object} options - Query options
   * @param {boolean} options.activeOnly - Only return active pages (default: true)
   * @param {number} options.limit - Limit number of results
   * @param {number} options.offset - Offset for pagination
   * @param {string} options.orderBy - Order by field (default: 'title')
   * @returns {Promise<Array<Page>>} - Array of page instances
   */
  static async findByLibraryId(libraryId, options = {}) {
    const {
      activeOnly = true,
      limit = null,
      offset = 0,
      orderBy = 'title'
    } = options;

    const whereClause = activeOnly ? 'AND is_active = true' : '';
    const limitClause = limit ? `LIMIT ${limit} OFFSET ${offset}` : '';
    
    const result = await query(`
      SELECT * FROM pages 
      WHERE library_id = $1 ${whereClause}
      ORDER BY ${orderBy}
      ${limitClause}
    `, [libraryId]);

    return result.rows.map(row => new Page(row));
  }

  /**
   * Search pages by title or content preview
   * @param {string} libraryId - Library ID to search within
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Array<Page>>} - Array of matching pages
   */
  static async search(libraryId, searchTerm, options = {}) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return [];
    }

    const { activeOnly = true, limit = 50 } = options;
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT * FROM pages 
      WHERE library_id = $1 ${whereClause}
      AND (
        title ILIKE $2 
        OR content_preview ILIKE $2
      )
      ORDER BY 
        CASE WHEN title ILIKE $2 THEN 1 ELSE 2 END,
        title
      LIMIT $3
    `, [libraryId, `%${searchTerm.trim()}%`, limit]);

    return result.rows.map(row => new Page(row));
  }

  /**
   * Get full content of page from file system
   * @returns {Promise<string>} - Page content
   */
  async getContent() {
    if (!this.filePath) {
      return this.contentPreview || '';
    }

    try {
      if (await fs.pathExists(this.filePath)) {
        return await fs.readFile(this.filePath, 'utf8');
      } else {
        console.warn(`⚠️  Page file not found: ${this.filePath}`);
        return this.contentPreview || '';
      }
    } catch (error) {
      console.error(`❌ Error reading page file ${this.filePath}:`, error.message);
      return this.contentPreview || '';
    }
  }

  /**
   * Update page content and optionally save to file system
   * @param {string} content - New page content
   * @param {Object} options - Update options
   * @param {boolean} options.updateFile - Update file system file (default: true)
   * @returns {Promise<void>}
   */
  async updateContent(content, options = {}) {
    const { updateFile = true } = options;

    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }

    const contentPreview = content; // Use full content, no 500 char limit
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    const fileSize = Buffer.byteLength(content, 'utf8');

    await transaction(async (client) => {
      // Get current file size for storage calculation
      const currentPage = await client.query(
        'SELECT file_size FROM pages WHERE id = $1',
        [this.id]
      );

      if (currentPage.rows.length === 0) {
        throw new Error('Page not found');
      }

      const oldFileSize = currentPage.rows[0].file_size || 0;
      const sizeDifference = fileSize - oldFileSize;

      // Update page in database
      await client.query(`
        UPDATE pages 
        SET content_preview = $1, file_hash = $2, file_size = $3, 
            last_modified = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [contentPreview, fileHash, fileSize, this.id]);

      // Update library storage usage
      if (sizeDifference !== 0) {
        await client.query(
          'UPDATE libraries SET storage_used = storage_used + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [sizeDifference, this.libraryId]
        );
      }

      // Update file system if requested and file path exists
      if (updateFile && this.filePath) {
        try {
          await fs.ensureDir(path.dirname(this.filePath));
          await fs.writeFile(this.filePath, content, 'utf8');
        } catch (error) {
          console.error(`❌ Error writing page file ${this.filePath}:`, error.message);
          throw new Error('Failed to update page file');
        }
      }

      // Update instance properties
      this.contentPreview = contentPreview;
      this.fileHash = fileHash;
      this.fileSize = fileSize;
      this.lastModified = new Date();
      this.updatedAt = new Date();
    });

    console.log(`✅ Updated page: ${this.title}`);
  }

  /**
   * Update page metadata (title, file path, etc.)
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async update(updates) {
    const allowedFields = ['title', 'file_path', 'file_hash', 'content_preview', 'file_size', 'page_type', 'is_library_wide', 'workspace_specific_id', 'file_id'];
    const validUpdates = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        validUpdates[key] = value;
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Legacy page type validation (now simplified)
    if (validUpdates.page_type && !['saved', 'file', 'unsaved'].includes(validUpdates.page_type)) {
      throw new Error('Invalid page type. Must be saved, file, or unsaved');
    }

    // Check title uniqueness if title is being updated
    if (validUpdates.title && validUpdates.title !== this.title) {
      const existing = await Page.findByLibraryAndTitle(this.libraryId, validUpdates.title);
      if (existing && existing.id !== this.id) {
        throw new Error(`Page '${validUpdates.title}' already exists in this library`);
      }
    }

    const setClause = Object.keys(validUpdates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [this.id, ...Object.values(validUpdates)];

    await query(`
      UPDATE pages 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, values);

    // Update instance properties
    Object.assign(this, validUpdates);
    this.updatedAt = new Date();

    console.log(`✅ Updated page metadata: ${this.title || 'Untitled'}`);
  }

  /**
   * Add title to untitled page (converts to titled/saved)
   * @param {string} title - New title for the page
   * @returns {Promise<void>}
   */
  async addTitle(title) {
    if (this.hasTitle()) {
      throw new Error('Page already has a title');
    }

    if (!title || title.trim().length === 0) {
      throw new Error('Title is required');
    }

    if (title.length > 200) {
      throw new Error('Page title cannot exceed 200 characters');
    }

    // Check title uniqueness
    const existing = await Page.findByLibraryAndTitle(this.libraryId, title.trim());
    if (existing && existing.id !== this.id) {
      throw new Error(`Page '${title}' already exists in this library`);
    }

    await transaction(async (client) => {
      // Get library info for file path
      const libraryResult = await client.query(
        'SELECT folder_path FROM libraries WHERE id = $1',
        [this.libraryId]
      );

      if (libraryResult.rows.length === 0) {
        throw new Error('Library not found');
      }

      const library = libraryResult.rows[0];

      // Update page to saved type
      await client.query(`
        UPDATE pages 
        SET title = $1, page_type = 'saved', is_library_wide = true, 
            workspace_specific_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [title.trim(), this.id]);

      // Create markdown file if content exists
      if (this.contentPreview || await this.getContent()) {
        const content = await this.getContent();
        const sanitizedTitle = title.trim().replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
        const fileName = `${sanitizedTitle}.md`;
        const pageFilePath = path.join(library.folder_path, 'pages', fileName);
        
        await fs.ensureDir(path.dirname(pageFilePath));
        await fs.writeFile(pageFilePath, content, 'utf8');
        
        // Update page with file path
        await client.query(
          'UPDATE pages SET file_path = $1 WHERE id = $2',
          [pageFilePath, this.id]
        );
        this.filePath = pageFilePath;
      }

      // Update instance properties
      this.title = title.trim();
      this.pageType = 'saved';
      this.isLibraryWide = true;
      this.streamSpecificId = null;
      this.updatedAt = new Date();
    });

    console.log(`✅ Added title to page: ${title}`);
  }

  /**
   * Check if page can be added to AI context
   * @returns {boolean}
   */
  canBeInAIContext() {
    // All page types can be used in AI context if they have content
    return this.isActive && (this.contentPreview || this.hasTitle());
  }

  /**
   * Check if page has a title
   * @returns {boolean}
   */
  hasTitle() {
    return !!(this.title && this.title.trim().length > 0);
  }

  /**
   * Check if page appears in library pages list (has title)
   * @returns {boolean}
   */
  appearsInPagesList() {
    return this.hasTitle();
  }

  /**
   * Get display title for page (with fallback for titleless pages)
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
   * Get page type display information
   * @returns {Object} - Type info with icon and label
   */
  getTypeInfo() {
    const typeMap = {
      saved: { icon: '💾', label: 'Titled Page', description: 'Appears in pages list' },
      file: { icon: '📄', label: 'File Page', description: 'Linked document or file' },
      unsaved: { icon: '📝', label: 'Untitled Page', description: 'Stream-only content' }
    };

    return typeMap[this.pageType] || typeMap.saved;
  }

  /**
   * Soft delete page (mark as inactive)
   * @param {Object} options - Delete options
   * @param {boolean} options.deleteFile - Delete file from file system (default: false)
   * @returns {Promise<void>}
   */
  async delete(options = {}) {
    const { deleteFile = false } = options;

    await transaction(async (client) => {
      // Mark page as inactive
      await client.query(
        'UPDATE pages SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [this.id]
      );

      // Delete all links involving this page
      await client.query(
        'DELETE FROM page_links WHERE source_page_id = $1 OR target_page_id = $1',
        [this.id]
      );

      // Update library storage usage
      await client.query(
        'UPDATE libraries SET storage_used = storage_used - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [this.fileSize, this.libraryId]
      );

      // Optionally delete file from file system
      if (deleteFile && this.filePath) {
        try {
          if (await fs.pathExists(this.filePath)) {
            await fs.remove(this.filePath);
            console.log(`✅ Deleted page file: ${this.filePath}`);
          }
        } catch (error) {
          console.error(`❌ Error deleting page file ${this.filePath}:`, error.message);
        }
      }

      this.isActive = false;
      this.updatedAt = new Date();
    });

    console.log(`✅ Deleted page: ${this.title}`);
  }

  /**
   * Hard delete page (permanently remove from database)
   * @returns {Promise<void>}
   */
  async hardDelete() {
    await transaction(async (client) => {
      // Delete all links involving this page
      await client.query(
        'DELETE FROM page_links WHERE source_page_id = $1 OR target_page_id = $1',
        [this.id]
      );

      // Delete page from database
      await client.query('DELETE FROM pages WHERE id = $1', [this.id]);

      // Update library storage usage
      await client.query(
        'UPDATE libraries SET storage_used = storage_used - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [this.fileSize, this.libraryId]
      );

      // Delete file from file system if it exists
      if (this.filePath) {
        try {
          if (await fs.pathExists(this.filePath)) {
            await fs.remove(this.filePath);
            console.log(`✅ Deleted page file: ${this.filePath}`);
          }
        } catch (error) {
          console.error(`❌ Error deleting page file ${this.filePath}:`, error.message);
        }
      }
    });

    console.log(`✅ Hard deleted page: ${this.title}`);
  }

  /**
   * Get pages that link to this page (backlinks)
   * @returns {Promise<Array<Object>>} - Array of pages with link info
   */
  async getBacklinks() {
    const result = await query(`
      SELECT p.*, pl.link_text, pl.position_in_source
      FROM pages p
      JOIN page_links pl ON p.id = pl.source_page_id
      WHERE pl.target_page_id = $1 AND pl.is_valid = true AND p.is_active = true
      ORDER BY p.title
    `, [this.id]);

    return result.rows.map(row => ({
      page: new Page(row),
      linkText: row.link_text,
      position: row.position_in_source
    }));
  }

  /**
   * Get pages that this page links to (forward links)
   * @returns {Promise<Array<Object>>} - Array of pages with link info
   */
  async getForwardLinks() {
    const result = await query(`
      SELECT p.*, pl.link_text, pl.position_in_source
      FROM pages p
      JOIN page_links pl ON p.id = pl.target_page_id
      WHERE pl.source_page_id = $1 AND pl.is_valid = true AND p.is_active = true
      ORDER BY pl.position_in_source
    `, [this.id]);

    return result.rows.map(row => ({
      page: new Page(row),
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
        console.log(`✅ Synced page with file: ${this.title}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error syncing page with file ${this.filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Get page info for API responses
   * @param {boolean} includeContent - Include full content (default: false)
   * @returns {Promise<Object>} - Page data
   */
  async toJSON(includeContent = false) {
    const typeInfo = this.getTypeInfo();
    
    const data = {
      id: this.id,
      libraryId: this.libraryId,
      title: this.title,
      displayTitle: this.getDisplayTitle(),
      contentPreview: this.contentPreview,
      fileSize: this.fileSize,
      hasFile: !!this.filePath,
      filePath: this.filePath,
      lastModified: this.lastModified,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Page Type System fields
      pageType: this.pageType,
      isLibraryWide: this.isLibraryWide,
      streamSpecificId: this.streamSpecificId,
      fileId: this.fileId,
      isFilePage: this.pageType === 'file' || !!this.fileId,
      hasTitle: this.hasTitle(),
      appearsInPagesList: this.appearsInPagesList(),
      canBeInAIContext: this.canBeInAIContext(),
      typeInfo: typeInfo
    };

    // If this is a file page, get file type information
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
        console.error('Failed to get file type for page:', error);
      }
    }

    if (includeContent) {
      data.content = await this.getContent();
    }

    return data;
  }

  /**
   * Count total pages in a library
   * @param {string} libraryId - Library ID
   * @param {boolean} activeOnly - Count only active pages (default: true)
   * @returns {Promise<number>} - Page count
   */
  static async countByLibraryId(libraryId, activeOnly = true) {
    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT COUNT(*) as count 
      FROM pages 
      WHERE library_id = $1 ${whereClause}
    `, [libraryId]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Find pages by type
   * @param {string} libraryId - Library ID
   * @param {string} pageType - Page type to filter by
   * @param {Object} options - Query options
   * @returns {Promise<Array<Page>>} - Array of pages
   */
  static async findByType(libraryId, pageType, options = {}) {
    const {
      activeOnly = true,
      limit = null,
      offset = 0,
      orderBy = 'created_at DESC'
    } = options;

    if (!['saved', 'file', 'unsaved'].includes(pageType)) {
      throw new Error('Invalid page type. Must be saved, file, or unsaved');
    }

    const whereClause = activeOnly ? 'AND is_active = true' : '';
    const limitClause = limit ? `LIMIT ${limit} OFFSET ${offset}` : '';
    
    const result = await query(`
      SELECT * FROM pages 
      WHERE library_id = $1 AND page_type = $2 ${whereClause}
      ORDER BY ${orderBy}
      ${limitClause}
    `, [libraryId, pageType]);

    return result.rows.map(row => new Page(row));
  }

  /**
   * Find untitled pages in a specific stream
   * @param {string} streamId - Stream ID
   * @param {Object} options - Query options
   * @returns {Promise<Array<Page>>} - Array of untitled pages in stream
   */
  static async findUntitledInStream(streamId, options = {}) {
    const {
      activeOnly = true,
      orderBy = 'created_at ASC'
    } = options;

    const whereClause = activeOnly ? 'AND is_active = true' : '';
    
    const result = await query(`
      SELECT * FROM pages 
      WHERE workspace_specific_id = $1 AND (title IS NULL OR title = '') ${whereClause}
      ORDER BY ${orderBy}
    `, [streamId]);

    return result.rows.map(row => new Page(row));
  }

  /**
   * Get page type statistics for a library
   * @param {string} libraryId - Library ID
   * @returns {Promise<Object>} - Statistics object
   */
  static async getTypeStatistics(libraryId) {
    const result = await query(`
      SELECT 
        page_type,
        COUNT(*) as count,
        SUM(file_size) as total_size,
        AVG(file_size) as avg_size,
        MAX(updated_at) as last_updated
      FROM pages 
      WHERE library_id = $1 AND is_active = true
      GROUP BY page_type
      ORDER BY count DESC
    `, [libraryId]);

    const stats = {
      total: 0,
      saved: 0,
      file: 0,
      unsaved: 0,
      totalSize: 0
    };

    result.rows.forEach(row => {
      stats.total += parseInt(row.count);
      stats[row.page_type] = parseInt(row.count);
      stats.totalSize += parseInt(row.total_size || 0);
      stats[`${row.page_type}_size`] = parseInt(row.total_size || 0);
      stats[`${row.page_type}_avg_size`] = parseFloat(row.avg_size || 0);
      stats[`${row.page_type}_last_updated`] = row.last_updated;
    });

    return stats;
  }
}

module.exports = Page;