import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import InlineEditor from './InlineEditor';

interface CollapsibleInlineEditorProps {
  content: string;
  onContentChange: (newContent: string) => void;
  onSave: () => Promise<void>;
  isLoading?: boolean;
  className?: string;
  onError?: (error: string) => void;
  maxLines?: number;
  pageId?: string;
}

interface HeadingInfo {
  id: string;
  level: number;
  lineIndex: number;
  content: string;
  isCollapsed: boolean;
}

const CollapsibleInlineEditor: React.FC<CollapsibleInlineEditorProps> = (props) => {
  const [collapsedHeadings, setCollapsedHeadings] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse headings from content
  const headings = useMemo((): HeadingInfo[] => {
    const lines = props.content.split('\n');
    const headingList: HeadingInfo[] = [];

    lines.forEach((line, i) => {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const content = headingMatch[2];
        const id = `h${level}-${i}-${content.slice(0, 20).replace(/\s+/g, '-')}`;
        
        headingList.push({
          id,
          level,
          lineIndex: i,
          content,
          isCollapsed: collapsedHeadings.has(id)
        });
      }
    });

    return headingList;
  }, [props.content, collapsedHeadings]);

  // Filter content based on collapsed headings with proper hierarchy
  const processedContent = useMemo(() => {
    const lines = props.content.split('\n');
    const visibleLines: string[] = [];
    const collapsedStack: number[] = []; // Stack of collapsed heading levels

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      
      if (headingMatch) {
        const level = headingMatch[1].length;
        const heading = headings.find(h => h.lineIndex === i);
        
        // Clear collapsed stack for same or higher level headings
        while (collapsedStack.length > 0 && collapsedStack[collapsedStack.length - 1] >= level) {
          collapsedStack.pop();
        }
        
        // Check if we're under a collapsed parent heading
        const isUnderCollapsedParent = collapsedStack.length > 0;
        
        // Only show heading if not under a collapsed parent
        if (!isUnderCollapsedParent) {
          visibleLines.push(line);
        }
        
        // If this heading is collapsed, add its level to the stack
        if (heading?.isCollapsed) {
          collapsedStack.push(level);
        }
      } else {
        // Only show content if not under any collapsed heading
        if (collapsedStack.length === 0) {
          visibleLines.push(line);
        }
      }
    }

    return visibleLines.join('\n');
  }, [props.content, headings]);

  const toggleHeading = useCallback((headingId: string) => {
    setCollapsedHeadings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(headingId)) {
        newSet.delete(headingId);
      } else {
        newSet.add(headingId);
      }
      return newSet;
    });
  }, []);

  // Use effect to position buttons after render
  useEffect(() => {
    if (!containerRef.current) return;

    const updateButtonPositions = () => {
      const container = containerRef.current;
      if (!container) return;

      // Find all heading elements in the rendered content
      const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const buttons = container.querySelectorAll('.collapse-button');

      buttons.forEach((button, index) => {
        if (headingElements[index]) {
          const headingRect = headingElements[index].getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const relativeTop = headingRect.top - containerRect.top;
          
          (button as HTMLElement).style.top = `${relativeTop + 2}px`;
        }
      });
    };

    // Update positions after a short delay to allow rendering
    const timeoutId = setTimeout(updateButtonPositions, 10);
    
    // Also update on resize
    window.addEventListener('resize', updateButtonPositions);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateButtonPositions);
    };
  }, [processedContent, headings]);

  // Check if a heading should be visible (not under a collapsed parent)
  const isHeadingVisible = useCallback((targetHeading: HeadingInfo) => {
    const lines = props.content.split('\n');
    const collapsedStack: number[] = [];

    for (let i = 0; i < targetHeading.lineIndex; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      
      if (headingMatch) {
        const level = headingMatch[1].length;
        const heading = headings.find(h => h.lineIndex === i);
        
        // Clear collapsed stack for same or higher level headings
        while (collapsedStack.length > 0 && collapsedStack[collapsedStack.length - 1] >= level) {
          collapsedStack.pop();
        }
        
        // If this heading is collapsed, add its level to the stack
        if (heading?.isCollapsed) {
          collapsedStack.push(level);
        }
      }
    }

    return collapsedStack.length === 0;
  }, [props.content, headings]);

  // Render collapse buttons with dynamic positioning
  const renderCollapseButtons = () => {
    return headings
      .filter(heading => isHeadingVisible(heading))
      .map((heading, index) => (
        <button
          key={heading.id}
          className="collapse-button"
          onClick={(e) => {
            e.stopPropagation();
            toggleHeading(heading.id);
          }}
          style={{
            position: 'absolute',
            left: '-25px',
            top: '0px', // Will be updated by useEffect
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#666',
            zIndex: 10,
            padding: '2px',
            lineHeight: '1',
            width: '16px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'top 0.1s ease'
          }}
          title={`${heading.isCollapsed ? 'Expand' : 'Collapse'} section`}
        >
          {heading.isCollapsed ? '▶' : '▼'}
        </button>
      ));
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {renderCollapseButtons()}
      <InlineEditor
        {...props}
        content={processedContent}
        onContentChange={(newContent) => {
          // When content changes, we need to pass the full content back
          // but preserve collapse states by mapping them to the new content
          props.onContentChange(newContent);
        }}
      />
    </div>
  );
};

export default CollapsibleInlineEditor;
