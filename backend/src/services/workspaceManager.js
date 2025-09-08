const Workspace = require('../models/Workspace');

/**
 * Workspace Manager Service
 * Simple service for workspace operations
 */

class WorkspaceManager {
  /**
   * Create a welcome workspace for a new library with tutorial content
   * @param {string} libraryId - Library ID
   * @returns {Promise<Workspace>} - Created welcome workspace
   */
  static async createWelcomeWorkspace(libraryId) {
    try {
      // Create the welcome workspace
      const workspace = await Workspace.create(libraryId, 'Welcome to Your Library');
      
      console.log(`✅ Created welcome workspace for library ${libraryId}`);
      return workspace;
    } catch (error) {
      console.error(`❌ Failed to create welcome workspace for library ${libraryId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get a workspace with its pages and files
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} - Workspace with pages and files
   */
  static async getWorkspaceWithPages(workspaceId) {
    try {
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Get mixed workspace items (both pages and files) in position order
      const WorkspaceFile = require('../models/WorkspaceFile');
      const items = await WorkspaceFile.getWorkspaceItems(workspaceId);
      
      // For backwards compatibility, separate pages, files, and forms
      const pages = items.filter(item => item.itemType === 'card');
      const files = items.filter(item => item.itemType === 'file');
      const forms = items.filter(item => item.itemType === 'form');
      
      return {
        ...workspace,
        pages: pages || [],
        files: files || [],
        forms: forms || []
      };
    } catch (error) {
      console.error(`❌ Failed to get workspace with pages ${workspaceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Remove a page from a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID to remove
   * @returns {Promise<Object>} - Result of removal operation
   */
  static async removePageFromWorkspace(workspaceId, pageId) {
    try {
      const { query } = require('../models/database');
      
      // Check if the page exists in this workspace
      const checkResult = await query(
        'SELECT id FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2',
        [workspaceId, pageId]
      );

      if (checkResult.rows.length === 0) {
        return { removed: false, message: 'Page not found in workspace' };
      }

      // Remove the page from the workspace
      await query(
        'DELETE FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2',
        [workspaceId, pageId]
      );

      console.log(`✅ Removed page ${pageId} from workspace ${workspaceId}`);
      return { removed: true, pageId, workspaceId };
    } catch (error) {
      console.error(`❌ Failed to remove page ${pageId} from workspace ${workspaceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Add a page to a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID to add
   * @param {Object} options - Additional options (position, depth, isInAIContext, isCollapsed)
   * @returns {Promise<Object>} - Result of addition operation
   */
  static async addPageToWorkspace(workspaceId, pageId, options = {}) {
    try {
      const { query } = require('../models/database');
      const { position, depth = 0, isInAIContext = true, isCollapsed = false } = options;
      
      // Check if the page already exists in this workspace
      const checkResult = await query(
        'SELECT id FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2',
        [workspaceId, pageId]
      );

      if (checkResult.rows.length > 0) {
        return { added: false, message: 'Page already exists in workspace' };
      }

      // Verify the page exists
      const pageResult = await query(
        'SELECT id FROM pages WHERE id = $1',
        [pageId]
      );

      if (pageResult.rows.length === 0) {
        return { added: false, message: 'Page not found' };
      }

      // Get the next position if not specified
      let finalPosition = position;
      if (finalPosition === undefined || finalPosition === null) {
        const positionResult = await query(
          'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM workspace_pages WHERE workspace_id = $1',
          [workspaceId]
        );
        finalPosition = positionResult.rows[0].next_position;
      }

      // Add the page to the workspace
      await query(
        `INSERT INTO workspace_pages (workspace_id, page_id, position, depth, is_in_ai_context, is_collapsed, added_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [workspaceId, pageId, finalPosition, depth, isInAIContext, isCollapsed]
      );

      console.log(`✅ Added page ${pageId} to workspace ${workspaceId} at position ${finalPosition}`);
      return { added: true, pageId, workspaceId, position: finalPosition };
    } catch (error) {
      console.error(`❌ Failed to add page ${pageId} to workspace ${workspaceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Move a page to a new position in a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID to move
   * @param {number} newPosition - New position for the page
   * @param {number} newDepth - New depth for the page
   * @returns {Promise<Object>} - Result of move operation
   */
  static async movePage(workspaceId, pageId, newPosition, newDepth) {
    try {
      const { query } = require('../models/database');
      
      // Check if the page exists in this workspace
      const checkResult = await query(
        'SELECT id, position FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2',
        [workspaceId, pageId]
      );

      if (checkResult.rows.length === 0) {
        return { moved: false, message: 'Page not found in workspace' };
      }

      const currentPosition = checkResult.rows[0].position;

      // If moving to the same position, just update depth
      if (currentPosition === newPosition) {
        await query(
          'UPDATE workspace_pages SET depth = $1 WHERE workspace_id = $2 AND page_id = $3',
          [newDepth || 0, workspaceId, pageId]
        );
      } else {
        // Handle position conflicts by temporarily moving conflicting pages
        await query('BEGIN');

        try {
          // First, move any page at the target position to a temporary negative position
          await query(
            'UPDATE workspace_pages SET position = -1 WHERE workspace_id = $1 AND position = $2 AND page_id != $3',
            [workspaceId, newPosition, pageId]
          );

          // Update the target page to the new position and depth
          await query(
            'UPDATE workspace_pages SET position = $1, depth = $2 WHERE workspace_id = $3 AND page_id = $4',
            [newPosition, newDepth || 0, workspaceId, pageId]
          );

          // Reorder all pages to ensure no gaps or conflicts
          const allPages = await query(
            'SELECT page_id, position FROM workspace_pages WHERE workspace_id = $1 ORDER BY CASE WHEN position = -1 THEN 999999 ELSE position END, page_id',
            [workspaceId]
          );

          // Reassign positions sequentially
          for (let i = 0; i < allPages.rows.length; i++) {
            const page = allPages.rows[i];
            if (page.position !== i) {
              await query(
                'UPDATE workspace_pages SET position = $1 WHERE workspace_id = $2 AND page_id = $3',
                [i, workspaceId, page.page_id]
              );
            }
          }

          await query('COMMIT');
        } catch (transactionError) {
          await query('ROLLBACK');
          throw transactionError;
        }
      }

      console.log(`✅ Moved page ${pageId} to position ${newPosition} in workspace ${workspaceId}`);
      return { moved: true, pageId, workspaceId, position: newPosition, depth: newDepth };
    } catch (error) {
      console.error(`❌ Failed to move page ${pageId} in workspace ${workspaceId}:`, error.message);
      throw error;
    }
  }
}

module.exports = WorkspaceManager;