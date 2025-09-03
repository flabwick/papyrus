/**
 * Token Counter Service
 * Provides accurate token counting for different AI models
 */

// Simple token estimation (more accurate than character count)
// This is a simplified version - you can integrate tiktoken later for exact counts
class TokenCounterService {
  
  /**
   * Estimate tokens for OpenAI models (GPT-3.5, GPT-4)
   * Uses a more accurate estimation than simple character count
   */
  private estimateOpenAITokens(text: string): number {
    if (!text) return 0;
    
    // More sophisticated estimation:
    // - Average ~4 characters per token for English text
    // - But adjust for punctuation, spaces, and common patterns
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const characters = text.length;
    
    // Weighted estimation based on both word count and character count
    const wordBasedTokens = words.length * 1.3; // Average 1.3 tokens per word
    const charBasedTokens = characters / 4; // ~4 chars per token
    
    // Take the average and round up
    return Math.ceil((wordBasedTokens + charBasedTokens) / 2);
  }

  /**
   * Estimate tokens for Anthropic Claude models
   * Claude uses a similar tokenization to OpenAI
   */
  private estimateClaudeTokens(text: string): number {
    return this.estimateOpenAITokens(text); // Similar tokenization
  }

  /**
   * Estimate tokens for Google models
   * Google may have different tokenization
   */
  private estimateGoogleTokens(text: string): number {
    if (!text) return 0;
    // Google tends to have slightly more tokens per character
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Count tokens for a specific model
   */
  public countTokens(text: string, model: string): number {
    if (!text) return 0;

    // Determine provider from model name
    if (model.includes('gpt') || model.includes('openai')) {
      return this.estimateOpenAITokens(text);
    } else if (model.includes('claude') || model.includes('anthropic')) {
      return this.estimateClaudeTokens(text);
    } else if (model.includes('gemini') || model.includes('google')) {
      return this.estimateGoogleTokens(text);
    }

    // Default to OpenAI estimation
    return this.estimateOpenAITokens(text);
  }

  /**
   * Count total tokens for multiple pieces of text
   */
  public countTotalTokens(texts: string[], model: string = 'gpt-4'): number {
    return texts.reduce((total, text) => total + this.countTokens(text, model), 0);
  }

  /**
   * Format token count for display
   */
  public formatTokenCount(count: number): string {
    if (count === 0) return '0';
    if (count < 1000) return count.toString();
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1000000).toFixed(1)}M`;
  }

  /**
   * Get model context limits
   */
  public getContextLimit(model: string): number {
    const limits: { [key: string]: number } = {
      'gpt-3.5-turbo': 16385,
      'gpt-4': 8192,
      'gpt-4-turbo': 128000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'claude-3-opus': 200000,
      'claude-3-sonnet': 200000,
      'claude-3-haiku': 200000,
      'gemini-pro': 32000,
      'gemini-2.5-pro': 1000000,
    };

    return limits[model] || 8192; // Default limit
  }

  /**
   * Check if context exceeds model limit
   */
  public exceedsLimit(tokenCount: number, model: string): boolean {
    return tokenCount > this.getContextLimit(model);
  }

  /**
   * Get percentage of context limit used
   */
  public getUsagePercentage(tokenCount: number, model: string): number {
    const limit = this.getContextLimit(model);
    return Math.round((tokenCount / limit) * 100);
  }
}

// Export singleton instance
export const tokenCounter = new TokenCounterService();
export default tokenCounter;