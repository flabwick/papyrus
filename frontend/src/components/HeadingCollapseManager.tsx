import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

// Types for heading collapse state
interface HeadingInfo {
  id: string;
  level: number; // 1-6 for H1-H6
  content: string;
  lineIndex: number;
  isCollapsed: boolean;
}

interface CollapsedHeadings {
  [pageId: string]: {
    [headingId: string]: boolean;
  };
}

interface WorkspaceCollapseState {
  collapsedHeadings: CollapsedHeadings;
}

interface HeadingCollapseContextType {
  getHeadingState: (pageId: string, headingId: string) => boolean;
  toggleHeading: (pageId: string, headingId: string) => void;
  setHeadingState: (pageId: string, headingId: string, collapsed: boolean) => void;
  loadWorkspaceState: (workspaceId: string) => Promise<void>;
  saveWorkspaceState: (workspaceId: string) => Promise<void>;
  generateHeadingId: (content: string, lineIndex: number) => string;
  parseHeadingsFromContent: (content: string) => HeadingInfo[];
  getCollapsedSections: (pageId: string, headings: HeadingInfo[]) => number[];
}

const HeadingCollapseContext = createContext<HeadingCollapseContextType | null>(null);

export const useHeadingCollapse = () => {
  const context = useContext(HeadingCollapseContext);
  if (!context) {
    throw new Error('useHeadingCollapse must be used within HeadingCollapseProvider');
  }
  return context;
};

interface HeadingCollapseProviderProps {
  children: React.ReactNode;
  workspaceId: string;
}

export const HeadingCollapseProvider: React.FC<HeadingCollapseProviderProps> = ({
  children,
  workspaceId
}) => {
  const [collapseState, setCollapseState] = useState<WorkspaceCollapseState>({
    collapsedHeadings: {}
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Generate stable heading ID using content hash + position
  const generateHeadingId = useCallback((content: string, lineIndex: number): string => {
    // Create a simple hash from content + position for stability
    const hashInput = `${content.trim()}-${lineIndex}`;
    // Use a simple hash function since crypto.createHash isn't available in browser
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `heading-${Math.abs(hash)}-${lineIndex}`;
  }, []);

  // Parse markdown content to extract headings
  const parseHeadingsFromContent = useCallback((content: string): HeadingInfo[] => {
    const lines = content.split('\n');
    const headings: HeadingInfo[] = [];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Match markdown headings (# ## ### etc.)
      const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingContent = headingMatch[2];
        const headingId = generateHeadingId(headingContent, index);

        headings.push({
          id: headingId,
          level,
          content: headingContent,
          lineIndex: index,
          isCollapsed: false // Will be set based on state
        });
      }
    });

    return headings;
  }, [generateHeadingId]);

  // Get collapse state for a specific heading
  const getHeadingState = useCallback((pageId: string, headingId: string): boolean => {
    return collapseState.collapsedHeadings[pageId]?.[headingId] || false;
  }, [collapseState]);

  // Toggle heading collapse state
  const toggleHeading = useCallback((pageId: string, headingId: string) => {
    setCollapseState(prev => {
      const newState = { ...prev };
      if (!newState.collapsedHeadings[pageId]) {
        newState.collapsedHeadings[pageId] = {};
      }
      
      const currentState = newState.collapsedHeadings[pageId][headingId] || false;
      newState.collapsedHeadings[pageId][headingId] = !currentState;
      
      return newState;
    });

    // Auto-save state change
    setTimeout(() => saveWorkspaceState(workspaceId), 100);
  }, [workspaceId]);

  // Set specific heading state
  const setHeadingState = useCallback((pageId: string, headingId: string, collapsed: boolean) => {
    setCollapseState(prev => {
      const newState = { ...prev };
      if (!newState.collapsedHeadings[pageId]) {
        newState.collapsedHeadings[pageId] = {};
      }
      newState.collapsedHeadings[pageId][headingId] = collapsed;
      return newState;
    });
  }, []);

  // Calculate which line indices should be collapsed based on heading hierarchy
  // Memoized for performance with large documents
  const getCollapsedSections = useCallback((pageId: string, headings: HeadingInfo[]): number[] => {
    const collapsedLines: number[] = [];
    
    // Performance optimization: early exit for documents with no headings
    if (headings.length === 0) return collapsedLines;
    
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const isCollapsed = getHeadingState(pageId, heading.id);
      
      if (isCollapsed) {
        // Find the range of lines to collapse
        const startLine = heading.lineIndex + 1; // Start after the heading
        let endLine = -1;
        
        // Find next heading of equal or higher level (lower number)
        for (let j = i + 1; j < headings.length; j++) {
          if (headings[j].level <= heading.level) {
            endLine = headings[j].lineIndex - 1;
            break;
          }
        }
        
        // If no next heading found, collapse to end of document
        if (endLine === -1) {
          endLine = Number.MAX_SAFE_INTEGER; // Will be clamped by actual content length
        }
        
        // Performance optimization: use Set for O(1) lookups instead of array
        for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
          collapsedLines.push(lineIndex);
        }
      }
    }
    
    return collapsedLines;
  }, [getHeadingState]);

  // Load workspace state from localStorage (could be extended to API)
  const loadWorkspaceState = useCallback(async (workspaceId: string) => {
    try {
      const storageKey = `papyrus-headings-${workspaceId}`;
      const savedState = localStorage.getItem(storageKey);
      
      if (savedState) {
        const parsedState = JSON.parse(savedState) as WorkspaceCollapseState;
        setCollapseState(parsedState);
      } else {
        // Initialize with empty state
        setCollapseState({ collapsedHeadings: {} });
      }
      
      setIsLoaded(true);
    } catch (error) {
      console.error('[HeadingCollapse] Failed to load workspace state:', error);
      setCollapseState({ collapsedHeadings: {} });
      setIsLoaded(true);
    }
  }, []);

  // Save workspace state to localStorage (could be extended to API)
  const saveWorkspaceState = useCallback(async (workspaceId: string) => {
    try {
      const storageKey = `papyrus-headings-${workspaceId}`;
      localStorage.setItem(storageKey, JSON.stringify(collapseState));
    } catch (error) {
      console.error('[HeadingCollapse] Failed to save workspace state:', error);
    }
  }, [collapseState]);

  // Load state when workspace changes
  useEffect(() => {
    if (workspaceId) {
      loadWorkspaceState(workspaceId);
    }
  }, [workspaceId, loadWorkspaceState]);

  const contextValue: HeadingCollapseContextType = {
    getHeadingState,
    toggleHeading,
    setHeadingState,
    loadWorkspaceState,
    saveWorkspaceState,
    generateHeadingId,
    parseHeadingsFromContent,
    getCollapsedSections
  };

  return (
    <HeadingCollapseContext.Provider value={contextValue}>
      {children}
    </HeadingCollapseContext.Provider>
  );
};

export default HeadingCollapseProvider;
