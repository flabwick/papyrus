import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { tokenCounter } from '../services/tokenCounter';
import api from '../services/api';

interface TokenCountData {
  totalTokens: number;
  pageTokens: { pageId: string; tokens: number; title: string }[];
  isLoading: boolean;
  selectedModel: string;
}

export const useTokenCount = (selectedModel: string = 'gpt-4o'): TokenCountData => {
  const { aiContextPages } = useApp();
  const [tokenData, setTokenData] = useState<TokenCountData>({
    totalTokens: 0,
    pageTokens: [],
    isLoading: false,
    selectedModel
  });

  useEffect(() => {
    if (aiContextPages.length === 0) {
      setTokenData({
        totalTokens: 0,
        pageTokens: [],
        isLoading: false,
        selectedModel
      });
      return;
    }

    const calculateTokens = async () => {
      setTokenData(prev => ({ ...prev, isLoading: true }));

      try {
        // Fetch content for all context pages
        const pagePromises = aiContextPages.map(async (pageId: string) => {
          const response = await api.get(`/pages/${pageId}`);
          const page = response.data.page;
          
          // Get the full content for token counting
          const content = page.content || page.contentPreview || '';
          const title = page.title || 'Untitled';
          
          // Create context text as it would be sent to AI
          const contextText = `# ${title}\n\n${content}`;
          const tokens = tokenCounter.countTokens(contextText, selectedModel);
          
          return {
            pageId,
            tokens,
            title,
            content: contextText
          };
        });

        const pageTokenResults = await Promise.all(pagePromises);
        const totalTokens = pageTokenResults.reduce((sum: number, page: any) => sum + page.tokens, 0);

        setTokenData({
          totalTokens,
          pageTokens: pageTokenResults,
          isLoading: false,
          selectedModel
        });

      } catch (error) {
        console.error('Failed to calculate token counts:', error);
        // Fallback to rough estimation
        const estimatedTotal = aiContextPages.length * 150; // Rough estimate
        setTokenData({
          totalTokens: estimatedTotal,
          pageTokens: aiContextPages.map((pageId: string) => ({
            pageId,
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

  }, [aiContextPages, selectedModel]);

  return tokenData;
};

export default useTokenCount;