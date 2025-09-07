const { query, transaction } = require('./database');

/**
 * WorkspaceFile Model
 * Handles file references in workspaces (separate from pages)
 * Files and pages are different entities that can both appear in workspaces
 */

class WorkspaceFile {
  constructor(data) {
    this.id = data.id;
    this.workspaceId = data.workspace_id;
    this.fileId = data.file_id;
    this.position = data.position;
    this.depth = data.depth;
    this.isCollapsed = data.is_collapsed;
    this.addedAt = data.added_at;
  }

  /**
   * Add a file to a workspace at a specific position
   * @param {string} workspaceId - Workspace ID
   * @param {string} fileId - File ID  
   * @param {number} position - Position in workspace (null for end)
   * @param {number} depth - Nesting depth (default: 0)
   * @param {Object} options - Additional options
   * @returns {Promise<WorkspaceFile>} - Created WorkspaceFile instance
   */
  static async addFileToWorkspace(workspaceId, fileId, position = null, depth = 0, options = {}) {
    const { isCollapsed = false } = options;

    return await transaction(async (client) => {
      // Verify workspace exists
      const workspaceResult = await client.query(
        'SELECT id FROM workspaces WHERE id = $1',
        [workspaceId]
      );

      if (workspaceResult.rows.length === 0) {
        throw new Error('Workspace not found');
      }

      // Verify file exists
      const fileResult = await client.query(
        'SELECT id FROM files WHERE id = $1',
        [fileId]
      );

      if (fileResult.rows.length === 0) {
        throw new Error('File not found');
      }

      // Check if file is already in this workspace
      const existingEntry = await client.query(
        'SELECT id FROM workspace_files WHERE workspace_id = $1 AND file_id = $2',
        [workspaceId, fileId]
      );

      if (existingEntry.rows.length > 0) {
        throw new Error('File is already in this workspace');
      }

      // Determine position
      let actualPosition = position;
      if (actualPosition === null) {
        // Get next available position considering both pages and files
        const maxPagePos = await client.query(
          'SELECT COALESCE(MAX(position), -1) as max_pos FROM workspace_pages WHERE workspace_id = $1',
          [workspaceId]
        );
        const maxFilePos = await client.query(
          'SELECT COALESCE(MAX(position), -1) as max_pos FROM workspace_files WHERE workspace_id = $1',
          [workspaceId]
        );
        
        const maxPagePosition = maxPagePos.rows[0].max_pos;
        const maxFilePosition = maxFilePos.rows[0].max_pos;
        actualPosition = Math.max(maxPagePosition, maxFilePosition) + 1;
      } else {
        // Shift existing items to make room
        await client.query(
          'UPDATE workspace_pages SET position = position + 1 WHERE workspace_id = $1 AND position >= $2',
          [workspaceId, actualPosition]
        );
        await client.query(
          'UPDATE workspace_files SET position = position + 1 WHERE workspace_id = $1 AND position >= $2',
          [workspaceId, actualPosition]
        );
      }

      // Insert the file reference
      const result = await client.query(`
        INSERT INTO workspace_files (workspace_id, file_id, position, depth, is_collapsed)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [workspaceId, fileId, actualPosition, depth, isCollapsed]);

      console.log(`✅ Added file ${fileId} to workspace ${workspaceId} at position ${actualPosition}`);
      return new WorkspaceFile(result.rows[0]);
    });
  }


  /**
   * Get all files in a workspace with their metadata
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array<Object>>} - Array of files with workspace metadata
   */
  static async getWorkspaceFiles(workspaceId) {
    const result = await query(`
      SELECT f.*, wf.position, wf.depth, wf.is_collapsed, wf.added_at
      FROM files f
      JOIN workspace_files wf ON f.id = wf.file_id
      WHERE wf.workspace_id = $1
      ORDER BY wf.position
    `, [workspaceId]);

    return result.rows.map(row => ({
      id: row.id,
      libraryId: row.library_id,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      filePath: row.file_path,
      // PDF metadata
      pdfPageCount: row.pdf_page_count,
      pdfAuthor: row.pdf_author,
      pdfTitle: row.pdf_title,
      // EPUB metadata  
      epubTitle: row.epub_title,
      epubAuthor: row.epub_author,
      epubDescription: row.epub_description,
      epubChapterCount: row.epub_chapter_count,
      coverImagePath: row.cover_image_path,
      // Common metadata
      contentPreview: row.content_preview,
      processingStatus: row.processing_status,
      uploadedAt: row.uploaded_at,
      // Workspace-specific metadata
      position: row.position,
      depth: row.depth,
      isCollapsed: row.is_collapsed,
      addedAt: row.added_at,
      // Mark as file for frontend
      itemType: 'file'
    }));
  }

  /**
   * Get mixed workspace items (both pages and files) in position order
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array<Object>>} - Array of mixed workspace items
   */
  static async getWorkspaceItems(workspaceId) {
    const items = [];
    const Page = require('./Page');

    // Get pages from workspace
    const pagesResult = await query(`
      SELECT 
        'page' as item_type,
        wp.position,
        wp.depth,
        wp.is_collapsed,
        wp.added_at,
        wp.page_id,
        null as file_id
      FROM workspace_pages wp
      WHERE wp.workspace_id = $1
    `, [workspaceId]);

    // Get files from workspace
    const filesResult = await query(`
      SELECT 
        'file' as item_type,
        wf.position,
        wf.depth,
        wf.is_collapsed,
        wf.added_at,
        null as page_id,
        wf.file_id
      FROM workspace_files wf
      WHERE wf.workspace_id = $1
    `, [workspaceId]);

    // Combine and sort by position
    const allRows = [...pagesResult.rows, ...filesResult.rows].sort((a, b) => a.position - b.position);

    for (const row of allRows) {
      if (row.item_type === 'page') {
        // Get full page data
        const page = await Page.findById(row.page_id);
        if (page) {
          const pageData = await page.toJSON(false);
          pageData.position = row.position;
          pageData.depth = row.depth;
          pageData.isCollapsed = row.is_collapsed;
          pageData.addedAt = row.added_at;
          pageData.itemType = 'card';
          items.push(pageData);
        }
      } else if (row.item_type === 'file') {
        // Get full file data
        const fileResult = await query(`
          SELECT f.*, wf.position, wf.depth, wf.is_collapsed, wf.added_at
          FROM files f
          JOIN workspace_files wf ON f.id = wf.file_id
          WHERE wf.file_id = $1 AND wf.workspace_id = $2
        `, [row.file_id, workspaceId]);

        if (fileResult.rows.length > 0) {
          const fileRow = fileResult.rows[0];
          const fileData = {
            id: fileRow.id,
            libraryId: fileRow.library_id,
            fileName: fileRow.file_name,
            fileType: fileRow.file_type,
            fileSize: parseInt(fileRow.file_size), // Ensure it's a number
            filePath: fileRow.file_path,
            // Metadata based on file type
            title: fileRow.file_type === 'epub' ? fileRow.epub_title : 
                   fileRow.file_type === 'pdf' ? fileRow.pdf_title :
                   fileRow.content_preview, // For images, use content preview as title
            author: fileRow.file_type === 'epub' ? fileRow.epub_author : fileRow.pdf_author,
            description: fileRow.epub_description,
            pageCount: fileRow.pdf_page_count,
            chapterCount: fileRow.epub_chapter_count,
            coverImagePath: fileRow.cover_image_path,
            // Common fields
            contentPreview: fileRow.content_preview,
            processingStatus: fileRow.processing_status,
            uploadedAt: fileRow.uploaded_at,
            // Workspace metadata - ensure these are properly set
            position: parseInt(fileRow.position),
            depth: parseInt(fileRow.depth || 0),
            isCollapsed: fileRow.is_collapsed || false,
            addedAt: fileRow.added_at,
            itemType: 'file',
            // Additional fields that frontend might expect
            hasFile: true,
            lastModified: fileRow.updated_at || fileRow.uploaded_at,
            createdAt: fileRow.created_at || fileRow.uploaded_at,
            updatedAt: fileRow.updated_at || fileRow.uploaded_at
          };
          items.push(fileData);
        }
      }
    }

    return items;
  }

  /**
   * Move a file to a different position in the workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} fileId - File ID
   * @param {number} newPosition - New position
   * @returns {Promise<void>}
   */
  static async moveFile(workspaceId, fileId, newPosition) {
    return await transaction(async (client) => {
      // Get current position
      const result = await client.query(
        'SELECT position FROM workspace_files WHERE workspace_id = $1 AND file_id = $2',
        [workspaceId, fileId]
      );

      if (result.rows.length === 0) {
        throw new Error('File not found in workspace');
      }

      const oldPosition = result.rows[0].position;

      if (oldPosition === newPosition) {
        return; // No change needed
      }

      if (newPosition > oldPosition) {
        // Moving down: shift items up
        await client.query(`
          UPDATE workspace_pages SET position = position - 1 
          WHERE workspace_id = $1 AND position > $2 AND position <= $3
        `, [workspaceId, oldPosition, newPosition]);

        await client.query(`
          UPDATE workspace_files SET position = position - 1 
          WHERE workspace_id = $1 AND position > $2 AND position <= $3 AND file_id != $4
        `, [workspaceId, oldPosition, newPosition, fileId]);
      } else {
        // Moving up: shift items down
        await client.query(`
          UPDATE workspace_pages SET position = position + 1 
          WHERE workspace_id = $1 AND position >= $2 AND position < $3
        `, [workspaceId, newPosition, oldPosition]);

        await client.query(`
          UPDATE workspace_files SET position = position + 1 
          WHERE workspace_id = $1 AND position >= $2 AND position < $3 AND file_id != $4
        `, [workspaceId, newPosition, oldPosition, fileId]);
      }

      // Update the file's position
      await client.query(
        'UPDATE workspace_files SET position = $1 WHERE workspace_id = $2 AND file_id = $3',
        [newPosition, workspaceId, fileId]
      );

      console.log(`✅ Moved file ${fileId} from position ${oldPosition} to ${newPosition} in workspace ${workspaceId}`);
    });
  }

  /**
   * Remove file from workspace (returns status for API)
   * @param {string} workspaceId - Workspace ID
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} - Result with removed status
   */
  static async removeFileFromWorkspace(workspaceId, fileId) {
    try {
      // Get the file's position before deleting
      const result = await query(
        'SELECT position FROM workspace_files WHERE workspace_id = $1 AND file_id = $2',
        [workspaceId, fileId]
      );

      if (result.rows.length === 0) {
        return { removed: false, error: 'File not found in workspace' };
      }

      const removedPosition = result.rows[0].position;

      await transaction(async (client) => {
        // Delete the file reference
        await client.query(
          'DELETE FROM workspace_files WHERE workspace_id = $1 AND file_id = $2',
          [workspaceId, fileId]
        );

        // Compact positions - shift everything down
        await client.query(
          'UPDATE workspace_pages SET position = position - 1 WHERE workspace_id = $1 AND position > $2',
          [workspaceId, removedPosition]
        );
        await client.query(
          'UPDATE workspace_files SET position = position - 1 WHERE workspace_id = $1 AND position > $2',
          [workspaceId, removedPosition]
        );
      });

      console.log(`✅ Removed file ${fileId} from workspace ${workspaceId}`);
      return { removed: true, fileId, workspaceId, removedPosition };
    } catch (error) {
      console.error('❌ Error removing file from stream:', error);
      return { removed: false, error: error.message };
    }
  }

  /**
   * Update file position in workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} fileId - File ID
   * @param {number} newPosition - New position
   * @returns {Promise<Object>} - Result with updated status
   */
  static async updateFilePosition(workspaceId, fileId, newPosition) {
    try {
      await this.moveFile(workspaceId, fileId, newPosition);
      return { updated: true, fileId, workspaceId, newPosition };
    } catch (error) {
      console.error('❌ Error updating file position:', error);
      return { updated: false, error: error.message };
    }
  }
}

module.exports = WorkspaceFile;