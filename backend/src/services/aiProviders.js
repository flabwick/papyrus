/**
 * AI Provider Service - Centralized AI integration
 * Supports OpenAI, Anthropic, and Google AI models
 */

// Use node-fetch v2 for compatibility
const fetch = require('node-fetch');

class AIProviderService {
  constructor() {
    this.providers = {
      openai: process.env.OPENAI_API_KEY ? new OpenAIProvider(process.env.OPENAI_API_KEY) : null,
      anthropic: process.env.ANTHROPIC_API_KEY ? new AnthropicProvider(process.env.ANTHROPIC_API_KEY) : null,
      google: process.env.GOOGLE_AI_API_KEY ? new GoogleProvider(process.env.GOOGLE_AI_API_KEY) : null,
    };
  }

  getAvailableModels() {
    const models = [];
    
    if (this.providers.openai) {
      models.push(
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextLimit: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextLimit: 128000 },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', contextLimit: 128000 },
        { id: 'gpt-3.5-turbo-0125', name: 'GPT-3.5 Turbo', provider: 'openai', contextLimit: 16385 }
      );
    }
    
    if (this.providers.anthropic) {
      models.push(
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', contextLimit: 200000 },
        { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'anthropic', contextLimit: 200000 },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', contextLimit: 200000 }
      );
    }
    
    if (this.providers.google) {
      models.push(
        { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google', contextLimit: 32000 }
      );
    }
    
    return models;
  }

  async generateStreaming(modelId, prompt, context, onChunk, onComplete, onError) {
    try {
      console.log(`🔍 AI Service: Looking for model ${modelId}`);
      
      const model = this.getAvailableModels().find(m => m.id === modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found or not available`);
      }

      console.log(`🔍 AI Service: Found model ${model.name}, provider: ${model.provider}`);
      
      const provider = this.providers[model.provider];
      if (!provider) {
        throw new Error(`Provider ${model.provider} not configured`);
      }

      console.log(`🔍 AI Service: Starting generation with ${model.provider}`);
      
      return await provider.generateStreaming(modelId, prompt, context, onChunk, onComplete, onError);
    } catch (error) {
      console.error('❌ AI Service Error:', error);
      if (onError) onError(error);
      throw error;
    }
  }
}

class OpenAIProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async generateStreaming(model, prompt, context, onChunk, onComplete, onError) {
    try {
      // Construct messages with proper context structure
      const messages = [];
      
      // Add context cards first (if any)
      if (context.length > 0) {
        const contextContent = context.map(card => card.contextText).join('\n\n---\n\n');
        messages.push({
          role: 'user',
          content: `Here is the context information from selected cards:\n\n${contextContent}\n\n---\n\nNow please respond to the following:`
        });
      }
      
      // Add the actual prompt/instruction
      messages.push({
        role: 'user', 
        content: prompt
      });

      console.log(`🔍 OpenAI: Sending ${context.length} context cards + prompt to ${model}`);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: true,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      // Use Node.js body stream instead of getReader()
      let buffer = '';
      
      response.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onComplete();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      });

      response.body.on('end', () => {
        onComplete();
      });

      response.body.on('error', (error) => {
        onError(error);
      });
    } catch (error) {
      onError(error);
    }
  }
}

class AnthropicProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  async generateStreaming(model, prompt, context, onChunk, onComplete, onError) {
    try {
      let fullPrompt = '';
      
      // Add context cards first (if any)
      if (context.length > 0) {
        fullPrompt += 'Here is the context information from selected cards:\n\n';
        fullPrompt += context.map(card => card.contextText).join('\n\n---\n\n');
        fullPrompt += '\n\n---\n\nNow please respond to the following:\n\n';
      }
      
      fullPrompt += prompt;

      console.log(`🔍 Anthropic: Sending ${context.length} context cards + prompt to ${model}`);

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: fullPrompt }],
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }

      // Use Node.js body stream for Anthropic
      let buffer = '';
      
      response.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                onChunk(parsed.delta.text);
              } else if (parsed.type === 'message_stop') {
                onComplete();
                return;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      });

      response.body.on('end', () => {
        onComplete();
      });

      response.body.on('error', (error) => {
        onError(error);
      });
    } catch (error) {
      onError(error);
    }
  }
}

class GoogleProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  async generateStreaming(model, prompt, context, onChunk, onComplete, onError) {
    try {
      let fullPrompt = '';
      
      if (context.length > 0) {
        fullPrompt += 'Context:\n';
        context.forEach(card => {
          fullPrompt += `- ${card.title || 'Untitled'}: ${card.content}\n`;
        });
        fullPrompt += '\n';
      }
      
      fullPrompt += prompt;

      const response = await fetch(`${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Google AI API error: ${response.statusText}`);
      }

      // Use Node.js body stream for Google
      let buffer = '';
      
      response.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            try {
              const parsed = JSON.parse(data);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                onChunk(text);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      });

      response.body.on('end', () => {
        onComplete();
      });

      response.body.on('error', (error) => {
        onError(error);
      });
    } catch (error) {
      onError(error);
    }
  }
}

module.exports = { AIProviderService };