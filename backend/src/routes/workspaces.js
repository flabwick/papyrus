const express = require('express');
const router = express.Router();
const Workspace = require('../models/Workspace');
const WorkspacePage = require('../models/WorkspacePage');
const Brain = require('../models/Brain');
const Page = require('../models/Page');
const WorkspaceManager = require('../services/workspaceManager');
const { requireAuth } = require('../middleware/auth');

// All workspace routes require authentication
router.use(requireAuth);

// Input validation helpers
const validateWorkspaceInput = (name) => {
  const errors = {};
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.name = 'Workspace name is required';
  } else if (name.trim().length > 100) {
    errors.name = 'Workspace name cannot exceed 100 characters';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

const validateUUID = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const validateBrainOwnership = async (brainId, userId) => {
  const brain = await Brain.findById(brainId);
  if (!brain) {
    throw new Error('Brain not found');
  }
  if (brain.userId !== userId) {
    throw new Error('Access denied to brain');
  }
  return brain;
};

const validateWorkspaceOwnership = async (workspaceId, userId) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  const brain = await Brain.findById(workspace.brainId);
  if (!brain || brain.userId !== userId) {
    throw new Error('Access denied to workspace');
  }
  
  return { workspace, brain };
};

/**
 * GET /api/workspaces
 * List all workspaces for user's brains
 */
router.get('/', async (req, res) => {
  try {
    const { brainId } = req.query;
    
    if (brainId) {
      // Get workspaces for specific brain
      if (!validateUUID(brainId)) {
        return res.status(400).json({
          error: 'Invalid brain ID',
          message: 'Brain ID must be a valid UUID'
        });
      }
      
      await validateBrainOwnership(brainId, req.session.userId);
      const workspaces = await Workspace.findByBrainId(brainId);
      
      const workspacesWithMetadata = await Promise.all(
        workspaces.map(async (workspace) => await workspace.toJSON())
      );
      
      return res.json({
        workspaces: workspacesWithMetadata,
        count: workspacesWithMetadata.length,
        brainId
      });
    }
    
    // Get workspaces for all user's brains
    const userBrains = await Brain.findByUserId(req.session.userId);
    const allWorkspaces = [];
    
    for (const brain of userBrains) {
      const workspaces = await Workspace.findByBrainId(brain.id);
      const workspacesWithMetadata = await Promise.all(
        workspaces.map(async (workspace) => ({
          ...(await workspace.toJSON()),
          brainName: brain.name
        }))
      );
      allWorkspaces.push(...workspacesWithMetadata);
    }
    
    // Sort by last accessed date
    allWorkspaces.sort((a, b) => new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt));
    
    res.json({
      workspaces: allWorkspaces,
      count: allWorkspaces.length
    });

  } catch (error) {
    console.error('❌ Get workspaces error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to retrieve workspaces',
      message: 'An error occurred while fetching workspaces'
    });
  }
});

/**
 * POST /api/workspaces
 * Create new workspace
 */
router.post('/', async (req, res) => {
  try {
    const { name, brainId } = req.body;
    
    // Validate input
    const validation = validateWorkspaceInput(name);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        fields: validation.errors
      });
    }
    
    if (!brainId || !validateUUID(brainId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Valid brain ID is required'
      });
    }
    
    // Verify brain ownership
    await validateBrainOwnership(brainId, req.session.userId);
    
    // Create workspace
    const workspace = await Workspace.create(brainId, name.trim(), false);
    const workspaceData = await workspace.toJSON();
    
    res.status(201).json({
      workspace: workspaceData,
      message: 'Workspace created successfully'
    });

  } catch (error) {
    console.error('❌ Create workspace error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Workspace already exists',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to create workspace',
      message: 'An error occurred while creating the workspace'
    });
  }
});

/**
 * GET /api/workspaces/:id
 * Get specific workspace with pages
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeContent = false } = req.query;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'Workspace ID must be a valid UUID'
      });
    }
    
    // Verify ownership and get workspace
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Get workspace with full details
    const workspaceData = await WorkspaceManager.getWorkspaceWithPages(id, includeContent === 'true');
    
    res.json({
      workspace: workspaceData
    });

  } catch (error) {
    console.error('❌ Get workspace error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to retrieve workspace',
      message: 'An error occurred while fetching the workspace'
    });
  }
});

/**
 * PUT /api/workspaces/:id
 * Update workspace (title, favorite status)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isFavorited } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'Workspace ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    const { workspace } = await validateWorkspaceOwnership(id, req.session.userId);
    
    // Prepare updates
    const updates = {};
    if (name !== undefined) {
      const validation = validateWorkspaceInput(name);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Please check your input',
          fields: validation.errors
        });
      }
      updates.name = name.trim();
    }
    
    if (isFavorited !== undefined) {
      updates.is_favorited = Boolean(isFavorited);
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
        message: 'Provide name or isFavorited to update'
      });
    }
    
    // Update workspace
    await workspace.update(updates);
    const workspaceData = await workspace.toJSON();
    
    res.json({
      workspace: workspaceData,
      message: 'Workspace updated successfully'
    });

  } catch (error) {
    console.error('❌ Update workspace error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Workspace name already exists',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to update workspace',
      message: 'An error occurred while updating the workspace'
    });
  }
});

/**
 * DELETE /api/workspaces/:id
 * Delete workspace
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'Workspace ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    const { workspace } = await validateWorkspaceOwnership(id, req.session.userId);
    const workspaceName = workspace.name;
    
    // Delete workspace
    await workspace.delete();
    
    res.json({
      message: 'Workspace deleted successfully',
      workspaceName: workspaceName,
      workspaceId: id
    });

  } catch (error) {
    console.error('❌ Delete workspace error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to delete workspace',
      message: 'An error occurred while deleting the workspace'
    });
  }
});

/**
 * POST /api/workspaces/:id/access
 * Update last accessed timestamp
 */
router.post('/:id/access', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'Workspace ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    const { workspace } = await validateWorkspaceOwnership(id, req.session.userId);
    
    // Update last accessed
    await workspace.updateLastAccessed();
    
    res.json({
      message: 'Workspace access updated',
      lastAccessedAt: workspace.lastAccessedAt
    });

  } catch (error) {
    console.error('❌ Update workspace access error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to update workspace access',
      message: 'An error occurred while updating workspace access'
    });
  }
});

/**
 * GET /api/workspaces/:id/pages
 * Get pages in workspace with ordering
 */
router.get('/:id/pages', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'Workspace ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Get mixed workspace items (both pages and files)
    const WorkspaceFile = require('../models/WorkspaceFile');
    const items = await WorkspaceFile.getWorkspaceItems(id);
    const aiContextPages = await WorkspacePage.getAIContextPages(id);
    
    // Separate pages and files for backwards compatibility
    const pages = items.filter(item => item.itemType === 'page');
    const files = items.filter(item => item.itemType === 'file');
    
    res.json({
      items, // Mixed array of pages and files in position order
      pages, // Just pages (for backwards compatibility)
      files, // Just files
      aiContextPages,
      count: pages.length,
      aiContextCount: aiContextPages.length,
      workspaceId: id
    });

  } catch (error) {
    console.error('❌ Get workspace pages error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to retrieve workspace pages',
      message: 'An error occurred while fetching workspace pages'
    });
  }
});

/**
 * POST /api/workspaces/:id/pages
 * Add page to workspace
 */
router.post('/:id/pages', async (req, res) => {
  try {
    const { id } = req.params;
    const { pageId, position, depth = 0, isInAIContext = false, isCollapsed = false } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'Workspace ID must be a valid UUID'
      });
    }
    
    if (!pageId || !validateUUID(pageId)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Valid page ID is required'
      });
    }
    
    // Verify ownership
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Add page to workspace
    const result = await WorkspaceManager.addPageToWorkspace(id, pageId, position, depth, {
      isInAIContext,
      isCollapsed
    });
    
    res.status(201).json({
      ...result,
      message: 'Page added to workspace successfully'
    });

  } catch (error) {
    console.error('❌ Add page to workspace error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Page already in workspace',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to add page to workspace',
      message: 'An error occurred while adding the page'
    });
  }
});

/**
 * PUT /api/workspaces/:id/pages/:pageId
 * Update page state in workspace
 */
router.put('/:id/pages/:pageId', async (req, res) => {
  try {
    const { id, pageId } = req.params;
    const { position, depth, isInAIContext, isCollapsed } = req.body;
    
    if (!validateUUID(id) || !validateUUID(pageId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Workspace ID and page ID must be valid UUIDs'
      });
    }
    
    // Verify ownership
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Handle position changes separately from state changes
    if (position !== undefined) {
      const result = await WorkspaceManager.movePage(id, pageId, position, depth);
      return res.json({
        ...result,
        message: 'Page position updated successfully'
      });
    }
    
    // Handle state updates
    const updates = {};
    if (depth !== undefined) updates.depth = depth;
    if (isInAIContext !== undefined) updates.is_in_ai_context = isInAIContext;
    if (isCollapsed !== undefined) updates.is_collapsed = isCollapsed;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
        message: 'Provide position, depth, isInAIContext, or isCollapsed to update'
      });
    }
    
    const workspacePage = await WorkspacePage.updatePageState(id, pageId, updates);
    
    res.json({
      workspacePage: workspacePage,
      message: 'Page state updated successfully'
    });

  } catch (error) {
    console.error('❌ Update page in workspace error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to update page in workspace',
      message: 'An error occurred while updating the page'
    });
  }
});

/**
 * DELETE /api/workspaces/:id/pages/:pageId
 * Remove page from workspace
 */
router.delete('/:id/pages/:pageId', async (req, res) => {
  try {
    const { id, pageId } = req.params;
    
    if (!validateUUID(id) || !validateUUID(pageId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Workspace ID and page ID must be valid UUIDs'  
      });
    }
    
    // Verify ownership
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Remove page from workspace
    const result = await WorkspaceManager.removePageFromWorkspace(id, pageId);
    
    if (!result.removed) {
      return res.status(404).json({
        error: 'Page not found in workspace',
        message: 'The page is not in this workspace'
      });
    }
    
    res.json({
      ...result,
      message: 'Page removed from workspace successfully'
    });

  } catch (error) {
    console.error('❌ Remove page from workspace error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to remove page from workspace',
      message: 'An error occurred while removing the page'
    });
  }
});

/**
 * POST /api/workspaces/:id/duplicate
 * Clone workspace
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'Workspace ID must be a valid UUID'
      });
    }
    
    const validation = validateWorkspaceInput(name);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        fields: validation.errors
      });
    }
    
    // Verify ownership
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Duplicate workspace
    const result = await WorkspaceManager.duplicateWorkspace(id, name.trim());
    
    res.status(201).json({
      ...result,
      message: 'Workspace duplicated successfully'
    });

  } catch (error) {
    console.error('❌ Duplicate workspace error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Workspace name already exists',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to duplicate workspace',
      message: 'An error occurred while duplicating the workspace'
    });
  }
});

/**
 * GET /api/workspaces/search/pages
 * Search pages for adding to workspaces
 */
router.get('/search/pages', async (req, res) => {
  try {
    const { q: query, brainId, includeOtherBrains = 'true' } = req.query;
    
    if (!query || query.trim().length === 0) {
      return res.json({
        currentBrain: [],
        otherBrains: [],
        totalResults: 0
      });
    }
    
    if (!brainId || !validateUUID(brainId)) {
      return res.status(400).json({
        error: 'Invalid brain ID',
        message: 'Valid brain ID is required for search'
      });
    }
    
    // Verify brain ownership
    await validateBrainOwnership(brainId, req.session.userId);
    
    // Search pages
    const results = await WorkspaceManager.searchPagesForWorkspace(
      brainId, 
      query.trim(), 
      includeOtherBrains === 'true',
      req.session.userId
    );
    
    res.json(results);

  } catch (error) {
    console.error('❌ Search pages error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to search pages',
      message: 'An error occurred while searching pages'
    });
  }
});

/**
 * GET /api/workspaces/:id/stats
 * Get comprehensive workspace statistics
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'Workspace ID must be a valid UUID'
      });
    }
    
    // Verify ownership
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Get comprehensive stats
    const stats = await WorkspaceManager.getWorkspaceStats(id);
    
    res.json({
      stats,
      message: 'Workspace statistics retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Get workspace stats error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to get workspace statistics',
      message: 'An error occurred while fetching workspace statistics'
    });
  }
});

/**
 * DELETE /api/workspaces/:id/files/:fileId
 * Remove file from workspace
 */
router.delete('/:id/files/:fileId', async (req, res) => {
  try {
    const { id, fileId } = req.params;
    
    if (!validateUUID(id) || !validateUUID(fileId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Workspace ID and file ID must be valid UUIDs'  
      });
    }
    
    // Verify ownership
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Remove file from workspace
    const WorkspaceFile = require('../models/WorkspaceFile');
    const result = await WorkspaceFile.removeFileFromWorkspace(id, fileId);
    
    if (!result.removed) {
      return res.status(404).json({
        error: 'File not found in workspace',
        message: 'The file is not in this workspace'
      });
    }
    
    res.json({
      ...result,
      message: 'File removed from workspace successfully'
    });

  } catch (error) {
    console.error('❌ Remove file from workspace error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to remove file from workspace',
      message: 'An error occurred while removing the file'
    });
  }
});

/**
 * POST /api/workspaces/:id/files
 * Add existing file to workspace
 */
router.post('/:id/files', async (req, res) => {
  try {
    const { id } = req.params;
    const { fileId, position, depth = 0, isCollapsed = false } = req.body;
    
    if (!validateUUID(id)) {
      return res.status(400).json({
        error: 'Invalid workspace ID',
        message: 'Workspace ID must be a valid UUID'
      });
    }
    
    if (!fileId || !validateUUID(fileId)) {
      return res.status(400).json({
        error: 'Invalid file ID',
        message: 'Valid file ID is required'
      });
    }
    
    // Verify ownership
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Add file to workspace
    const WorkspaceFile = require('../models/WorkspaceFile');
    const result = await WorkspaceFile.addFileToWorkspace(id, fileId, position, depth, {
      isCollapsed
    });
    
    res.status(201).json({
      workspaceFile: result,
      message: 'File added to workspace successfully'
    });

  } catch (error) {
    console.error('❌ Add file to workspace error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: 'File already in workspace',
        message: error.message
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to add file to workspace',
      message: 'An error occurred while adding the file'
    });
  }
});

/**
 * PUT /api/workspaces/:id/files/:fileId
 * Update file position in workspace
 */
router.put('/:id/files/:fileId', async (req, res) => {
  try {
    const { id, fileId } = req.params;
    const { position } = req.body;
    
    if (!validateUUID(id) || !validateUUID(fileId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Workspace ID and file ID must be valid UUIDs'
      });
    }
    
    if (position === undefined || !Number.isInteger(position) || position < 0) {
      return res.status(400).json({
        error: 'Invalid position',
        message: 'Position must be a non-negative integer'
      });
    }
    
    // Verify ownership
    await validateWorkspaceOwnership(id, req.session.userId);
    
    // Update file position
    const WorkspaceFile = require('../models/WorkspaceFile');
    const result = await WorkspaceFile.updateFilePosition(id, fileId, position);
    
    res.json({
      ...result,
      message: 'File position updated successfully'
    });

  } catch (error) {
    console.error('❌ Update file position error:', error);
    if (error.message.includes('not found') || error.message.includes('Access denied')) {
      return res.status(error.message.includes('Access denied') ? 403 : 404).json({
        error: error.message.includes('Access denied') ? 'Access denied' : 'Not found',
        message: error.message
      });
    }
    res.status(500).json({
      error: 'Failed to update file position',
      message: 'An error occurred while updating the file position'
    });
  }
});

/**
 * POST /api/workspaces/open-file
 * Create a new workspace with a specific file
 */
router.post('/open-file', async (req, res) => {
  try {
    const { fileId, brainId, workspaceTitle } = req.body;
    
    if (!validateUUID(fileId) || !validateUUID(brainId)) {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'File ID and brain ID must be valid UUIDs'
      });
    }
    
    // Verify file exists and user has access
    const { query } = require('../models/database');
    const fileResult = await query(`
      SELECT f.id, f.file_name, f.brain_id, b.user_id
      FROM files f
      JOIN brains b ON f.brain_id = b.id
      WHERE f.id = $1 AND f.brain_id = $2
    `, [fileId, brainId]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    const file = fileResult.rows[0];
    if (file.user_id !== req.session.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this file'
      });
    }

    // Create new workspace
    const Workspace = require('../models/Workspace');
    const title = workspaceTitle || `${file.file_name}`;
    const workspace = await Workspace.create({
      brainId,
      title,
      userId: req.session.userId
    });

    // Add file to workspace
    const WorkspaceFile = require('../models/WorkspaceFile');
    await WorkspaceFile.addFileToWorkspace(workspace.id, fileId, 0); // Position 0 (first item)

    res.status(201).json({
      success: true,
      workspace: {
        id: workspace.id,
        title: workspace.title,
        brainId: workspace.brainId,
        createdAt: workspace.createdAt
      },
      fileId,
      fileName: file.file_name,
      message: `Created new workspace "${title}" with file`
    });

  } catch (error) {
    console.error('❌ Open file in workspace error:', error);
    res.status(500).json({
      error: 'Failed to open file in workspace',
      message: 'An error occurred while creating the workspace'
    });
  }
});

module.exports = router;