const { query, transaction } = require('./database');

/**
 * WorkspacePage Model
 * Handles the many-to-many relationship between workspaces and pages
 * with position management, AI context, and collapsed state
 */

class WorkspacePage {
  constructor(data) {
    this.id = data.id;
    this.workspaceId = data.workspace_id;
    this.pageId = data.page_id;
    this.position = data.position;
    this.depth = data.depth;
    this.isInAIContext = data.is_in_ai_context;
    this.isCollapsed = data.is_collapsed;
    this.addedAt = data.added_at;
  }

  /**
   * Add a page to a workspace at a specific position
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID  
   * @param {number} position - Position in workspace (0-based)
   * @param {number} depth - Nesting depth (default: 0)
   * @param {Object} options - Additional options
   * @returns {Promise<WorkspacePage>} - Created WorkspacePage instance
   */
  static async addPageToWorkspace(workspaceId, pageId, position = null, depth = 0, options = {}) {
    const { isInAIContext = false, isCollapsed = false } = options;

    return await transaction(async (client) => {
      // Verify workspace exists
      const workspaceResult = await client.query(
        'SELECT id FROM workspaces WHERE id = $1',
        [workspaceId]
      );

      if (workspaceResult.rows.length === 0) {
        throw new Error('Workspace not found');
      }

      // Verify page exists and is active
      const pageResult = await client.query(
        'SELECT id FROM pages WHERE id = $1 AND is_active = true',
        [pageId]
      );

      if (pageResult.rows.length === 0) {
        throw new Error('Page not found or inactive');
      }

      // Check if page already exists in this workspace
      const existingResult = await client.query(
        'SELECT id FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2',
        [workspaceId, pageId]
      );

      if (existingResult.rows.length > 0) {
        throw new Error('Page already exists in this workspace');
      }

      // If no position specified, add at the end
      if (position === null) {
        const maxPositionResult = await client.query(
          'SELECT COALESCE(MAX(position), -1) as max_position FROM workspace_pages WHERE workspace_id = $1',
          [workspaceId]
        );
        position = maxPositionResult.rows[0].max_position + 1;
      }

      // Debug: Check current positions before shifting
      const beforeShift = await client.query(
        'SELECT card_id, position FROM workspace_cards WHERE workspace_id = $1 ORDER BY position',
        [workspaceId]
      );
      console.log(`🔍 Before shift - Workspace positions:`, beforeShift.rows.map(r => `${r.card_id.substring(0,8)}:${r.position}`));
      console.log(`🎯 Inserting card ${cardId.substring(0,8)} at position ${position}`);

      // Shift existing cards at this position and after to make room
      // Get cards that need to be shifted (in reverse order to avoid conflicts)
      const cardsToShift = await client.query(
        'SELECT id, position FROM workspace_cards WHERE workspace_id = $1 AND position >= $2 ORDER BY position DESC',
        [workspaceId, position]
      );
      
      // Shift each card individually from highest position to lowest
      let shiftedCount = 0;
      for (const cardToShift of cardsToShift.rows) {
        await client.query(
          'UPDATE workspace_cards SET position = $1 WHERE id = $2',
          [cardToShift.position + 1, cardToShift.id]
        );
        shiftedCount++;
      }
      console.log(`📊 Shifted ${shiftedCount} cards up by 1 from position ${position}`);

      // Debug: Check positions after shifting
      const afterShift = await client.query(
        'SELECT page_id, position FROM workspace_pages WHERE workspace_id = $1 ORDER BY position',
        [workspaceId]
      );
      console.log(`🔍 After shift - Workspace positions:`, afterShift.rows.map(r => `${r.page_id.substring(0,8)}:${r.position}`));

      // Insert the new workspace_page relationship
      const result = await client.query(`
        INSERT INTO workspace_pages (workspace_id, page_id, position, depth, is_in_ai_context, is_collapsed)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [workspaceId, pageId, position, depth, isInAIContext, isCollapsed]);

      console.log(`✅ Added page ${pageId} to workspace ${workspaceId} at position ${position}`);
      return new WorkspacePage(result.rows[0]);
    });
  }

  /**
   * Remove a page from a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID
   * @returns {Promise<boolean>} - True if page was removed
   */
  static async removePageFromWorkspace(workspaceId, pageId) {
    return await transaction(async (client) => {
      // Lock entire workspace to prevent concurrent modifications
      await client.query(
        'SELECT id FROM workspaces WHERE id = $1 FOR UPDATE',
        [workspaceId]
      );

      // Check if page exists in workspace
      const pageResult = await client.query(
        'SELECT position FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2',
        [workspaceId, pageId]
      );

      if (pageResult.rows.length === 0) {
        return false; // Page not in workspace
      }

      const removedPosition = pageResult.rows[0].position;
      console.log(`🗑️  Removing page ${pageId.substring(0,8)} from position ${removedPosition} in workspace ${workspaceId.substring(0,8)}`);

      // Ultra-simple approach: move all cards to negative positions first, 
      // then delete, then reassign positive sequential positions
      // This completely avoids any constraint conflicts
      
      // Step 1: Move all pages in this workspace to negative positions to avoid conflicts
      await client.query(`
        UPDATE workspace_pages 
        SET position = -1000 - position
        WHERE workspace_id = $1
      `, [workspaceId]);

      // Step 2: Delete the target page (now at a negative position)
      await client.query(
        'DELETE FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2',
        [workspaceId, pageId]
      );

      // Step 3: Reassign all remaining pages to sequential positive positions
      await client.query(`
        WITH sequential_positions AS (
          SELECT 
            id,
            ROW_NUMBER() OVER (ORDER BY 
              -position, -- Since positions are negative, this preserves original order
              added_at
            ) - 1 as new_position
          FROM workspace_pages
          WHERE workspace_id = $1
        )
        UPDATE workspace_pages 
        SET position = sequential_positions.new_position
        FROM sequential_positions
        WHERE workspace_pages.id = sequential_positions.id
      `, [workspaceId]);

      console.log(`✅ Removed page ${pageId} from workspace ${workspaceId} using conflict-free approach`);
      return true;
    });
  }

  /**
   * Reorder a page to a new position within a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID
   * @param {number} newPosition - New position (0-based)
   * @param {number} newDepth - New depth (optional)
   * @returns {Promise<boolean>} - True if page was reordered
   */
  static async reorderPage(workspaceId, pageId, newPosition, newDepth = null) {
    return await transaction(async (client) => {
      // Get current position and depth
      const currentResult = await client.query(
        'SELECT position, depth FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2',
        [workspaceId, pageId]
      );

      if (currentResult.rows.length === 0) {
        throw new Error('Page not found in workspace');
      }

      const currentPosition = currentResult.rows[0].position;
      const currentDepth = currentResult.rows[0].depth;

      // If position hasn't changed and depth hasn't changed, nothing to do
      if (currentPosition === newPosition && (newDepth === null || currentDepth === newDepth)) {
        return false;
      }

      // Get max position to validate new position
      const maxResult = await client.query(
        'SELECT COALESCE(MAX(position), 0) as max_position FROM workspace_pages WHERE workspace_id = $1',
        [workspaceId]
      );
      const maxPosition = maxResult.rows[0].max_position;

      // Allow negative positions for temporary swapping, but validate non-negative positions
      if (newPosition >= 0 && newPosition > maxPosition) {
        throw new Error(`Invalid position: ${newPosition}. Must be between 0 and ${maxPosition}`);
      }

      // Atomic position reordering with better edge case handling
      if (currentPosition !== newPosition) {
        console.log(`🚀 Starting atomic reorder: page ${pageId.substring(0,8)} from position ${currentPosition} to ${newPosition}`);
        
        // Ensure newPosition is valid (>= 0)
        if (newPosition < 0) {
          console.log(`⚠️  Invalid target position ${newPosition}, normalizing to 0`);
          newPosition = 0;
        }
        
        // Get workspace lock and normalize all positions first
        await client.query(`
          SELECT id FROM workspaces WHERE id = $1 FOR UPDATE
        `, [workspaceId]);
        
        // Normalize positions to ensure no gaps or negatives
        await client.query(`
          WITH normalized_positions AS (
            SELECT 
              page_id,
              ROW_NUMBER() OVER (ORDER BY 
                CASE WHEN position >= 0 THEN position ELSE 9999 END,
                added_at
              ) - 1 as norm_position
            FROM workspace_pages
            WHERE workspace_id = $1
          )
          UPDATE workspace_pages 
          SET position = normalized_positions.norm_position
          FROM normalized_positions
          WHERE workspace_pages.workspace_id = $1 
            AND workspace_pages.page_id = normalized_positions.page_id
            AND workspace_pages.position != normalized_positions.norm_position
        `, [workspaceId]);
        
        // Get the normalized current position
        const normalizedResult = await client.query(
          'SELECT position FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2',
          [workspaceId, pageId]
        );
        const normalizedCurrentPosition = normalizedResult.rows[0].position;
        
        // Simple, foolproof reordering: temporarily move target card to very negative position,
        // then shift others, then move target card to final position
        if (normalizedCurrentPosition !== newPosition) {
          // Step 1: Move target page to temporary position far from any real positions
          await client.query(
            'UPDATE workspace_pages SET position = $1 WHERE workspace_id = $2 AND page_id = $3',
            [-999999, workspaceId, pageId]
          );
          
          // Step 2: Shift other pages based on direction
          if (normalizedCurrentPosition < newPosition) {
            // Moving down: shift pages between old and new position up by 1
            await client.query(`
              UPDATE workspace_pages 
              SET position = position - 1 
              WHERE workspace_id = $1 AND position > $2 AND position <= $3
            `, [workspaceId, normalizedCurrentPosition, newPosition]);
          } else {
            // Moving up: shift pages between new and old position down by 1
            await client.query(`
              UPDATE workspace_pages 
              SET position = position + 1 
              WHERE workspace_id = $1 AND position >= $2 AND position < $3
            `, [workspaceId, newPosition, normalizedCurrentPosition]);
          }
          
          // Step 3: Move target page to final position
          await client.query(
            'UPDATE workspace_pages SET position = $1 WHERE workspace_id = $2 AND page_id = $3',
            [newPosition, workspaceId, pageId]
          );
        }
        
        console.log(`🔄 Atomically reordered page ${pageId} from position ${normalizedCurrentPosition} to ${newPosition}`);
        return true;
      }

      // Update depth if provided (position was already updated above)
      if (newDepth !== null) {
        await client.query(
          'UPDATE workspace_pages SET depth = $1 WHERE workspace_id = $2 AND page_id = $3',
          [newDepth, workspaceId, pageId]
        );
        console.log(`📏 Updated page ${pageId} depth to ${newDepth}`);
      }

      console.log(`✅ Reordered page ${pageId} in workspace ${workspaceId} to position ${newPosition}`);
      return true;
    });
  }

  /**
   * Toggle AI context for a page in a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID
   * @returns {Promise<boolean>} - New AI context state
   */
  static async toggleAIContext(workspaceId, pageId) {
    const result = await query(`
      UPDATE workspace_pages 
      SET is_in_ai_context = NOT is_in_ai_context 
      WHERE workspace_id = $1 AND page_id = $2
      RETURNING is_in_ai_context
    `, [workspaceId, pageId]);

    if (result.rows.length === 0) {
      throw new Error('Page not found in workspace');
    }

    const newState = result.rows[0].is_in_ai_context;
    console.log(`✅ Toggled AI context for page ${pageId} in workspace ${workspaceId}: ${newState}`);
    return newState;
  }

  /**
   * Toggle collapsed state for a page in a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID
   * @returns {Promise<boolean>} - New collapsed state
   */
  static async toggleCollapsed(workspaceId, pageId) {
    const result = await query(`
      UPDATE workspace_pages 
      SET is_collapsed = NOT is_collapsed 
      WHERE workspace_id = $1 AND page_id = $2
      RETURNING is_collapsed
    `, [workspaceId, pageId]);

    if (result.rows.length === 0) {
      throw new Error('Page not found in workspace');
    }

    const newState = result.rows[0].is_collapsed;
    console.log(`✅ Toggled collapsed state for page ${pageId} in workspace ${workspaceId}: ${newState}`);
    return newState;
  }

  /**
   * Update page state in workspace (AI context, collapsed, depth)
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID
   * @param {Object} updates - State updates
   * @returns {Promise<WorkspacePage>} - Updated WorkspacePage instance
   */
  static async updatePageState(workspaceId, pageId, updates) {
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
    const values = [workspaceId, pageId, ...Object.values(validUpdates)];

    const result = await query(`
      UPDATE workspace_pages 
      SET ${setClause}
      WHERE workspace_id = $1 AND page_id = $2
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Page not found in workspace');
    }

    return new WorkspacePage(result.rows[0]);
  }

  /**
   * Get all pages in a workspace with proper ordering
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array<Object>>} - Array of pages with workspace metadata
   */
  static async getWorkspacePages(workspaceId) {
    const result = await query(`
      SELECT p.*, wp.position, wp.depth, wp.is_in_ai_context, wp.is_collapsed, wp.added_at
      FROM pages p
      JOIN workspace_pages wp ON p.id = wp.page_id
      WHERE wp.workspace_id = $1 AND p.is_active = true
      ORDER BY wp.position
    `, [workspaceId]);

    const Page = require('./Page');
    const pages = [];
    
    for (const row of result.rows) {
      const page = new Page(row);
      const pageData = await page.toJSON(false); // Get full page data with file info
      
      // Add workspace-specific metadata
      pageData.position = row.position;
      pageData.depth = row.depth;
      pageData.isInAIContext = row.is_in_ai_context;
      pageData.isCollapsed = row.is_collapsed;
      pageData.addedAt = row.added_at;
      
      pages.push(pageData);
    }
    
    return pages;
  }

  /**
   * Get all workspaces that contain a specific page
   * @param {string} pageId - Page ID
   * @returns {Promise<Array<Object>>} - Array of workspaces with position info
   */
  static async getPageWorkspaces(pageId) {
    const result = await query(`
      SELECT w.*, wp.position, wp.depth, wp.is_in_ai_context, wp.is_collapsed, wp.added_at
      FROM workspaces w
      JOIN workspace_pages wp ON w.id = wp.workspace_id
      WHERE wp.page_id = $1
      ORDER BY w.name
    `, [pageId]);

    return result.rows.map(row => ({
      id: row.id,
      libraryId: row.library_id,
      name: row.name,
      isFavorited: row.is_favorited,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      // Page position in this workspace
      position: row.position,
      depth: row.depth,
      isInAIContext: row.is_in_ai_context,
      isCollapsed: row.is_collapsed,
      addedAt: row.added_at
    }));
  }

  /**
   * Get pages in AI context for a workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array<Object>>} - Array of pages in AI context
   */
  static async getAIContextPages(workspaceId) {
    const result = await query(`
      SELECT p.id, p.title, p.content_preview, wp.position, wp.depth
      FROM pages p
      JOIN workspace_pages wp ON p.id = wp.page_id
      WHERE wp.workspace_id = $1 AND wp.is_in_ai_context = true AND p.is_active = true
      ORDER BY wp.position
    `, [workspaceId]);

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      contentPreview: row.content_preview,
      position: row.position,
      depth: row.depth
    }));
  }

  /**
   * Normalize positions in a workspace (fix gaps and duplicates)
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<number>} - Number of pages reordered
   */
  static async normalizePositions(workspaceId) {
    return await transaction(async (client) => {
      // Get all pages in order
      const result = await client.query(`
        SELECT id, position 
        FROM workspace_pages 
        WHERE workspace_id = $1 
        ORDER BY position, added_at
      `, [workspaceId]);

      // Update positions to be sequential starting from 0
      let updated = 0;
      for (let i = 0; i < result.rows.length; i++) {
        const page = result.rows[i];
        if (page.position !== i) {
          await client.query(
            'UPDATE workspace_pages SET position = $1 WHERE id = $2',
            [i, page.id]
          );
          updated++;
        }
      }

      if (updated > 0) {
        console.log(`✅ Normalized ${updated} page positions in workspace ${workspaceId}`);
      }

      return updated;
    });
  }

  /**
   * Get position statistics for a workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} - Position statistics
   */
  static async getPositionStats(workspaceId) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_pages,
        MIN(position) as min_position,
        MAX(position) as max_position,
        COUNT(DISTINCT position) as unique_positions,
        COUNT(*) FILTER (WHERE is_in_ai_context = true) as ai_context_count
      FROM workspace_pages 
      WHERE workspace_id = $1
    `, [workspaceId]);

    const stats = result.rows[0];
    return {
      totalPages: parseInt(stats.total_pages),
      minPosition: parseInt(stats.min_position || 0),
      maxPosition: parseInt(stats.max_position || 0),
      uniquePositions: parseInt(stats.unique_positions),
      aiContextCount: parseInt(stats.ai_context_count),
      hasGaps: parseInt(stats.unique_positions) !== parseInt(stats.total_pages),
      expectedMaxPosition: parseInt(stats.total_pages) - 1
    };
  }

  /**
   * Bulk update positions for multiple pages
   * @param {string} workspaceId - Workspace ID
   * @param {Array<Object>} updates - Array of {pageId, position, depth?} objects
   * @returns {Promise<number>} - Number of pages updated
   */
  static async bulkUpdatePositions(workspaceId, updates) {
    return await transaction(async (client) => {
      let updated = 0;
      
      for (const update of updates) {
        const { pageId, position, depth } = update;
        
        const setFields = ['position = $3'];
        const values = [workspaceId, pageId, position];
        
        if (depth !== undefined) {
          setFields.push('depth = $4');
          values.push(depth);
        }
        
        const result = await client.query(`
          UPDATE workspace_pages 
          SET ${setFields.join(', ')}
          WHERE workspace_id = $1 AND page_id = $2
        `, values);
        
        updated += result.rowCount;
      }
      
      console.log(`✅ Bulk updated ${updated} page positions in workspace ${workspaceId}`);
      return updated;
    });
  }
}

module.exports = WorkspacePage;