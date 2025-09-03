const Page = require('../models/Page');
const { query, transaction } = require('../models/database');

/**
 * PageFactory - Centralized page creation with type-specific logic
 * Provides standardized methods for creating different types of pages
 */
class PageFactory {
  /**
   * Create a titled page (appears in pages list)
   * @param {string} libraryId - Library ID
   * @param {string} title - Page title
   * @param {string} content - Page content (markdown)
   * @param {Object} options - Additional options
   * @returns {Promise<Page>} - Created titled page
   */
  static async createTitledPage(libraryId, title, content, options = {}) {
    if (!title || title.trim().length === 0) {
      throw new Error('Title is required for titled pages');
    }

    if (!content) {
      throw new Error('Content is required for titled pages');
    }

    const page = await Page.create(libraryId, title, {
      content,
      ...options
    });

    console.log(`✅ Created titled page: ${title}`);
    return page;
  }

  /**
   * Create an untitled page (stream-only, doesn't appear in pages list)
   * @param {string} libraryId - Library ID
   * @param {string} streamId - Stream ID where page belongs
   * @param {string} content - Page content (can be empty string)
   * @param {Object} options - Additional options
   * @returns {Promise<Page>} - Created untitled page
   */
  static async createUntitledPage(libraryId, streamId, content = '', options = {}) {
    if (!streamId) {
      throw new Error('Stream ID is required for untitled pages');
    }

    // Allow empty content for immediate page creation
    const page = await Page.create(libraryId, null, {
      content: content || '',
      streamId,
      ...options
    });

    // Add page to stream automatically
    await this.addPageToStream(streamId, page.id, options.position);

    console.log(`✅ Created untitled page in stream ${streamId}`);
    return page;
  }

  /**
   * Create empty untitled page for immediate editing
   * @param {string} libraryId - Library ID
   * @param {string} streamId - Stream ID where page belongs
   * @param {number} position - Position in stream or insertAfterPosition
   * @param {boolean} isInsertAfter - If true, insert after the given position
   * @returns {Promise<Page>} - Created empty untitled page
   */
  static async createEmptyUntitledPage(libraryId, streamId, position = null, isInsertAfter = false) {
    if (!streamId) {
      throw new Error('Stream ID is required for untitled pages');
    }

    const page = await Page.create(libraryId, null, {
      content: '',
      streamId
    });

    // Add page to stream at the right position
    if (isInsertAfter && position !== null) {
      // Insert after the specified position (for generate page functionality)
      await this.addPageToStreamSafely(streamId, page.id, position + 1);
      console.log(`✅ Created empty untitled page in stream ${streamId} after position ${position}`);
    } else {
      // Insert at exact position or end if null
      await this.addPageToStreamSafely(streamId, page.id, position);
      console.log(`✅ Created empty untitled page in stream ${streamId} at position ${position || 'end'}`);
    }
    
    return page;
  }

  /**
   * Create a file page (document reference)
   * @param {string} libraryId - Library ID
   * @param {string} fileId - File ID reference
   * @param {string} fileName - Display name for the file
   * @param {Object} options - Additional options
   * @returns {Promise<Page>} - Created file page
   */
  static async createFilePage(libraryId, fileId, fileName, options = {}) {
    if (!fileId) {
      throw new Error('File ID is required for file pages');
    }

    if (!fileName || fileName.trim().length === 0) {
      throw new Error('File name is required for file pages');
    }

    // Generate preview content from file if available
    let contentPreview = options.contentPreview || '';
    if (options.content) {
      contentPreview = options.content.substring(0, 500);
    }

    const page = await Page.create(libraryId, fileName, {
      pageType: 'file',
      fileId,
      content: contentPreview,
      ...options
    });

    console.log(`✅ Created file page: ${fileName}`);
    return page;
  }

  /**
   * Add title to untitled page (makes it appear in pages list)
   * @param {string} pageId - Page ID to add title to
   * @param {string} title - New title for page
   * @returns {Promise<Page>} - Updated page
   */
  static async addTitleToPage(pageId, title) {
    const page = await Page.findById(pageId);
    
    if (!page) {
      throw new Error('Page not found');
    }

    if (page.hasTitle()) {
      throw new Error('Page already has a title');
    }

    await page.addTitle(title);
    
    console.log(`✅ Added title to page: ${title}`);
    return page;
  }

  /**
   * Create page from AI generation (starts as unsaved)
   * @param {string} libraryId - Library ID
   * @param {string} streamId - Stream ID
   * @param {string} generatedContent - AI-generated content
   * @param {Object} options - Additional options
   * @returns {Promise<Page>} - Created unsaved page
   */
  static async createFromAIGeneration(libraryId, streamId, generatedContent, options = {}) {
    if (!generatedContent || generatedContent.trim().length === 0) {
      throw new Error('Generated content cannot be empty');
    }

    // AI-generated content always starts as untitled
    const page = await this.createUntitledPage(libraryId, streamId, generatedContent, {
      ...options,
      source: 'ai_generation'
    });

    console.log(`✅ Created AI-generated untitled page in stream ${streamId}`);
    return page;
  }

  /**
   * Create multiple pages from content splitting
   * @param {string} libraryId - Library ID
   * @param {Array} contentChunks - Array of content chunks
   * @param {Object} options - Creation options
   * @returns {Promise<Array<Page>>} - Created pages
   */
  static async createFromContentSplit(libraryId, contentChunks, options = {}) {
    const { pageType = 'saved', streamId = null, titlePrefix = 'Part' } = options;
    
    if (!contentChunks || contentChunks.length === 0) {
      throw new Error('Content chunks are required');
    }

    const pages = [];
    
    for (let i = 0; i < contentChunks.length; i++) {
      const chunk = contentChunks[i];
      const title = chunk.title || `${titlePrefix} ${i + 1}`;
      
      let page;
      
      switch (pageType) {
        case 'saved':
          page = await this.createTitledPage(libraryId, title, chunk.content, options);
          break;
          
        case 'unsaved':
          if (!streamId) {
            throw new Error('Stream ID required for untitled pages');
          }
          page = await this.createUntitledPage(libraryId, streamId, chunk.content, {
            ...options,
            position: i
          });
          break;
          
        default:
          throw new Error(`Unsupported page type for content splitting: ${pageType}`);
      }
      
      pages.push(page);
    }

    console.log(`✅ Created ${pages.length} pages from content splitting`);
    return pages;
  }

  /**
   * Add page to stream with position (safer version)
   * @param {string} streamId - Stream ID
   * @param {string} pageId - Page ID
   * @param {number} position - Position in stream (optional)
   * @returns {Promise<void>}
   */
  static async addPageToStreamSafely(streamId, pageId, position = null) {
    return await transaction(async (client) => {
      // Check if page is already in stream
      const existing = await client.query(
        'SELECT id FROM stream_pages WHERE stream_id = $1 AND page_id = $2',
        [streamId, pageId]
      );

      if (existing.rows.length > 0) {
        return; // Page already in stream
      }

      // If position is null, append to end
      if (position === null) {
        const result = await client.query(
          'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM stream_pages WHERE stream_id = $1',
          [streamId]
        );
        position = result.rows[0].next_position;
      } else {
        // Renumber all positions to ensure gaps and avoid conflicts
        const allPages = await client.query(
          'SELECT id, position FROM stream_pages WHERE stream_id = $1 ORDER BY position',
          [streamId]
        );

        // Create a temporary table approach
        await client.query('BEGIN');
        
        // Temporarily set all positions to negative values to avoid conflicts
        await client.query(
          'UPDATE stream_pages SET position = -position - 1000 WHERE stream_id = $1',
          [streamId]
        );

        // Now renumber from the desired insertion point
        let newPos = 0;
        for (const page of allPages.rows) {
          if (newPos === position) {
            newPos++; // Leave space for our new page
          }
          await client.query(
            'UPDATE stream_pages SET position = $1 WHERE stream_id = $2 AND id = $3',
            [newPos, streamId, page.id]
          );
          newPos++;
        }
      }
      
      // Insert the new page
      await client.query(`
        INSERT INTO stream_pages (stream_id, page_id, position, is_in_ai_context, is_collapsed)
        VALUES ($1, $2, $3, false, false)
      `, [streamId, pageId, position]);
      
      console.log(`✅ Added page ${pageId} to stream ${streamId} at position ${position}`);
    });
  }

  /**
   * Add page to stream with position (original method for backward compatibility)
   * @param {string} streamId - Stream ID
   * @param {string} pageId - Page ID
   * @param {number} position - Position in stream (optional)
   * @returns {Promise<void>}
   */
  static async addPageToStream(streamId, pageId, position = null) {
    return await transaction(async (client) => {
      // Get next position if not specified
      if (position === null) {
        const result = await client.query(
          'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM stream_pages WHERE stream_id = $1',
          [streamId]
        );
        position = result.rows[0].next_position;
      }

      // Check if page is already in stream (with lock to prevent race conditions)
      const existing = await client.query(
        'SELECT id FROM stream_pages WHERE stream_id = $1 AND page_id = $2 FOR UPDATE',
        [streamId, pageId]
      );

      if (existing.rows.length > 0) {
        return; // Page already in stream
      }

      // Lock the entire stream to prevent concurrent modifications
      await client.query(
        'SELECT stream_id FROM stream_pages WHERE stream_id = $1 LIMIT 1 FOR UPDATE',
        [streamId]
      );
      
      // Use a more robust approach: find a safe position and insert
      if (position !== null) {
        // Check if the requested position exists
        const existingAtPosition = await client.query(
          'SELECT page_id FROM stream_pages WHERE stream_id = $1 AND position = $2',
          [streamId, position]
        );
        
        if (existingAtPosition.rows.length > 0) {
          // Position is occupied, shift everything from that position up
          await client.query(`
            UPDATE stream_pages 
            SET position = position + 1 
            WHERE stream_id = $1 AND position >= $2
          `, [streamId, position]);
        }
      } else {
        // If position is null, append to end
        const maxPositionResult = await client.query(
          'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM stream_pages WHERE stream_id = $1',
          [streamId]
        );
        position = maxPositionResult.rows[0].next_position;
      }
      
      // Insert the new page
      await client.query(`
        INSERT INTO stream_pages (stream_id, page_id, position, is_in_ai_context, is_collapsed)
        VALUES ($1, $2, $3, false, false)
      `, [streamId, pageId, position]);
      
      console.log(`✅ Added page ${pageId} to stream ${streamId} at position ${position}`);
    });
  }

  /**
   * Get brain ID from stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<string>} - Library ID
   */
  static async getBrainIdFromStream(streamId) {
    const result = await query(
      'SELECT brain_id FROM streams WHERE id = $1',
      [streamId]
    );

    if (result.rows.length === 0) {
      throw new Error('Stream not found');
    }

    return result.rows[0].library_id;
  }

  /**
   * Validate page type and parameters
   * @param {string} pageType - Page type to validate
   * @param {Object} params - Parameters to validate
   * @returns {boolean} - True if valid
   */
  static validatePageType(pageType, params = {}) {
    const validTypes = ['saved', 'file', 'unsaved'];
    
    if (!validTypes.includes(pageType)) {
      throw new Error(`Invalid page type: ${pageType}. Must be one of: ${validTypes.join(', ')}`);
    }

    switch (pageType) {
      case 'saved':
        if (!params.title || params.title.trim().length === 0) {
          throw new Error('Title is required for titled pages');
        }
        break;
        
      case 'unsaved':
        if (!params.streamId) {
          throw new Error('Stream ID is required for untitled pages');
        }
        break;
        
      case 'file':
        if (!params.fileId) {
          throw new Error('File ID is required for file pages');
        }
        if (!params.fileName || params.fileName.trim().length === 0) {
          throw new Error('File name is required for file pages');
        }
        break;
    }

    return true;
  }

  /**
   * Get page creation statistics
   * @param {string} libraryId - Library ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Creation statistics
   */
  static async getCreationStatistics(libraryId, options = {}) {
    const { since = null } = options;
    
    let whereClause = 'WHERE library_id = $1 AND is_active = true';
    const params = [libraryId];
    
    if (since) {
      whereClause += ' AND created_at >= $2';
      params.push(since);
    }
    
    const result = await query(`
      SELECT 
        page_type,
        COUNT(*) as count,
        DATE(created_at) as creation_date
      FROM pages 
      ${whereClause}
      GROUP BY page_type, DATE(created_at)
      ORDER BY creation_date DESC, count DESC
    `, params);

    return result.rows;
  }
  // Legacy method aliases for backward compatibility
  static async createSavedPage(...args) {
    return this.createTitledPage(...args);
  }

  static async createUnsavedPage(...args) {
    return this.createUntitledPage(...args);
  }

  static async createEmptyUnsavedPage(...args) {
    return this.createEmptyUntitledPage(...args);
  }

  static async convertUnsavedToSaved(...args) {
    return this.addTitleToPage(...args);
  }
}

module.exports = PageFactory;