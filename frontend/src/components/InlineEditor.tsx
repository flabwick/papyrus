import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

interface InlineEditorProps {
  content: string;
  onContentChange: (newContent: string) => void;
  onSave: () => Promise<void>;
  isLoading?: boolean;
  className?: string;
  onError?: (error: string) => void;
  maxLines?: number;
  pageId?: string;
}

const InlineEditor: React.FC<InlineEditorProps> = ({
  content,
  onContentChange,
  onSave,
  isLoading = false,
  className = '',
  onError,
  maxLines = 10000,
  pageId = 'unknown'
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingContent, setEditingContent] = useState<string>('');
  const [lastSaveTime, setLastSaveTime] = useState<number>(0);
  const [saveTimeoutId, setSaveTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debug logging function
  const debugLog = useCallback((message: string, data?: any) => {
    console.log(`[InlineEditor] ${message}`, data || '');
  }, []);

  // Initialize editing content when content changes
  useEffect(() => {
    if (!isEditing) {
      setEditingContent(content);
    }
  }, [content, isEditing]);

  // Auto-save functionality with error handling
  const triggerAutoSave = useCallback(async () => {
    debugLog('Triggering auto-save');
    
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
    }

    const newTimeoutId = setTimeout(async () => {
      debugLog('Auto-save executing');
      try {
        setSaveError(null);
        await onSave();
        setLastSaveTime(Date.now());
        setHasUnsavedChanges(false);
        debugLog('Auto-save completed successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Save failed';
        debugLog('Auto-save failed', errorMessage);
        setSaveError(errorMessage);
        setHasUnsavedChanges(true);
        if (onError) {
          onError(errorMessage);
        }
      }
    }, 2000); // 2 second delay

    setSaveTimeoutId(newTimeoutId);
  }, [saveTimeoutId, onSave, onError, debugLog]);

  // Handle content change in textarea
  const handleContentChange = useCallback((newContent: string) => {
    debugLog('Content changed in editor', { newContentLength: newContent.length });
    setEditingContent(newContent);
    setHasUnsavedChanges(true);
  }, [debugLog]);

  // Handle click to start editing
  const handleClick = useCallback(() => {
    debugLog('Editor clicked, entering edit mode');
    if (!isEditing) {
      setIsEditing(true);
      setEditingContent(content);
      
      // Focus input after state update
      setTimeout(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
        }
      }, 10);
    }
  }, [isEditing, content, debugLog]);

  // Save current edit and exit edit mode
  const saveCurrentEdit = useCallback(async () => {
    debugLog('Saving current edit and exiting edit mode');
    if (hasUnsavedChanges) {
      onContentChange(editingContent);
      try {
        setSaveError(null);
        await onSave();
        setLastSaveTime(Date.now());
        setHasUnsavedChanges(false);
        debugLog('Save completed successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Save failed';
        debugLog('Save failed', errorMessage);
        setSaveError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
        return; // Don't exit edit mode if save failed
      }
    }
    setIsEditing(false);
  }, [hasUnsavedChanges, editingContent, onContentChange, onSave, onError, debugLog]);

  // Handle click outside to save and exit edit mode
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (isEditing && containerRef.current && !containerRef.current.contains(event.target as Node)) {
      debugLog('Click outside detected, saving edit');
      saveCurrentEdit();
    }
  }, [isEditing, saveCurrentEdit, debugLog]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    debugLog('Key pressed', { key: event.key, ctrlKey: event.ctrlKey });

    if (event.key === 'Escape') {
      debugLog('Escape pressed, exiting edit mode without saving');
      setIsEditing(false);
      setEditingContent(content); // Reset to original content
      setHasUnsavedChanges(false);
      event.preventDefault();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      debugLog('Ctrl+S pressed, force saving');
      saveCurrentEdit();
      event.preventDefault();
    }
  }, [content, saveCurrentEdit, debugLog]);

  // Set up click outside listener
  useEffect(() => {
    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isEditing, handleClickOutside]);

  return (
    <div 
      ref={containerRef}
      className={`inline-editor ${className}`}
      style={{ position: 'relative' }}
    >
      {/* Loading indicator */}
      {isLoading && (
        <div className="inline-editor-loading" style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: '#f3f4f6',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#6b7280'
        }}>
          Saving...
        </div>
      )}

      {/* Error indicator */}
      {saveError && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: isLoading ? '80px' : '8px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#dc2626',
          maxWidth: '200px'
        }}>
          ⚠️ {saveError}
        </div>
      )}

      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && !isLoading && !saveError && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: '#fef3c7',
          border: '1px solid #fde68a',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#d97706'
        }}>
          • Unsaved changes
        </div>
      )}

      {/* Main content area */}
      <div className="inline-editor-content">
        {isEditing ? (
          <textarea
            ref={editInputRef}
            value={editingContent}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="inline-editor-input"
            style={{
              width: '100%',
              minHeight: '120px',
              resize: 'vertical',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '8px',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              lineHeight: '1.5'
            }}
            placeholder="Click to start writing..."
          />
        ) : (
          <div
            onClick={handleClick}
            style={{ 
              cursor: 'text', 
              minHeight: '24px',
              padding: '8px',
              border: '1px solid transparent',
              borderRadius: '4px'
            }}
          >
            {content.trim() ? (
              <ReactMarkdown>{content}</ReactMarkdown>
            ) : (
              <div style={{ 
                color: '#9ca3af', 
                fontStyle: 'italic',
                minHeight: '20px',
                padding: '2px 0'
              }}>
                Click to start writing...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Debug info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{ 
          marginTop: '16px', 
          padding: '8px', 
          background: '#f9fafb', 
          fontSize: '11px',
          color: '#6b7280',
          borderRadius: '4px'
        }}>
          Editing: {isEditing ? 'yes' : 'no'} | Content length: {editingContent.length} | Last save: {lastSaveTime ? new Date(lastSaveTime).toLocaleTimeString() : 'never'}
        </div>
      )}
    </div>
  );
};

export default InlineEditor;
