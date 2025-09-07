const express = require('express');
const router = express.Router();
const Form = require('../models/Form');
const WorkspaceForm = require('../models/WorkspaceForm');
const Library = require('../models/Library');
const Page = require('../models/Page');
const WorkspacePage = require('../models/WorkspacePage');
const FormDSLParser = require('../services/formDSLParser');
const { requireAuth } = require('../middleware/auth');

// All form routes require authentication
router.use(requireAuth);

// Input validation helpers
const validateUUID = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const validateLibraryOwnership = async (libraryId, userId) => {
  const library = await Library.findById(libraryId);
  if (!library) {
    throw new Error('Library not found');
  }
  if (library.userId !== userId) {
    throw new Error('Access denied to library');
  }
  return library;
};

const getFormPositionInWorkspace = async (workspaceId, formId) => {
  const { query } = require('../models/database');
  const result = await query(
    'SELECT position FROM workspace_forms WHERE workspace_id = $1 AND form_id = $2',
    [workspaceId, formId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Form not found in workspace');
  }
  
  return result.rows[0].position;
};

/**
 * GET /api/forms/:libraryId
 * Get all forms in a library
 */
router.get('/:libraryId', async (req, res) => {
  try {
    const { libraryId } = req.params;
    const { limit = 50, orderBy = 'created_at DESC' } = req.query;

    if (!validateUUID(libraryId)) {
      return res.status(400).json({ error: 'Invalid library ID format' });
    }

    // Verify library ownership
    await validateLibraryOwnership(libraryId, req.session.userId);

    const forms = await Form.findByLibraryId(libraryId, { 
      limit: parseInt(limit), 
      orderBy 
    });

    const formData = await Promise.all(
      forms.map(form => form.toJSON(false))
    );

    res.json({
      forms: formData,
      total: formData.length
    });

  } catch (error) {
    console.error('❌ Error fetching forms:', error.message);
    res.status(error.message.includes('not found') || error.message.includes('Access denied') ? 404 : 500)
       .json({ error: error.message });
  }
});

/**
 * POST /api/forms/:libraryId
 * Create a new form in a library
 */
router.post('/:libraryId', async (req, res) => {
  try {
    const { libraryId } = req.params;
    const { title = 'Untitled Form', content = '', formData = {} } = req.body;

    if (!validateUUID(libraryId)) {
      return res.status(400).json({ error: 'Invalid library ID format' });
    }

    // Verify library ownership
    await validateLibraryOwnership(libraryId, req.session.userId);

    const form = await Form.create(libraryId, title, content, formData);
    const responseData = await form.toJSON(true);

    res.status(201).json({
      message: 'Form created successfully',
      form: responseData
    });

  } catch (error) {
    console.error('❌ Error creating form:', error.message);
    res.status(error.message.includes('not found') || error.message.includes('Access denied') ? 404 : 500)
       .json({ error: error.message });
  }
});

/**
 * GET /api/forms/form/:formId
 * Get a specific form by ID
 */
router.get('/form/:formId', async (req, res) => {
  try {
    const { formId } = req.params;
    const { includeContent = true } = req.query;

    if (!validateUUID(formId)) {
      return res.status(400).json({ error: 'Invalid form ID format' });
    }

    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Verify library ownership
    await validateLibraryOwnership(form.libraryId, req.session.userId);

    const formData = await form.toJSON(includeContent === 'true');

    res.json({ form: formData });

  } catch (error) {
    console.error('❌ Error fetching form:', error.message);
    res.status(error.message.includes('not found') || error.message.includes('Access denied') ? 404 : 500)
       .json({ error: error.message });
  }
});

/**
 * PUT /api/forms/form/:formId
 * Update a form
 */
router.put('/form/:formId', async (req, res) => {
  try {
    const { formId } = req.params;
    const updates = req.body;

    if (!validateUUID(formId)) {
      return res.status(400).json({ error: 'Invalid form ID format' });
    }

    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Verify library ownership
    await validateLibraryOwnership(form.libraryId, req.session.userId);

    await form.update(updates);
    const updatedFormData = await form.toJSON(true);

    res.json({
      message: 'Form updated successfully',
      form: updatedFormData
    });

  } catch (error) {
    console.error('❌ Error updating form:', error.message);
    res.status(error.message.includes('not found') || error.message.includes('Access denied') ? 404 : 500)
       .json({ error: error.message });
  }
});

/**
 * DELETE /api/forms/form/:formId
 * Delete a form (soft delete)
 */
router.delete('/form/:formId', async (req, res) => {
  try {
    const { formId } = req.params;

    if (!validateUUID(formId)) {
      return res.status(400).json({ error: 'Invalid form ID format' });
    }

    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Verify library ownership
    await validateLibraryOwnership(form.libraryId, req.session.userId);

    await form.delete();

    res.json({
      message: 'Form deleted successfully',
      formId: form.id
    });

  } catch (error) {
    console.error('❌ Error deleting form:', error.message);
    res.status(error.message.includes('not found') || error.message.includes('Access denied') ? 404 : 500)
       .json({ error: error.message });
  }
});

/**
 * GET /api/forms/search/:libraryId
 * Search forms in a library
 */
router.get('/search/:libraryId', async (req, res) => {
  try {
    const { libraryId } = req.params;
    const { q: searchTerm, limit = 50 } = req.query;

    if (!validateUUID(libraryId)) {
      return res.status(400).json({ error: 'Invalid library ID format' });
    }

    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({ error: 'Search term is required' });
    }

    // Verify library ownership
    await validateLibraryOwnership(libraryId, req.session.userId);

    const forms = await Form.search(libraryId, searchTerm.trim(), { 
      limit: parseInt(limit) 
    });

    const formData = await Promise.all(
      forms.map(form => form.toJSON(false))
    );

    res.json({
      forms: formData,
      total: formData.length,
      searchTerm: searchTerm.trim()
    });

  } catch (error) {
    console.error('❌ Error searching forms:', error.message);
    res.status(error.message.includes('not found') || error.message.includes('Access denied') ? 404 : 500)
       .json({ error: error.message });
  }
});

/**
 * POST /api/forms/form/:formId/execute
 * Execute workspace operation from form
 */
router.post('/form/:formId/execute', async (req, res) => {
  try {
    const { formId } = req.params;
    const { workspaceId, blockId, formState = {} } = req.body;

    if (!validateUUID(formId) || !validateUUID(workspaceId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const form = await Form.findById(formId);
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Verify library ownership
    await validateLibraryOwnership(form.libraryId, req.session.userId);

    // Parse form DSL
    let formDefinition;
    try {
      formDefinition = FormDSLParser.parseFormDSL(form.content);
    } catch (error) {
      return res.status(400).json({ error: `Form DSL error: ${error.message}` });
    }

    // Find the button block
    const buttonBlock = formDefinition.blocks.find(block => 
      block.id === blockId && block.blockType === 'button'
    );

    if (!buttonBlock) {
      return res.status(400).json({ error: 'Button block not found' });
    }

    // Validate form state
    const validation = FormDSLParser.validateFormState(formDefinition, formState);
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Form validation failed', 
        details: validation.errors 
      });
    }

    // Execute workspace operation
    const operation = buttonBlock.workspaceOperation;
    let result;

    if (operation.type === 'create_card') {
      // Debug form state and operation
      console.log('📋 Form state received:', JSON.stringify(formState, null, 2));
      console.log('🎯 Operation details:', JSON.stringify(operation, null, 2));
      
      // Resolve template variables
      const resolvedTitle = FormDSLParser.resolveTemplateVariables(operation.title, formState);
      const resolvedContent = FormDSLParser.resolveTemplateVariables(operation.content, formState);

      console.log('🔧 Template resolution:');
      const resolveVariable = (variable) => {
        if (formState[variable]) {
          return formState[variable].value || '';
        } else {
          return `{{${variable}}}`; // Return original if not found
        }
      };
      console.log('  - Original title:', operation.title);
      console.log('  - Resolved title:', resolvedTitle);
      console.log('  - Original content:', operation.content);
      console.log('  - Resolved content:', resolvedContent);
      console.log('🔧 Creating page with:', { resolvedTitle, resolvedContent, libraryId: form.libraryId });

      // Create new page
      
      const page = await Page.create(
        form.libraryId,
        resolvedTitle,
        {
          content: resolvedContent,
          pageType: 'saved'
        }
      );


      // Calculate position based on operation.position
      let targetPosition = null;
      
      if (operation.position === 'above') {
        // Find form's position in workspace and place above it
        const formPosition = await getFormPositionInWorkspace(workspaceId, formId);
        targetPosition = formPosition;
      } else if (operation.position === 'below') {
        // Find form's position in workspace and place below it
        const formPosition = await getFormPositionInWorkspace(workspaceId, formId);
        targetPosition = formPosition + 1;
      } else if (operation.position === 'top') {
        targetPosition = 0;
      } else if (operation.position === 'bottom') {
        targetPosition = null; // null means add at end
      }

      // Add page to workspace at calculated position
      await WorkspacePage.addPageToWorkspace(workspaceId, page.id, targetPosition);


      result = {
        type: 'page_created',
        pageId: page.id,
        title: resolvedTitle
      };

    } else if (operation.type === 'generate') {
      // Resolve template variables in prompt
      const resolvedPrompt = FormDSLParser.resolveTemplateVariables(operation.prompt, formState);
      const outputType = operation.output_type || 'page';
      
      
      if (outputType === 'page') {
        // Generate streaming page (untitled)
        const generationParams = {
          prompt: resolvedPrompt,
          model: 'claude-3-5-sonnet-20241022',
          contextPageIds: [],
          formGenerated: true
        };
        
        
        const page = await Page.create(
          form.libraryId,
          null, // No title for streaming pages
          {
            content: JSON.stringify(generationParams),
            pageType: 'unsaved',
            streamId: workspaceId // Required for untitled pages
          }
        );

        
        result = {
          type: 'page_generated',
          pageId: page.id,
          prompt: resolvedPrompt,
          streaming: true
        };
        
      } else if (outputType === 'form') {
        // Generate form DSL (non-streaming)
        const { AIProviderService } = require('../services/aiProviders');
        const aiService = new AIProviderService();
        
        // Add DSL instructions to the prompt
        const dslInstructions = `\n\nIMPORTANT: Respond ONLY with valid YAML form DSL. Use this format:\n\nform:\n  title: "Your Form Title"\n  blocks:\n    - block_type: "text"\n      id: "intro"\n      content: "Introduction text"\n    - block_type: "textbox"\n      id: "field1"\n      label: "Field Label:"\n      required: true\n      style: "single"\n    - block_type: "button"\n      id: "submit"\n      text: "Submit"\n      action_type: "workspace_operation"\n      workspace_operation:\n        type: "create_card"\n        title: "Result: {{field1.value}}"\n        content: "Generated content"\n\nDo not include any explanation or markdown formatting, just the YAML.`;
        
        const fullPrompt = resolvedPrompt + dslInstructions;
        
        
        try {
          const models = aiService.getAvailableModels();
          const model = models.find(m => m.id === 'claude-3-5-sonnet-20241022') || models[0];
          
          if (!model) {
            throw new Error('No AI models available');
          }
          
          const aiResponse = await aiService.generateContent(fullPrompt, model.id);
          
          
          // Create new form with generated DSL
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
          const formTitle = `Generated Form (${timestamp})`;
          
          const newForm = await Form.create(
            form.libraryId,
            formTitle,
            aiResponse,
            {}
          );
          
          // Calculate position and add to workspace
          let targetPosition = null;
          
          if (operation.position === 'above') {
            const formPosition = await getFormPositionInWorkspace(workspaceId, formId);
            targetPosition = formPosition;
          } else if (operation.position === 'below') {
            const formPosition = await getFormPositionInWorkspace(workspaceId, formId);
            targetPosition = formPosition + 1;
          } else if (operation.position === 'top') {
            targetPosition = 0;
          } else if (operation.position === 'bottom') {
            targetPosition = null;
          }
          
          await WorkspaceForm.addFormToWorkspace(workspaceId, newForm.id, targetPosition);
          
          
          result = {
            type: 'form_generated',
            formId: newForm.id,
            title: formTitle,
            prompt: resolvedPrompt,
            streaming: false
          };
          
        } catch (aiError) {
          throw new Error(`AI generation failed: ${aiError.message}`);
        }
      }
    }

    // Update form state
    await form.update({ form_data: formState });

    res.json({
      message: 'Workspace operation executed successfully',
      operation: operation.type,
      result
    });

  } catch (error) {
    console.error('❌ Error executing workspace operation:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/forms/form/:formId/validate
 * Validate form DSL and return parsed structure
 */
router.post('/form/:formId/validate', async (req, res) => {
  try {
    const { formId } = req.params;
    const { content } = req.body;

    if (!validateUUID(formId)) {
      return res.status(400).json({ error: 'Invalid form ID format' });
    }

    // Parse and validate DSL
    const formDefinition = FormDSLParser.parseFormDSL(content);
    const defaultState = FormDSLParser.getDefaultFormState(formDefinition);

    res.json({
      message: 'Form DSL is valid',
      definition: formDefinition,
      defaultState
    });

  } catch (error) {
    console.error('❌ Error validating form DSL:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/forms/example
 * Get example form DSL for reference
 */
router.get('/example', async (req, res) => {
  try {
    const exampleDSL = FormDSLParser.createExampleForm();
    const parsedExample = FormDSLParser.parseFormDSL(exampleDSL);
    const defaultState = FormDSLParser.getDefaultFormState(parsedExample);

    res.json({
      dsl: exampleDSL,
      parsed: parsedExample,
      defaultState
    });

  } catch (error) {
    console.error('❌ Error creating example form:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
