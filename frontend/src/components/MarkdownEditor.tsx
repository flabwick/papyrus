import React, { useState, useRef, useEffect } from 'react';

interface MarkdownEditorProps {
  content: string;
  onContentChange: (newContent: string) => void;
  onSave: () => Promise<void>;
  isLoading?: boolean;
  className?: string;
  onError?: (error: string) => void;
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  content,
  onContentChange,
  onSave,
  isLoading = false,
  className = '',
  onError
}) => {
  const [editingContent, setEditingContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update local content when prop changes
  useEffect(() => {
    setEditingContent(content);
  }, [content]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editingContent]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    console.log('[MarkdownEditor] Content changed:', {
      newLength: newContent.length,
      preview: newContent.substring(0, 100) + (newContent.length > 100 ? '...' : '')
    });
    setEditingContent(newContent);
    onContentChange(newContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <div className={`markdown-editor ${className}`}>
      <textarea
        ref={textareaRef}
        value={editingContent}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        placeholder="Write your markdown here..."
        style={{
          width: '100%',
          minHeight: '200px',
          padding: '12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '14px',
          fontFamily: 'Monaco, Consolas, "Courier New", monospace',
          lineHeight: '1.5',
          resize: 'vertical',
          outline: 'none',
          backgroundColor: isLoading ? '#f9f9f9' : 'white'
        }}
        disabled={isLoading}
      />
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

export default MarkdownEditor;
