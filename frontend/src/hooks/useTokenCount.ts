import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { tokenCounter } from '../services/tokenCounter';
import api from '../services/api';

interface TokenCountData {
  totalTokens: number;
  cardTokens: { cardId: string; tokens: number; title: string }[];
  isLoading: boolean;
  selectedModel: string;
}

export const useTokenCount = (selectedModel: string = 'gpt-4o'): TokenCountData => {
  const { aiContextCards } = useApp();
  const [tokenData, setTokenData] = useState<TokenCountData>({
    totalTokens: 0,
    cardTokens: [],
    isLoading: false,
    selectedModel
  });

  useEffect(() => {
    if (aiContextCards.length === 0) {
      setTokenData({
        totalTokens: 0,
        cardTokens: [],
        isLoading: false,
        selectedModel
      });
      return;
    }

    const calculateTokens = async () => {
      setTokenData(prev => ({ ...prev, isLoading: true }));

      try {
        // Fetch content for all context cards
        const cardPromises = aiContextCards.map(async (cardId) => {
          const response = await api.get(`/cards/${cardId}`);
          const card = response.data.card;
          
          // Get the full content for token counting
          const content = card.content || card.contentPreview || '';
          const title = card.title || 'Untitled';
          
          // Create context text as it would be sent to AI
          const contextText = `# ${title}\n\n${content}`;
          const tokens = tokenCounter.countTokens(contextText, selectedModel);
          
          return {
            cardId,
            tokens,
            title,
            content: contextText
          };
        });

        const cardTokenResults = await Promise.all(cardPromises);
        const totalTokens = cardTokenResults.reduce((sum, card) => sum + card.tokens, 0);

        setTokenData({
          totalTokens,
          cardTokens: cardTokenResults,
          isLoading: false,
          selectedModel
        });

      } catch (error) {
        console.error('Failed to calculate token counts:', error);
        // Fallback to rough estimation
        const estimatedTotal = aiContextCards.length * 150; // Rough estimate
        setTokenData({
          totalTokens: estimatedTotal,
          cardTokens: aiContextCards.map(cardId => ({
            cardId,
            tokens: 150,
            title: 'Untitled'
          })),
          isLoading: false,
          selectedModel
        });
      }
    };

    // Debounce the calculation to avoid excessive API calls
    const timeoutId = setTimeout(calculateTokens, 300);
    return () => clearTimeout(timeoutId);

  }, [aiContextCards, selectedModel]);

  return tokenData;
};

export default useTokenCount;