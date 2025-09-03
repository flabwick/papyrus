const express = require('express');
const { AIProviderService } = require('../services/aiProviders');
const CardFactory = require('../services/CardFactory');
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
 * GET /api/ai/stream/:cardId
 * Stream AI generation for a specific card
 */
router.get('/stream/:cardId', requireAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    console.log('📨 AI stream request for card:', cardId);
    
    if (!cardId || !validateUUID(cardId)) {
      return res.status(400).json({
        error: 'Invalid card ID',
        message: 'A valid card ID is required'
      });
    }

    // Get card details to extract generation parameters
    const cardResult = await query(
      'SELECT brain_id, content_preview FROM cards WHERE id = $1',
      [cardId]
    );
    
    if (cardResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Card not found',
        message: 'The specified card does not exist'
      });
    }

    const brainId = cardResult.rows[0].brain_id;
    
    // Parse generation parameters from content_preview
    let params;
    try {
      params = JSON.parse(cardResult.rows[0].content_preview || '{}');
    } catch (e) {
      params = { prompt: 'Generate content', model: 'gpt-4o', contextCardIds: [] };
    }

    const { prompt = 'Generate content', model = 'gpt-4o', contextCardIds = [] } = params;
    
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
      
      // Update card in database
      await query('UPDATE cards SET content_preview = $1 WHERE id = $2', [currentContent, cardId]);
      
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

    // Get context cards if specified and format them properly
    const context = [];
    if (contextCardIds.length > 0) {
      const contextResult = await query(
        'SELECT id, title, content_preview as content, created_at FROM cards WHERE id = ANY($1) AND brain_id = $2 ORDER BY created_at ASC',
        [contextCardIds, brainId]
      );
      
      // Format context cards with proper structure for AI
      context.push(...contextResult.rows.map(card => ({
        id: card.id,
        title: card.title || 'Untitled',
        content: card.content || '',
        contextText: `# ${card.title || 'Untitled'}\n\n${card.content || ''}`
      })));
      
      console.log(`📄 Using ${context.length} context cards for AI generation`);
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
    const { brainId, streamId, cardId, prompt, model, contextCardIds = [] } = req.body;
    console.log('📝 Request details:', { brainId, streamId, cardId, model, prompt: prompt?.substring(0, 50) });

    // Store generation parameters in the card for the streaming endpoint to use
    await query(
      'UPDATE cards SET content_preview = $1 WHERE id = $2',
      [JSON.stringify({ prompt, model, contextCardIds, status: 'ready' }), cardId]
    );

    res.json({
      success: true,
      message: 'Generation initiated',
      streamUrl: `/api/ai/stream/${cardId}`
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

module.exports = router;