import React, { useState, useRef, useEffect, useCallback } from 'react';

interface RichTextEditorProps {
  content: string;
  onContentChange: (newContent: string) => void;
  onSave: () => Promise<void>;
  isLoading?: boolean;
  className?: string;
  onError?: (error: string) => void;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onContentChange,
  onSave,
  isLoading = false,
  className = '',
  onError
}) => {
  const [htmlContent, setHtmlContent] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  // Convert markdown to HTML for display
  const markdownToHtml = useCallback((markdown: string) => {
    console.log('[RichTextEditor] Converting markdown to HTML:', markdown);
    
    if (!markdown.trim()) {
      return '<p>Click to start writing...</p>';
    }
    
    // Split into lines and group consecutive non-empty lines into paragraphs
    const lines = markdown.split('\n');
    const htmlLines: string[] = [];
    let currentParagraph: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Handle headings
      if (line.match(/^#{1,6}\s+/)) {
        // Flush current paragraph first
        if (currentParagraph.length > 0) {
          const paragraphContent = currentParagraph.join('<br>');
          const formattedParagraph = paragraphContent
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
          htmlLines.push(`<p>${formattedParagraph}</p>`);
          currentParagraph = [];
        }
        
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const text = headingMatch[2]
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
          htmlLines.push(`<h${level}>${text}</h${level}>`);
          continue;
        }
      }
      
      // Handle empty lines - end current paragraph
      if (line.trim() === '') {
        if (currentParagraph.length > 0) {
          const paragraphContent = currentParagraph.join('<br>');
          const formattedParagraph = paragraphContent
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
          htmlLines.push(`<p>${formattedParagraph}</p>`);
          currentParagraph = [];
        }
        continue;
      }
      
      // Add line to current paragraph
      currentParagraph.push(line);
    }
    
    // Flush any remaining paragraph
    if (currentParagraph.length > 0) {
      const paragraphContent = currentParagraph.join('<br>');
      const formattedParagraph = paragraphContent
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
      htmlLines.push(`<p>${formattedParagraph}</p>`);
    }
    
    const result = htmlLines.join('');
    console.log('[RichTextEditor] Converted to HTML:', result);
    return result;
  }, []);

  // Convert HTML back to markdown
  const htmlToMarkdown = useCallback((html: string) => {
    console.log('[RichTextEditor] Converting HTML to markdown:', html);
    
    // First, get the text content to strip all HTML tags and inline styles
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Process each element to convert to markdown recursively
    const processNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        
        // Process children recursively for inline elements
        const processChildren = (): string => {
          let childResult = '';
          for (let i = 0; i < element.childNodes.length; i++) {
            childResult += processNode(element.childNodes[i]);
          }
          return childResult;
        };
        
        switch (tagName) {
          case 'h1':
            return `# ${processChildren()}\n\n`;
          case 'h2':
            return `## ${processChildren()}\n\n`;
          case 'h3':
            return `### ${processChildren()}\n\n`;
          case 'h4':
            return `#### ${processChildren()}\n\n`;
          case 'h5':
            return `##### ${processChildren()}\n\n`;
          case 'h6':
            return `###### ${processChildren()}\n\n`;
          case 'strong':
          case 'b':
            return `**${processChildren()}**`;
          case 'em':
          case 'i':
            return `*${processChildren()}*`;
          case 'code':
            return `\`${processChildren()}\``;
          case 'p':
            return `${processChildren()}\n\n`;
          case 'br':
            return '\n';
          case 'div':
            return `${processChildren()}\n\n`;
          case 'span':
            // For span elements, just return the processed children (ignore styling)
            return processChildren();
          default:
            // For any other element, process children and return content
            return processChildren();
        }
      }
      
      return '';
    };
    
    // Process all child nodes
    let result = '';
    for (let i = 0; i < tempDiv.childNodes.length; i++) {
      result += processNode(tempDiv.childNodes[i]);
    }
    
    // Clean up extra newlines
    result = result.replace(/\n\n+/g, '\n\n').trim();
    
    console.log('[RichTextEditor] Converted to markdown:', result);
    return result;
  }, []);

  // Update HTML when markdown content changes, but preserve cursor position
  useEffect(() => {
    const html = markdownToHtml(content);
    setHtmlContent(html);
    
    if (editorRef.current) {
      // Only update if content is different and editor is not focused
      const currentHtml = editorRef.current.innerHTML;
      const isEditorFocused = document.activeElement === editorRef.current;
      
      if (!isEditorFocused && currentHtml !== html) {
        editorRef.current.innerHTML = html || '<p>Click to start writing...</p>';
      }
    }
  }, [content, markdownToHtml]);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const markdown = htmlToMarkdown(html);
      
      // Call onContentChange immediately without timeout to ensure state is updated
      onContentChange(markdown);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    handleInput();
    setShowContextMenu(false);
  };

  const makeHeading = (level: number) => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const element = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
        ? range.commonAncestorContainer.parentElement 
        : range.commonAncestorContainer as Element;
      
      if (element) {
        const headingTag = `h${level}`;
        applyFormat('formatBlock', headingTag);
      }
    }
    setShowContextMenu(false);
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowContextMenu(false);
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);

  return (
    <div className={`rich-text-editor ${className}`} style={{ position: 'relative' }}>
      <div
        ref={editorRef}
        contentEditable={!isLoading}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        style={{
          width: '100%',
          minHeight: '200px',
          padding: '12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '14px',
          lineHeight: '1.6',
          outline: 'none',
          backgroundColor: isLoading ? '#f9f9f9' : 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
        suppressContentEditableWarning={true}
      />

      {/* Context Menu */}
      {showContextMenu && (
        <div
          style={{
            position: 'fixed',
            top: Math.min(contextMenuPos.y, window.innerHeight - 250),
            left: Math.min(contextMenuPos.x, window.innerWidth - 180),
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 9999,
            minWidth: '150px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}
        >
          <div style={{ padding: '8px 0' }}>
            <button
              onClick={() => makeHeading(1)}
              style={{ display: 'block', width: '100%', padding: '8px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Heading 1
            </button>
            <button
              onClick={() => makeHeading(2)}
              style={{ display: 'block', width: '100%', padding: '8px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Heading 2
            </button>
            <button
              onClick={() => makeHeading(3)}
              style={{ display: 'block', width: '100%', padding: '8px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Heading 3
            </button>
            <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #eee' }} />
            <button
              onClick={() => applyFormat('bold')}
              style={{ display: 'block', width: '100%', padding: '8px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <strong>Bold</strong>
            </button>
            <button
              onClick={() => applyFormat('italic')}
              style={{ display: 'block', width: '100%', padding: '8px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <em>Italic</em>
            </button>
            <button
              onClick={() => applyFormat('formatBlock', 'p')}
              style={{ display: 'block', width: '100%', padding: '8px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Normal Text
            </button>
          </div>
        </div>
      )}

      {/* Compact Formatting Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '8px',
        borderTop: '1px solid #eee',
        backgroundColor: '#fafafa',
        borderRadius: '0 0 4px 4px',
        fontSize: '12px'
      }}>
        <button
          onClick={() => makeHeading(1)}
          style={{
            padding: '4px 8px',
            border: '1px solid #ddd',
            borderRadius: '3px',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold'
          }}
          title="Heading 1"
        >
          H1
        </button>
        <button
          onClick={() => makeHeading(2)}
          style={{
            padding: '4px 8px',
            border: '1px solid #ddd',
            borderRadius: '3px',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold'
          }}
          title="Heading 2"
        >
          H2
        </button>
        <button
          onClick={() => makeHeading(3)}
          style={{
            padding: '4px 8px',
            border: '1px solid #ddd',
            borderRadius: '3px',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold'
          }}
          title="Heading 3"
        >
          H3
        </button>
        <div style={{ width: '1px', height: '16px', backgroundColor: '#ddd', margin: '0 4px' }} />
        <button
          onClick={() => applyFormat('bold')}
          style={{
            padding: '4px 8px',
            border: '1px solid #ddd',
            borderRadius: '3px',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold'
          }}
          title="Bold"
        >
          B
        </button>
        <button
          onClick={() => applyFormat('italic')}
          style={{
            padding: '4px 8px',
            border: '1px solid #ddd',
            borderRadius: '3px',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontSize: '11px',
            fontStyle: 'italic'
          }}
          title="Italic"
        >
          I
        </button>
        <button
          onClick={() => {
            // Remove formatting and convert to normal paragraph
            applyFormat('removeFormat');
            applyFormat('formatBlock', 'p');
          }}
          style={{
            padding: '4px 8px',
            border: '1px solid #ddd',
            borderRadius: '3px',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontSize: '11px'
          }}
          title="Regular Text (removes all formatting)"
        >
          T
        </button>
      </div>

      {isLoading && (
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          color: '#666',
          fontSize: '14px'
        }}>
          Saving...
        </div>
      )}
    </div>
  );
};

export default RichTextEditor;
