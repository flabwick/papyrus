const Workspace = require('../models/Workspace');
const WorkspacePage = require('../models/WorkspacePage');
const Page = require('../models/Page');
const Library = require('../models/Library');
const { query } = require('../models/database');

/**
 * Workspace Manager Service
 * Orchestrates complex workspace operations involving multiple models
 */

class WorkspaceManager {
  /**
   * Create a welcome workspace for a new library with tutorial content
   * @param {string} libraryId - Library ID
   * @returns {Promise<Workspace>} - Created welcome workspace
   */
  static async createWelcomeWorkspace(libraryId) {
    // Create the welcome workspace (will automatically create tutorial pages)
    const workspace = await Workspace.create(libraryId, 'Welcome to Your Library', true);
    
    console.log(`✅ Created welcome workspace for library ${libraryId}`);
    return workspace;
  }

  /**
   * Add a page to a workspace with smart position management
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID
   * @param {number|null} insertAfterPosition - Position to insert after (null for end)
   * @param {number} depth - Nesting depth (default: 0)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Result with workspace page and updated positions
   */
  static async addPageToWorkspace(workspaceId, pageId, insertAfterPosition = null, depth = 0, options = {}) {
    // Calculate actual insertion position
    let insertPosition = 0;
    
    if (insertAfterPosition !== null) {
      insertPosition = insertAfterPosition + 1;
    } else {
      // Add at the end
      const stats = await WorkspacePage.getPositionStats(workspaceId);
      insertPosition = stats.expectedMaxPosition + 1;
    }

    // Add the page
    const workspacePage = await WorkspacePage.addPageToWorkspace(workspaceId, pageId, insertPosition, depth, options);
    
    // Get updated workspace information
    const workspace = await Workspace.findById(workspaceId);
    const pages = await WorkspacePage.getWorkspacePages(workspaceId);
    
    return {
      workspacePage,
      workspace: await workspace.toJSON(),
      totalPages: pages.length,
      insertedAt: insertPosition
    };
  }

  /**
   * Move a page to a new position within a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID
   * @param {number} newPosition - New position
   * @param {number|null} newDepth - New depth (optional)
   * @returns {Promise<Object>} - Result with updated positions
   */
  static async movePage(workspaceId, pageId, newPosition, newDepth = null) {
    const wasReordered = await WorkspacePage.reorderPage(workspaceId, pageId, newPosition, newDepth);
    
    if (!wasReordered) {
      return { changed: false };
    }

    // Get updated workspace information
    const workspace = await Workspace.findById(workspaceId);
    const pages = await WorkspacePage.getWorkspacePages(workspaceId);
    
    return {
      changed: true,
      workspace: await workspace.toJSON(),
      pages,
      totalPages: pages.length
    };
  }

  /**
   * Remove a page from a workspace and reposition remaining pages
   * @param {string} workspaceId - Workspace ID
   * @param {string} pageId - Page ID
   * @returns {Promise<Object>} - Result with updated workspace information
   */
  static async removePageFromWorkspace(workspaceId, pageId) {
    const wasRemoved = await WorkspacePage.removePageFromWorkspace(workspaceId, pageId);
    
    if (!wasRemoved) {
      return { removed: false };
    }

    // Get updated workspace information
    const workspace = await Workspace.findById(workspaceId);
    const pages = await WorkspacePage.getWorkspacePages(workspaceId);
    
    return {
      removed: true,
      workspace: await workspace.toJSON(),  
      pages,
      totalPages: pages.length
    };
  }

  /**
   * Duplicate a workspace with all pages and states
   * @param {string} workspaceId - Workspace ID to duplicate
   * @param {string} newName - Name for the new workspace
   * @returns {Promise<Object>} - Result with new workspace information
   */
  static async duplicateWorkspace(workspaceId, newName) {
    const originalWorkspace = await Workspace.findById(workspaceId);
    
    if (!originalWorkspace) {
      throw new Error('Workspace not found');
    }

    const newWorkspace = await originalWorkspace.duplicate(newName);
    const pages = await WorkspacePage.getWorkspacePages(newWorkspace.id);
    
    return {
      originalWorkspace: await originalWorkspace.toJSON(),
      newWorkspace: await newWorkspace.toJSON(),
      pages,
      totalPages: pages.length
    };
  }

  /**
   * Get a workspace with full page details and metadata
   * @param {string} workspaceId - Workspace ID
   * @param {boolean} includeContent - Include full page content (default: false)
   * @returns {Promise<Object>} - Workspace with complete page information
   */
  static async getWorkspaceWithPages(workspaceId, includeContent = false) {
    const workspace = await Workspace.findById(workspaceId);
    
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Update last accessed timestamp
    await workspace.updateLastAccessed();
    
    const pages = await WorkspacePage.getWorkspacePages(workspaceId);
    const aiContextPages = await WorkspacePage.getAIContextPages(workspaceId);
    
    // Optionally include full content for each page
    if (includeContent) {
      for (const page of pages) {
        const fullPage = await Page.findById(page.id);
        if (fullPage) {
          page.content = await fullPage.getContent();
        }
      }
    }
    
    const workspaceData = await workspace.toJSON();
    
    return {
      ...workspaceData,
      pages,
      aiContextPages,
      totalPages: pages.length,
      aiContextCount: aiContextPages.length
    };
  }

  /**
   * Search pages for adding to workspaces (current library first, then others)
   * @param {string} libraryId - Current library ID
   * @param {string} query - Search query
   * @param {boolean} includeOtherLibraries - Include pages from other libraries (default: true)
   * @param {string} userId - User ID for cross-library search
   * @returns {Promise<Object>} - Search results organized by library
   */
  static async searchPagesForWorkspace(libraryId, searchQuery, includeOtherLibraries = true, userId = null) {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return {
        currentLibrary: [],
        otherLibraries: [],
        totalResults: 0
      };
    }

    const results = {
      currentLibrary: [],
      otherLibraries: [],
      totalResults: 0
    };

    // Search current library first
    const currentLibraryPages = await Page.search(libraryId, searchQuery, { 
      activeOnly: true, 
      limit: 25 
    });
    
    results.currentLibrary = await Promise.all(
      currentLibraryPages.map(async page => ({
        ...(await page.toJSON()),
        libraryName: null // Will be filled below
      }))
    );

    // Get library name for current library
    if (results.currentLibrary.length > 0) {
      const library = await Library.findById(libraryId);
      results.currentLibrary.forEach(page => {
        page.libraryName = library ? library.name : 'Unknown Library';
      });
    }

    // Search other libraries if requested and user ID provided
    if (includeOtherLibraries && userId) {
      const otherLibraries = await Library.findByUserId(userId);
      
      for (const library of otherLibraries) {
        if (library.id === libraryId) continue; // Skip current library
        
        const libraryPages = await Page.search(library.id, searchQuery, { 
          activeOnly: true, 
          limit: 10 // Fewer results per other library
        });
        
        const pagesWithLibraryName = await Promise.all(
          libraryPages.map(async page => ({
            ...(await page.toJSON()),
            libraryName: library.name
          }))
        );
        
        results.otherLibraries.push(...pagesWithLibraryName);
      }
    }

    results.totalResults = results.currentLibrary.length + results.otherLibraries.length;
    
    return results;
  }

  /**
   * Get comprehensive workspace statistics
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} - Detailed workspace statistics
   */
  static async getWorkspaceStats(workspaceId) {
    const workspace = await Workspace.findById(workspaceId);
    
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const positionStats = await WorkspacePage.getPositionStats(workspaceId);
    const pages = await WorkspacePage.getWorkspacePages(workspaceId);
    const aiContextPages = await WorkspacePage.getAIContextPages(workspaceId);
    
    // Calculate depth distribution
    const depthDistribution = {};
    pages.forEach(page => {
      depthDistribution[page.depth] = (depthDistribution[page.depth] || 0) + 1;
    });
    
    // Calculate total content size for AI context pages
    let aiContextSize = 0;
    for (const contextPage of aiContextPages) {
      const page = await Page.findById(contextPage.id);
      if (page) {
        aiContextSize += page.fileSize || 0;
      }
    }
    
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      libraryId: workspace.libraryId,
      isFavorited: workspace.isFavorited,
      createdAt: workspace.createdAt,
      lastAccessedAt: workspace.lastAccessedAt,
      ...positionStats,
      depthDistribution,
      aiContextSize,
      averageDepth: pages.length > 0 ? pages.reduce((sum, page) => sum + page.depth, 0) / pages.length : 0,
      hasNestedPages: Object.keys(depthDistribution).some(depth => parseInt(depth) > 0)
    };
  }

  /**
   * Reorder multiple pages at once (batch operation)
   * @param {string} workspaceId - Workspace ID
   * @param {Array<Object>} reorderInstructions - Array of {pageId, newPosition, newDepth?}
   * @returns {Promise<Object>} - Result with updated workspace information
   */
  static async batchReorderPages(workspaceId, reorderInstructions) {
    // Validate all pages exist in the workspace first
    const currentPages = await WorkspacePage.getWorkspacePages(workspaceId);
    const currentPageIds = currentPages.map(page => page.id);
    
    for (const instruction of reorderInstructions) {
      if (!currentPageIds.includes(instruction.pageId)) {
        throw new Error(`Page ${instruction.pageId} not found in workspace`);
      }
    }
    
    // Apply bulk position updates
    const updated = await WorkspacePage.bulkUpdatePositions(workspaceId, reorderInstructions);
    
    // Normalize positions to ensure no gaps
    await WorkspacePage.normalizePositions(workspaceId);
    
    // Get updated workspace information
    const workspace = await Workspace.findById(workspaceId);
    const pages = await WorkspacePage.getWorkspacePages(workspaceId);
    
    return {
      updated,
      workspace: await workspace.toJSON(),
      pages,
      totalPages: pages.length
    };
  }

  /**
   * Get workspace history and usage analytics
   * @param {string} libraryId - Library ID
   * @param {number} limit - Number of recent workspaces to return (default: 10)
   * @returns {Promise<Object>} - Workspace usage analytics
   */
  static async getWorkspaceAnalytics(libraryId, limit = 10) {
    const result = await query(`
      SELECT 
        s.*,
        COUNT(sc.id) as page_count,
        COUNT(sc.id) FILTER (WHERE sc.is_in_ai_context = true) as ai_context_count,
        AVG(sc.depth) as avg_depth
      FROM workspaces s
      LEFT JOIN workspace_pages sc ON s.id = sc.workspace_id
      LEFT JOIN pages c ON sc.page_id = c.id AND c.is_active = true
      WHERE s.library_id = $1
      GROUP BY s.id
      ORDER BY s.last_accessed_at DESC
      LIMIT $2
    `, [libraryId, limit]);

    const recentWorkspaces = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      isFavorited: row.is_favorited,
      pageCount: parseInt(row.page_count) || 0,
      aiContextCount: parseInt(row.ai_context_count) || 0,
      avgDepth: parseFloat(row.avg_depth) || 0,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at
    }));

    // Get overall statistics
    const statsResult = await query(`
      SELECT 
        COUNT(DISTINCT s.id) as total_workspaces,
        COUNT(DISTINCT s.id) FILTER (WHERE s.is_favorited = true) as favorited_workspaces,
        COUNT(DISTINCT sc.page_id) as unique_pages_in_workspaces,
        AVG(page_counts.page_count) as avg_pages_per_workspace
      FROM workspaces s
      LEFT JOIN workspace_pages sc ON s.id = sc.workspace_id
      LEFT JOIN pages c ON sc.page_id = c.id AND c.is_active = true
      LEFT JOIN (
        SELECT workspace_id, COUNT(*) as page_count
        FROM workspace_pages sc2
        JOIN pages c2 ON sc2.page_id = c2.id AND c2.is_active = true
        GROUP BY workspace_id
      ) page_counts ON s.id = page_counts.workspace_id
      WHERE s.library_id = $1
    `, [libraryId]);

    const stats = statsResult.rows[0];

    return {
      recentWorkspaces,
      analytics: {
        totalWorkspaces: parseInt(stats.total_workspaces) || 0,
        favoritedWorkspaces: parseInt(stats.favorited_workspaces) || 0,
        uniquePagesInWorkspaces: parseInt(stats.unique_pages_in_workspaces) || 0,
        avgPagesPerWorkspace: parseFloat(stats.avg_pages_per_workspace) || 0
      }
    };
  }
}

module.exports = WorkspaceManager;