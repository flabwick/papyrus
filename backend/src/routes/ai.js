const express = require('express');
const { AIProviderService } = require('../services/aiProviders');
const PageFactory = require('../services/PageFactory');
const { query } = require('../models/database');
const { requireAuth } = require('../middleware/auth');

// UUID validation helper
const validateUUID = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const router = express.Router();
const aiService = new AIProviderService();

/**
 * GET /api/ai/test
 * Test AI service availability (no auth required)
 */
router.get('/test', async (req, res) => {
  try {
    const models = aiService.getAvailableModels();
    res.json({ 
      status: 'ok',
      modelsAvailable: models.length,
      providers: {
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        google: !!process.env.GOOGLE_AI_API_KEY
      }
    });
  } catch (error) {
    console.error('❌ AI test error:', error);
    res.status(500).json({
      error: 'AI service error',
      message: error.message
    });
  }
});

/**
 * POST /api/ai/test-generate
 * Test AI generation without streaming (for debugging)
 */
router.post('/test-generate', requireAuth, async (req, res) => {
  try {
    const { prompt, model } = req.body;
    console.log('🧪 Testing AI generation with model:', model);
    
    const models = aiService.getAvailableModels();
    const selectedModel = models.find(m => m.id === model);
    
    if (!selectedModel) {
      return res.status(400).json({
        error: 'Model not found',
        availableModels: models.map(m => m.id)
      });
    }
    
    res.json({
      status: 'would_generate',
      model: selectedModel.name,
      prompt: prompt.substring(0, 100),
      provider: selectedModel.provider
    });
    
  } catch (error) {
    console.error('❌ AI test generate error:', error);
    res.status(500).json({
      error: 'Test generation failed',
      message: error.message,
      stack: error.stack
    });
  }
});

/**
 * GET /api/ai/models
 * Get available AI models
 */
router.get('/models', requireAuth, async (req, res) => {
  try {
    const models = aiService.getAvailableModels();
    res.json({ models });
  } catch (error) {
    console.error('❌ Get AI models error:', error);
    res.status(500).json({
      error: 'Failed to get AI models',
      message: error.message
    });
  }
});

/**
 * GET /api/ai/stream/:pageId
 * Stream AI generation for a specific page
 */
router.get('/stream/:pageId', requireAuth, async (req, res) => {
  try {
    const { pageId } = req.params;
    console.log('📨 AI stream request for page:', pageId);
    
    if (!pageId || !validateUUID(pageId)) {
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'A valid page ID is required'
      });
    }

    // Get page details to extract generation parameters
    const pageResult = await query(
      'SELECT library_id, content_preview FROM pages WHERE id = $1',
      [pageId]
    );
    
    if (pageResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Page not found',
        message: 'The specified page does not exist'
      });
    }

    const libraryId = pageResult.rows[0].library_id;
    
    // Parse generation parameters from content_preview
    let params;
    try {
      params = JSON.parse(pageResult.rows[0].content_preview || '{}');
    } catch (e) {
      params = { prompt: 'Generate content', model: 'gpt-4o', contextPageIds: [] };
    }

    const { prompt = 'Generate content', model = 'gpt-4o', contextPageIds = [] } = params;
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': req.headers.origin || 'https://dev.jimboslice.xyz',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Cache-Control, Content-Type'
    });

    res.write(`data: ${JSON.stringify({
      type: 'start',
      model: model
    })}\n\n`);

    console.log(`🤖 Starting real AI generation with ${model} for prompt: ${prompt.substring(0, 50)}...`);

    let currentContent = '';

    const onChunk = async (chunk) => {
      currentContent += chunk;
      
      // Update page in database
      await query('UPDATE pages SET content_preview = $1 WHERE id = $2', [currentContent, pageId]);
      
      res.write(`data: ${JSON.stringify({
        type: 'chunk',
        content: chunk,
        totalContent: currentContent
      })}\n\n`);
    };

    const onComplete = () => {
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        totalContent: currentContent
      })}\n\n`);
      res.end();
    };

    const onError = (error) => {
      console.error('AI generation error:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error.message
      })}\n\n`);
      res.end();
    };

    // Get context pages if specified and format them properly
    const context = [];
    if (contextPageIds.length > 0) {
      const contextResult = await query(
        'SELECT id, title, content_preview as content, created_at FROM pages WHERE id = ANY($1) AND library_id = $2 ORDER BY created_at ASC',
        [contextPageIds, libraryId]
      );
      
      // Format context pages with proper structure for AI
      context.push(...contextResult.rows.map(page => ({
        id: page.id,
        title: page.title || 'Untitled',
        content: page.content || '',
        contextText: `# ${page.title || 'Untitled'}\n\n${page.content || ''}`
      })));
      
      console.log(`📄 Using ${context.length} context pages for AI generation`);
    }

    try {
      // Use the AI service for real generation
      await aiService.generateStreaming(model, prompt, context, onChunk, onComplete, onError);
    } catch (error) {
      console.error('❌ AI Service Error:', error);
      onError(error);
    }

  } catch (error) {
    console.error('❌ AI stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to stream AI content',
        message: error.message
      });
    }
  }
});

/**
 * POST /api/ai/generate-streaming
 * Generate AI content with streaming response (original endpoint)
 */
router.post('/generate-streaming', requireAuth, async (req, res) => {
  try {
    console.log('📨 AI generate streaming request received');
    const { brainId, streamId, pageId, prompt, model, contextPageIds = [] } = req.body;
    console.log('📝 Request details:', { brainId, streamId, pageId, model, prompt: prompt?.substring(0, 50) });

    // Store generation parameters in the page for the streaming endpoint to use
    await query(
      'UPDATE pages SET content_preview = $1 WHERE id = $2',
      [JSON.stringify({ prompt, model, contextPageIds, status: 'ready' }), pageId]
    );

    res.json({
      success: true,
      message: 'Generation initiated',
      streamUrl: `/api/ai/stream/${pageId}`
    });

  } catch (error) {
    console.error('❌ AI generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to generate AI content',
        message: error.message
      });
    } else {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error.message
      })}\n\n`);
      res.end();
    }
  }
});

/**
 * POST /api/ai/generate-form
 * Generate a form using AI with DSL instructions
 */
router.post('/generate-form', requireAuth, async (req, res) => {
  try {
    const { libraryId, workspaceId, prompt, model, position } = req.body;
    
    if (!libraryId || !workspaceId || !prompt) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'libraryId, workspaceId, and prompt are required'
      });
    }

    // Import required services
    const { AIProviderService } = require('../services/aiProviders');
    const Form = require('../models/Form');
    const WorkspaceForm = require('../models/WorkspaceForm');
    
    const aiService = new AIProviderService();
    
    // Get available models and select the requested one
    const models = aiService.getAvailableModels();
    const selectedModel = models.find(m => m.id === model) || models[0];
    
    if (!selectedModel) {
      return res.status(400).json({
        error: 'No AI models available',
        message: 'Unable to generate form without AI model'
      });
    }
    
    // Generate form DSL using AI with specific instructions
    const formSystemPrompt = `You are a form DSL generator. Create a YAML form definition that follows this EXACT format:

form:
  title: "Form Title"
  blocks:
    - block_type: "text"
      id: "unique_id"
      content: "**Markdown** content with *formatting*"
    
    - block_type: "textbox" 
      id: "unique_id"
      label: "Input label"
      required: true
      placeholder: "Placeholder text"
      style: "single"
    
    - block_type: "colour"
      id: "unique_id"
      colour: "#FF5733"
      label: "Colour Label"
      height: 40
    
    - block_type: "equation"
      id: "unique_id"
      equation: "E = mc^2"
      label: "Einstein's Mass-Energy Equivalence"
      display: true
    
    - block_type: "button"
      id: "unique_id"
      text: "Button text"
      action_type: "workspace_operation"
      workspace_operation:
        type: "create_card"
        position: "below"
        title: "Result: {{field_id.value}}"
        content: |
          # Generated Content
          
          User input: {{field_id.value}}

WORKSPACE OPERATIONS:

1. CREATE_CARD - Creates new pages with template content:
   workspace_operation:
     type: "create_card"
     position: "below"        # above|below|top|bottom
     title: "Page: {{field.value}}"
     content: |
       # {{title_field.value}}
       
       Content with {{variable.value}} substitution.

2. GENERATE (Page) - AI-powered page generation with streaming:
   workspace_operation:
     type: "generate"
     output_type: "page"
     position: "below"
     prompt: "Write about {{topic.value}} using {{method.value}}"

3. GENERATE (Form) - AI-powered form generation:
   workspace_operation:
     type: "generate"
     output_type: "form"
     position: "below"
     prompt: "Create a form for {{purpose.value}} with relevant fields"

SUPPORTED BLOCK TYPES:

1. TEXT BLOCK - Displays markdown-formatted content:
   - block_type: "text"
   - content: "**Bold**, *italic*, # headers, - lists, etc."
   - Supports full markdown syntax including links, images, code blocks

2. TEXTBOX BLOCK - User input fields:
   - block_type: "textbox"
   - style: "single" (one line) or "multi" (textarea)
   - required: true/false
   - placeholder: hint text

3. COLOUR BLOCK - Visual colour indicators for marking and tone:
   - block_type: "colour"
   - colour: "#FF5733" (hex), "rgb(255,87,51)", or "red" (named)
   - height: pixel height (default 40)
   - label: optional description
   - Use for: mood indicators, priority levels, categories, status

4. EQUATION BLOCK - LaTeX mathematical equations:
   - block_type: "equation"
   - equation: "E = mc^2" (LaTeX syntax)
   - display: true (block mode) or false (inline mode)
   - label: optional description
   - Examples: "\\frac{a}{b}", "\\sum_{i=1}^{n} x_i", "\\int_0^\\infty e^{-x} dx"

5. BUTTON BLOCK - Interactive actions:
   - block_type: "button"
   - action_type: "workspace_operation" (only supported type)
   - workspace_operation: see above for types

IMPORTANT RULES:
1. Use ONLY the block types listed above
2. Each block must have a unique "id" field using snake_case
3. TEXT blocks now support full markdown - use it for rich formatting
4. COLOUR blocks are perfect for visual organization and mood/priority indication
5. EQUATION blocks use LaTeX syntax - escape backslashes properly in YAML
6. Reference form values using {{field_id.value}} syntax
7. For multi-line content, use YAML literal block syntax with |
8. Always specify position for workspace operations

User request: ${prompt}`;

    const aiResponse = await aiService.generateContent(formSystemPrompt, selectedModel.id);
    
    // Create timestamp for form title
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const formTitle = `Generated Form (${timestamp})`;
    
    // Create new form with generated DSL
    const newForm = await Form.create(
      libraryId,
      formTitle,
      aiResponse,
      {}
    );
    
    // Add form to workspace at specified position
    await WorkspaceForm.addFormToWorkspace(workspaceId, newForm.id, position);
    
    res.status(201).json({
      success: true,
      form: {
        id: newForm.id,
        title: formTitle,
        content: aiResponse
      },
      message: 'Form generated successfully'
    });
    
  } catch (error) {
    console.error('❌ AI form generation error:', error);
    res.status(500).json({
      error: 'Failed to generate form',
      message: error.message || 'An error occurred while generating the form'
    });
  }
});

module.exports = router;