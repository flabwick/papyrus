const { query, transaction } = require('./database');

/**
 * WorkspaceForm Model
 * Handles the many-to-many relationship between workspaces and forms
 * with position management, AI context, and collapsed state
 */

class WorkspaceForm {
  constructor(data) {
    this.id = data.id;
    this.workspaceId = data.workspace_id;
    this.formId = data.form_id;
    this.position = data.position;
    this.depth = data.depth;
    this.isInAIContext = data.is_in_ai_context;
    this.isCollapsed = data.is_collapsed;
    this.addedAt = data.added_at;
  }

  /**
   * Add a form to a workspace at a specific position
   * @param {string} workspaceId - Workspace ID
   * @param {string} formId - Form ID  
   * @param {number} position - Position in workspace (null for end)
   * @param {number} depth - Nesting depth (default: 0)
   * @param {Object} options - Additional options
   * @returns {Promise<WorkspaceForm>} - Created WorkspaceForm instance
   */
  static async addFormToWorkspace(workspaceId, formId, position = null, depth = 0, options = {}) {
    const { isInAIContext = true, isCollapsed = false } = options;

    return await transaction(async (client) => {
      // Verify workspace exists
      const workspaceResult = await client.query(
        'SELECT id FROM workspaces WHERE id = $1',
        [workspaceId]
      );

      if (workspaceResult.rows.length === 0) {
        throw new Error('Workspace not found');
      }

      // Verify form exists and is active
      const formResult = await client.query(
        'SELECT id FROM forms WHERE id = $1 AND is_active = true',
        [formId]
      );

      if (formResult.rows.length === 0) {
        throw new Error('Form not found or inactive');
      }

      // Check if form already exists in this workspace
      const existingResult = await client.query(
        'SELECT id FROM workspace_forms WHERE workspace_id = $1 AND form_id = $2',
        [workspaceId, formId]
      );

      if (existingResult.rows.length > 0) {
        throw new Error('Form already exists in this workspace');
      }

      // Determine position considering all card types (pages, files, forms)
      let actualPosition = position;
      if (actualPosition === null) {
        const maxPagePos = await client.query(
          'SELECT COALESCE(MAX(position), -1) as max_pos FROM workspace_pages WHERE workspace_id = $1',
          [workspaceId]
        );
        const maxFilePos = await client.query(
          'SELECT COALESCE(MAX(position), -1) as max_pos FROM workspace_files WHERE workspace_id = $1',
          [workspaceId]
        );
        const maxFormPos = await client.query(
          'SELECT COALESCE(MAX(position), -1) as max_pos FROM workspace_forms WHERE workspace_id = $1',
          [workspaceId]
        );
        
        const maxPagePosition = maxPagePos.rows[0].max_pos;
        const maxFilePosition = maxFilePos.rows[0].max_pos;
        const maxFormPosition = maxFormPos.rows[0].max_pos;
        actualPosition = Math.max(maxPagePosition, maxFilePosition, maxFormPosition) + 1;
      } else {
        // Shift existing items at this position and after to make room
        await client.query(
          'UPDATE workspace_pages SET position = position + 1 WHERE workspace_id = $1 AND position >= $2',
          [workspaceId, actualPosition]
        );
        await client.query(
          'UPDATE workspace_files SET position = position + 1 WHERE workspace_id = $1 AND position >= $2',
          [workspaceId, actualPosition]
        );
        await client.query(
          'UPDATE workspace_forms SET position = position + 1 WHERE workspace_id = $1 AND position >= $2',
          [workspaceId, actualPosition]
        );
      }

      // Insert the new workspace_form relationship
      const result = await client.query(`
        INSERT INTO workspace_forms (workspace_id, form_id, position, depth, is_in_ai_context, is_collapsed)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [workspaceId, formId, actualPosition, depth, isInAIContext, isCollapsed]);

      console.log(`✅ Added form ${formId} to workspace ${workspaceId} at position ${actualPosition}`);
      return new WorkspaceForm(result.rows[0]);
    });
  }

  /**
   * Remove a form from a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} formId - Form ID
   * @returns {Promise<boolean>} - True if form was removed
   */
  static async removeFormFromWorkspace(workspaceId, formId) {
    return await transaction(async (client) => {
      // Get the form's position before deleting
      const result = await client.query(
        'SELECT position FROM workspace_forms WHERE workspace_id = $1 AND form_id = $2',
        [workspaceId, formId]
      );

      if (result.rows.length === 0) {
        return false; // Form not in workspace
      }

      const removedPosition = result.rows[0].position;
      console.log(`🗑️  Removing form ${formId.substring(0,8)} from position ${removedPosition} in workspace ${workspaceId.substring(0,8)}`);

      // Delete the form reference
      await client.query(
        'DELETE FROM workspace_forms WHERE workspace_id = $1 AND form_id = $2',
        [workspaceId, formId]
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
      await client.query(
        'UPDATE workspace_forms SET position = position - 1 WHERE workspace_id = $1 AND position > $2',
        [workspaceId, removedPosition]
      );

      console.log(`✅ Removed form ${formId} from workspace ${workspaceId}`);
      return true;
    });
  }

  /**
   * Toggle AI context for a form in a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} formId - Form ID
   * @returns {Promise<boolean>} - New AI context state
   */
  static async toggleAIContext(workspaceId, formId) {
    const result = await query(`
      UPDATE workspace_forms 
      SET is_in_ai_context = NOT is_in_ai_context 
      WHERE workspace_id = $1 AND form_id = $2
      RETURNING is_in_ai_context
    `, [workspaceId, formId]);

    if (result.rows.length === 0) {
      throw new Error('Form not found in workspace');
    }

    const newState = result.rows[0].is_in_ai_context;
    console.log(`✅ Toggled AI context for form ${formId} in workspace ${workspaceId}: ${newState}`);
    return newState;
  }

  /**
   * Toggle collapsed state for a form in a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} formId - Form ID
   * @returns {Promise<boolean>} - New collapsed state
   */
  static async toggleCollapsed(workspaceId, formId) {
    const result = await query(`
      UPDATE workspace_forms 
      SET is_collapsed = NOT is_collapsed 
      WHERE workspace_id = $1 AND form_id = $2
      RETURNING is_collapsed
    `, [workspaceId, formId]);

    if (result.rows.length === 0) {
      throw new Error('Form not found in workspace');
    }

    const newState = result.rows[0].is_collapsed;
    console.log(`✅ Toggled collapsed state for form ${formId} in workspace ${workspaceId}: ${newState}`);
    return newState;
  }

  /**
   * Get all forms in a workspace with their metadata
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array<Object>>} - Array of forms with workspace metadata
   */
  static async getWorkspaceForms(workspaceId) {
    const result = await query(`
      SELECT f.*, wf.position, wf.depth, wf.is_in_ai_context, wf.is_collapsed, wf.added_at
      FROM forms f
      JOIN workspace_forms wf ON f.id = wf.form_id
      WHERE wf.workspace_id = $1 AND f.is_active = true
      ORDER BY wf.position
    `, [workspaceId]);

    const Form = require('./Form');
    const forms = [];
    
    for (const row of result.rows) {
      const form = new Form(row);
      const formData = await form.toJSON(false); // Get form data without full content
      
      // Add workspace-specific metadata
      formData.position = row.position;
      formData.depth = row.depth;
      formData.isInAIContext = row.is_in_ai_context;
      formData.isCollapsed = row.is_collapsed;
      formData.addedAt = row.added_at;
      
      forms.push(formData);
    }
    
    return forms;
  }

  /**
   * Move a form to a different position in the workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} formId - Form ID
   * @param {number} newPosition - New position
   * @returns {Promise<void>}
   */
  static async moveForm(workspaceId, formId, newPosition) {
    return await transaction(async (client) => {
      // Get current position
      const result = await client.query(
        'SELECT position FROM workspace_forms WHERE workspace_id = $1 AND form_id = $2',
        [workspaceId, formId]
      );

      if (result.rows.length === 0) {
        throw new Error('Form not found in workspace');
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
          WHERE workspace_id = $1 AND position > $2 AND position <= $3
        `, [workspaceId, oldPosition, newPosition]);

        await client.query(`
          UPDATE workspace_forms SET position = position - 1 
          WHERE workspace_id = $1 AND position > $2 AND position <= $3 AND form_id != $4
        `, [workspaceId, oldPosition, newPosition, formId]);
      } else {
        // Moving up: shift items down
        await client.query(`
          UPDATE workspace_pages SET position = position + 1 
          WHERE workspace_id = $1 AND position >= $2 AND position < $3
        `, [workspaceId, newPosition, oldPosition]);

        await client.query(`
          UPDATE workspace_files SET position = position + 1 
          WHERE workspace_id = $1 AND position >= $2 AND position < $3
        `, [workspaceId, newPosition, oldPosition]);

        await client.query(`
          UPDATE workspace_forms SET position = position + 1 
          WHERE workspace_id = $1 AND position >= $2 AND position < $3 AND form_id != $4
        `, [workspaceId, newPosition, oldPosition, formId]);
      }

      // Update the form's position
      await client.query(
        'UPDATE workspace_forms SET position = $1 WHERE workspace_id = $2 AND form_id = $3',
        [newPosition, workspaceId, formId]
      );

      console.log(`✅ Moved form ${formId} from position ${oldPosition} to ${newPosition} in workspace ${workspaceId}`);
    });
  }

  /**
   * Get forms in AI context for a workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array<Object>>} - Array of forms in AI context
   */
  static async getAIContextForms(workspaceId) {
    const result = await query(`
      SELECT f.id, f.title, f.content, wf.position, wf.depth
      FROM forms f
      JOIN workspace_forms wf ON f.id = wf.form_id
      WHERE wf.workspace_id = $1 AND wf.is_in_ai_context = true AND f.is_active = true
      ORDER BY wf.position
    `, [workspaceId]);

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      position: row.position,
      depth: row.depth,
      itemType: 'form'
    }));
  }
}

module.exports = WorkspaceForm;
