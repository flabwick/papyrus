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

interface EditableLine {
  id: string;
  content: string;
  lineNumber: number;
  isMultiLine: boolean;
  startIndex: number;
  endIndex: number;
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
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
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

  // Parse content into editable lines
  const parseContentIntoLines = useCallback((content: string): EditableLine[] => {
    debugLog('Parsing content into lines', { contentLength: content.length });
    
    if (!content) {
      return [{
        id: 'empty-line',
        content: '',
        lineNumber: 1,
        isMultiLine: false,
        startIndex: 0,
        endIndex: 0
      }];
    }

    const lines: EditableLine[] = [];
    const contentLines = content.split('\n');
    let currentIndex = 0;
    let inCodeBlock = false;
    let codeBlockStart = -1;
    let codeBlockContent: string[] = [];

    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];
      const lineWithNewline = i < contentLines.length - 1 ? line + '\n' : line;
      
      // Check for code block boundaries
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          // Starting a code block
          inCodeBlock = true;
          codeBlockStart = i;
          codeBlockContent = [line];
        } else {
          // Ending a code block - create single multi-line unit
          codeBlockContent.push(line);
          const codeBlockText = codeBlockContent.join('\n');
          const endIndex = currentIndex + codeBlockText.length + (i < contentLines.length - 1 ? 1 : 0);
          
          lines.push({
            id: `code-block-${codeBlockStart}`,
            content: codeBlockText,
            lineNumber: codeBlockStart + 1,
            isMultiLine: true,
            startIndex: currentIndex,
            endIndex: endIndex
          });
          
          currentIndex = endIndex;
          inCodeBlock = false;
          codeBlockStart = -1;
          codeBlockContent = [];
          continue;
        }
      } else if (inCodeBlock) {
        // Inside code block - accumulate content
        codeBlockContent.push(line);
        currentIndex += lineWithNewline.length;
        continue;
      }

      // Regular line (not in code block)
      if (!inCodeBlock) {
        const endIndex = currentIndex + lineWithNewline.length;
        
        lines.push({
          id: `line-${i}`,
          content: line,
          lineNumber: i + 1,
          isMultiLine: false,
          startIndex: currentIndex,
          endIndex: endIndex
        });
        
        currentIndex = endIndex;
      } else {
        currentIndex += lineWithNewline.length;
      }
    }

    debugLog('Parsed lines', { lineCount: lines.length, lines: lines.slice(0, 3) });
    return lines;
  }, [debugLog]);

  // Initialize lines when content changes
  useEffect(() => {
    debugLog('Content changed, re-parsing lines');
    const parsedLines = parseContentIntoLines(content);
    setLines(parsedLines);
  }, [content, parseContentIntoLines, debugLog]);

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

  // Handle line click to start editing
  const handleLineClick = useCallback((line: EditableLine, clickEvent: React.MouseEvent) => {
    debugLog('Line clicked', { lineId: line.id, isEditing: editingLineId === line.id });
    
    if (editingLineId === line.id) {
      return; // Already editing this line
    }

    // Save current edit if switching lines
    if (editingLineId) {
      saveCurrentEdit();
    }

    setEditingLineId(line.id);
    setEditingContent(line.content);

    // Focus input after state update
    setTimeout(() => {
      if (editInputRef.current) {
        editInputRef.current.focus();
        
        // Position cursor based on click location (approximate)
        const rect = (clickEvent.target as HTMLElement).getBoundingClientRect();
        const clickX = clickEvent.clientX - rect.left;
        const charWidth = 8; // Approximate character width
        const cursorPosition = Math.min(Math.floor(clickX / charWidth), line.content.length);
        editInputRef.current.setSelectionRange(cursorPosition, cursorPosition);
      }
    }, 10);
  }, [editingLineId, debugLog]);

  // Save current edit and update content
  const saveCurrentEdit = useCallback(() => {
    if (!editingLineId) return;

    debugLog('Saving current edit', { lineId: editingLineId, newContent: editingContent });

    const lineIndex = lines.findIndex(line => line.id === editingLineId);
    if (lineIndex === -1) return;

    const line = lines[lineIndex];
    const newLines = [...lines];
    newLines[lineIndex] = { ...line, content: editingContent };

    // Reconstruct full content
    const newContent = newLines.map(l => l.content).join('\n');
    debugLog('Reconstructed content', { newContentLength: newContent.length });

    // Performance check for large documents
    if (newLines.length > maxLines) {
      const errorMsg = `Document too large (${newLines.length} lines). Maximum ${maxLines} lines supported.`;
      debugLog('Performance limit exceeded', errorMsg);
      setSaveError(errorMsg);
      if (onError) {
        onError(errorMsg);
      }
      return;
    }

    onContentChange(newContent);
    setHasUnsavedChanges(true);
    triggerAutoSave();
    
    setEditingLineId(null);
    setEditingContent('');
  }, [editingLineId, editingContent, lines, onContentChange, triggerAutoSave, debugLog, maxLines, onError]);

  // Handle click outside to save and exit edit mode
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (editingLineId && containerRef.current && !containerRef.current.contains(event.target as Node)) {
      debugLog('Click outside detected, saving edit');
      saveCurrentEdit();
    }
  }, [editingLineId, saveCurrentEdit, debugLog]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    debugLog('Key pressed', { key: event.key, ctrlKey: event.ctrlKey });

    if (event.key === 'Escape') {
      debugLog('Escape pressed, canceling edit');
      setEditingLineId(null);
      setEditingContent('');
      event.preventDefault();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      // Allow Enter to create new lines instead of saving
      return;
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      const textarea = event.target as HTMLTextAreaElement;
      const cursorPos = textarea.selectionStart;
      const content = textarea.value;
      const lines = content.split('\n');
      
      // Find current line info
      const beforeCursor = content.substring(0, cursorPos);
      const currentLineIndex = beforeCursor.split('\n').length - 1;
      const currentLine = lines[currentLineIndex];
      const cursorPosInLine = beforeCursor.split('\n')[currentLineIndex]?.length || 0;
      
      debugLog(`Delete/Backspace debug:`, {
        key: event.key,
        cursorPos,
        currentLineIndex,
        currentLine: currentLine,
        currentLineLength: currentLine.length,
        currentLineTrimmed: currentLine.trim(),
        cursorPosInLine,
        linesLength: lines.length,
        fullContentLength: content.length,
        fullContentLines: content.split('\n').length,
        isEmptyLine: currentLine.trim() === ''
      });
      
      // Handle backspace at start of line
      if (event.key === 'Backspace' && cursorPosInLine === 0 && currentLineIndex > 0) {
        // Merge with previous line
        const prevLineLength = lines[currentLineIndex - 1].length;
        lines[currentLineIndex - 1] += lines[currentLineIndex];
        lines.splice(currentLineIndex, 1);
        
        const newContent = lines.join('\n');
        setEditingContent(newContent);
        onContentChange(newContent); // Trigger content change callback
        
        // Position cursor at junction point
        setTimeout(() => {
          const newCursorPos = lines.slice(0, currentLineIndex - 1).join('\n').length + 
                              (currentLineIndex > 1 ? 1 : 0) + prevLineLength;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
        
        event.preventDefault();
      }
      // Handle delete on empty or whitespace-only line
      else if (event.key === 'Delete' && currentLine.length === 0 && lines.length > 1) {
        debugLog('Delete on empty line triggered');
        
        // Always move cursor to end of previous line when deleting empty line
        const prevLineLength = currentLineIndex > 0 ? lines[currentLineIndex - 1].length : 0;
        
        // Remove the empty line
        lines.splice(currentLineIndex, 1);
        const newContent = lines.join('\n');
        setEditingContent(newContent);
        onContentChange(newContent); // Trigger content change callback
        
        setTimeout(() => {
          let newCursorPos;
          if (currentLineIndex > 0) {
            // Move to end of previous line
            newCursorPos = lines.slice(0, currentLineIndex - 1).join('\n').length + 
                          (currentLineIndex > 1 ? 1 : 0) + prevLineLength;
          } else {
            // If we deleted the first line, move to start of new first line
            newCursorPos = 0;
          }
          debugLog('Setting cursor position:', { newCursorPos, prevLineLength });
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
        
        event.preventDefault();
      }
      // Handle backspace/delete on empty line
      else if ((event.key === 'Backspace' || event.key === 'Delete') && currentLine.length === 0) {
        debugLog('Backspace/Delete on empty line triggered');
        
        if (lines.length > 1) {
          // Multiple lines - remove empty line and move cursor appropriately
          if (currentLineIndex > 0) {
            // Not first line - move to end of previous line
            const prevLineLength = lines[currentLineIndex - 1].length;
            lines.splice(currentLineIndex, 1);
            const newContent = lines.join('\n');
            setEditingContent(newContent);
            onContentChange(newContent); // Trigger content change callback
            
            setTimeout(() => {
              const newCursorPos = lines.slice(0, currentLineIndex - 1).join('\n').length + 
                                  (currentLineIndex > 1 ? 1 : 0) + prevLineLength;
              debugLog('Setting cursor position:', { newCursorPos, prevLineLength });
              textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
          } else {
            // First line - just remove it, cursor stays at start
            lines.splice(0, 1);
            const newContent = lines.join('\n');
            setEditingContent(newContent);
            onContentChange(newContent); // Trigger content change callback
            
            setTimeout(() => {
              textarea.setSelectionRange(0, 0);
            }, 0);
          }
        } else if (lines.length === 1 && currentLine.length === 0) {
          // Single empty line - this should not happen in normal editing
          // But if it does, we need to check if there are other lines in the full content
          debugLog('Single empty line case - checking full content context');
          
          // Get the full content to see if this is part of a larger document
          const fullLines = content.split('\n');
          if (fullLines.length > 1) {
            // There are other lines, remove this empty line
            fullLines.splice(currentLineIndex, 1);
            const newContent = fullLines.join('\n');
            setEditingContent(newContent);
            onContentChange(newContent);
            
            // Exit edit mode and let the parent re-render
            setTimeout(() => {
              setEditingLineId(null);
              setEditingContent('');
            }, 10);
          } else {
            // Truly single line document - clear it
            setEditingContent('');
            onContentChange('');
            
            setTimeout(() => {
              setEditingLineId(null);
              setEditingContent('');
            }, 10);
          }
        }
        
        event.preventDefault();
      }
    } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      debugLog('Ctrl+S pressed, force saving');
      saveCurrentEdit();
      onSave();
      event.preventDefault();
    }
  }, [editingLineId, lines, saveCurrentEdit, onSave, debugLog]);

  // Set up click outside listener
  useEffect(() => {
    if (editingLineId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [editingLineId, handleClickOutside]);

  // Render a single line (either in edit or view mode)
  const renderLine = useCallback((line: EditableLine) => {
    const isEditing = editingLineId === line.id;

    if (isEditing) {
      return (
        <div key={line.id} className="inline-editor-line editing">
          <textarea
            ref={editInputRef}
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="inline-editor-input"
            style={{
              minHeight: line.isMultiLine ? '120px' : '24px',
              resize: line.isMultiLine ? 'vertical' : 'none',
              fontFamily: line.content.trim().startsWith('```') ? 'monospace' : 'inherit'
            }}
            placeholder={line.lineNumber === 1 && !line.content ? 'Click to start writing...' : ''}
          />
        </div>
      );
    }

    // View mode - render markdown or empty placeholder
    return (
      <div
        key={line.id}
        className={`inline-editor-line ${line.isMultiLine ? 'multi-line' : 'single-line'}`}
        onClick={(e) => handleLineClick(line, e)}
        style={{ cursor: 'text', minHeight: '24px' }}
      >
        {line.content.trim() ? (
          <ReactMarkdown>{line.content}</ReactMarkdown>
        ) : (
          <div className="empty-line-placeholder" style={{ 
            color: '#9ca3af', 
            fontStyle: 'italic',
            minHeight: '20px',
            padding: '2px 0'
          }}>
            {line.lineNumber === 1 ? 'Click to start writing...' : 'Empty line'}
          </div>
        )}
      </div>
    );
  }, [editingLineId, editingContent, handleKeyDown, handleLineClick]);

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

      {/* Render all lines */}
      <div className="inline-editor-content">
        {lines.map(renderLine)}
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
          Lines: {lines.length} | Editing: {editingLineId || 'none'} | Last save: {lastSaveTime ? new Date(lastSaveTime).toLocaleTimeString() : 'never'}
        </div>
      )}
    </div>
  );
};

export default InlineEditor;
