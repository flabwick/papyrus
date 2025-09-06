import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Page as CardType, WorkspacePage as WorkspaceCard } from '../types';
import { useApp } from '../contexts/AppContext';
import api from '../services/api';
import PageSearchInterface from './PageSearchInterface';
import GenerateInterface from './GenerateInterface';
import FileUploadInterface from './FileUploadInterface';
import FileAddInterface from './FileAddInterface';
import PDFPage from './PDFPage';
import EPUBPage from './EPUBPage';

interface PageProps {
  page: CardType;
  workspacePage: WorkspaceCard;
  workspaceId: string;
  libraryId: string;
  depth?: number;
  onUpdate: (pageId: string, updates: Partial<CardType>) => void;
  onDelete: (pageId: string) => void; // Remove from workspace
  onDeleteFromLibrary?: (pageId: string) => void; // Delete completely from library
  onToggleCollapse?: (workspacePageId: string) => void; // Made optional since we handle display locally now
  onAddPageBelow?: (afterPosition: number) => void;
  onCreatePageBelow?: (afterPosition: number) => void;
  onGeneratePageBelow?: (afterPosition: number, prompt: string, model: string) => void;
  onUploadFileBelow?: (afterPosition: number) => void;
  isGenerating?: boolean;
  onStopGeneration?: () => void;
  onMoveUp?: (pageId: string) => void;
  onMoveDown?: (pageId: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
  showAddInterface?: boolean;
  onAddPage?: (pageId: string, position: number) => void;
  onCancelAdd?: () => void;
  showUploadInterface?: boolean;
  onFileUploaded?: (filePage: any) => void;
  onCancelUpload?: () => void;
  onAddFileBelow?: (afterPosition: number) => void;
  showFileAddInterface?: boolean;
  onAddFile?: (file: any, position: number) => void;
  onCancelFileAdd?: () => void;
}

const Page: React.FC<PageProps> = ({
  page,
  workspacePage,
  workspaceId,
  libraryId,
  depth = 0,
  onUpdate,
  onDelete,
  onDeleteFromLibrary,
  onToggleCollapse,
  onAddPageBelow,
  onCreatePageBelow,
  onGeneratePageBelow,
  onUploadFileBelow,
  isGenerating = false,
  onStopGeneration,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
  showAddInterface = false,
  onAddPage,
  onCancelAdd,
  showUploadInterface = false,
  onFileUploaded,
  onCancelUpload,
  onAddFileBelow,
  showFileAddInterface = false,
  onAddFile,
  onCancelFileAdd,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(!page.title);
  const [editContent, setEditContent] = useState(page.content || page.contentPreview || '');
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [saveIndicatorPulse, setSaveIndicatorPulse] = useState(false);
  const [showGenerateInterface, setShowGenerateInterface] = useState(false);
  const [localShowAddInterface, setLocalShowAddInterface] = useState(showAddInterface || false);
  const [localShowFileAddInterface, setLocalShowFileAddInterface] = useState(showFileAddInterface || false);

  // Sync local state with showAddInterface prop
  useEffect(() => {
    setLocalShowAddInterface(showAddInterface || false);
  }, [showAddInterface]);

  // Sync local state with showFileAddInterface prop
  useEffect(() => {
    setLocalShowFileAddInterface(showFileAddInterface || false);
  }, [showFileAddInterface]);
  const [editTitle, setEditTitle] = useState(page.title || '');
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const { aiContextPages, toggleAIContext } = useApp();

  const pageId = page?.id || workspacePage?.pageId || 'unknown';

 

  const isInAIContext = aiContextPages.includes(pageId);
  
  // Two display states: collapsed (heading only) or expanded (full markdown)
  // AI generated cards default to expanded, others default to collapsed
  const [isExpanded, setIsExpanded] = useState<boolean>(
    (!page.title && page.content) || isGenerating ? true : false
  );

  useEffect(() => {
    setEditTitle(page.title || '');
    setEditContent(page.content || page.contentPreview || '');
    // Reset full content when page changes
    setFullContent(null);
  }, [page.title, page.content, page.contentPreview]);

  // Load full content when editing starts
  const loadFullContent = async () => {
    if (fullContent !== null || isLoadingContent) return fullContent;
    
    try {
      setIsLoadingContent(true);
      const response = await api.get(`/pages/${pageId}`);
      const content = response.data.page.content || '';
      setFullContent(content);
      return content;
    } catch (error) {
      console.error('Failed to load full card content:', error);
      // Fallback to existing content
      const fallbackContent = page.content || page.contentPreview || '';
      setFullContent(fallbackContent);
      return fallbackContent;
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleTitleSubmit = async () => {
    const newTitle = editTitle.trim();
    const oldTitle = page.title || '';
    
    if (newTitle !== oldTitle) {
      if (!page.title) {
        // Check if this is an unsaved page that needs conversion
        try {
          const response = await api.post(`/pages/${pageId}/convert-to-saved`, {
            title: newTitle
          });
          
          setSaveIndicatorPulse(true);
          setTimeout(() => setSaveIndicatorPulse(false), 1000);
        
          // The page may have converted from unsaved to saved
          if (response.data.page.title) {
            // Update immediately without scroll position changes
            if (onUpdate) {
              await onUpdate(page.id, { 
                title: response.data.page.title
              });
            }
          }
        } catch (error: any) {
          console.error('Failed to update unsaved page:', error);
          
          // Check for title conflict error
          if (error.response?.status === 409 || error.response?.data?.message?.includes('already exists')) {
            setTitleError(`A page with the title "${newTitle}" already exists in this library`);
            return; // Don't proceed with fallback
          }
          
          // Other errors - fallback to regular update
          try {
            await onUpdate(page.id, { title: newTitle });
            setTitleError(null);
          } catch (fallbackError: any) {
            if (fallbackError.response?.status === 409 || fallbackError.response?.data?.message?.includes('already exists')) {
              setTitleError(`A page with the title "${newTitle}" already exists in this library`);
            }
          }
        }
      } else {
        try {
          await onUpdate(page.id, { title: newTitle });
          setTitleError(null); // Clear any previous errors
        } catch (error: any) {
          if (error.response?.status === 409 || error.response?.data?.message?.includes('already exists')) {
            setTitleError(`A page with the title "${newTitle}" already exists in this library`);
            return; // Don't close editing mode
          }
          throw error; // Re-throw other errors
        }
      }
    }
    if (!titleError) { // Only close editing if there's no error
      setIsEditingTitle(false);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setEditTitle(page.title || '');
      setTitleError(null);
      setIsEditingTitle(false);
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditTitle(e.target.value);
    if (titleError) {
      setTitleError(null); // Clear error when user starts typing
    }
  };

  const handleContentSubmit = async () => {
    const originalContent = fullContent || page.content || page.contentPreview || '';
    if (editContent !== originalContent) {
      if (!page.title) {
        // Use the special update endpoint for unsaved pages
        try {
          const response = await api.put(`/pages/${page.id}/update-with-title`, {
            title: page.title || null,
            content: editContent
          });
          
          // Show save animation (but page remains unsaved until title is added)
          setSaveIndicatorPulse(true);
          setTimeout(() => setSaveIndicatorPulse(false), 1000);
          
          // Update content immediately
          if (onUpdate) {
            await onUpdate(page.id, { 
              content: editContent
            });
          }
        } catch (error) {
          console.error('Failed to update unsaved page content:', error);
          // Fallback to regular update
          await onUpdate(pageId, { content: editContent });
        }
      } else {
        await onUpdate(pageId, { content: editContent });
        // Show save animation for regular pages too
        setSaveIndicatorPulse(true);
        setTimeout(() => setSaveIndicatorPulse(false), 1000);
      }
    }
    setIsEditingContent(false);
  };

  const handleContentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      const contentToRestore = fullContent || page.content || page.contentPreview || '';
      setEditContent(contentToRestore);
      setIsEditingContent(false);
      // Also cancel title editing
      setEditTitle(page.title || '');
      setIsEditingTitle(false);
    }
    // Ctrl+S to save both title and content
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleTitleSubmit();
      handleContentSubmit();
    }
  };

  // Toggle between collapsed and expanded states
  const handleToggleDisplay = () => {
    setIsExpanded(prev => !prev);
  };

  // Get the appropriate icon for current display state
  const getDisplayIcon = () => {
    return isExpanded ? '▼' : '▶'; // Down arrow for expanded, right arrow for collapsed
  };

  const cardClasses = [
    'card',
    page.title ? 'card-saved' : 'card-unsaved',
    isInAIContext && 'card-ai-context',
    isExpanded ? 'card-expanded' : 'card-collapsed',
    depth > 0 && 'card-nested'
  ].filter(Boolean).join(' ');

  const titleStyle = depth > 0 ? {
    fontSize: `${Math.max(13, 15 - depth)}px`
  } : {};

  // Check if this is a file page and render appropriate component
  if ((page as any).isFileCard || (page as any).fileId || (page as any).cardType === 'file') {
    console.log('File page detected:', { 
      cardType: (page as any).cardType, 
      fileId: (page as any).fileId,
      fileType: (page as any).fileType,
      isFileCard: (page as any).isFileCard,
      content: page.content
    });
    
    // Determine file type from page metadata or content indicators
    const isPDFPage = (page as any).fileType === 'pdf' || 
                      page.title?.toLowerCase().includes('pdf') ||
                      page.content?.includes('PDF Document');
    const isEPUBPage = (page as any).fileType === 'epub' || 
                       page.title?.toLowerCase().includes('epub') ||
                       page.content?.includes('EPUB eBook') ||
                       page.content?.startsWith('File:'); // New file pages start with "File:"
    
    if (isPDFPage) {
      return (
        <PDFPage
          card={page}
          streamCard={workspacePage}
          streamId={workspaceId}
          libraryId={libraryId}
          depth={depth}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          isFirst={isFirst}
          isLast={isLast}
        />
      );
    } else if (isEPUBPage) {
      return (
        <EPUBPage
          card={page}
          streamCard={workspacePage}
          streamId={workspaceId}
          libraryId={libraryId}
          depth={depth}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          isFirst={isFirst}
          isLast={isLast}
        />
      );
    }
  }

  return (
    <div className={cardClasses} data-card-id={pageId}>
      <div className="card-header" onClick={handleToggleDisplay}>        
        {isEditingTitle ? (
          <div>
            <input
              type="text"
              value={editTitle}
              onChange={handleTitleChange}
              onBlur={handleTitleSubmit}
              onKeyDown={handleTitleKeyDown}
              className="card-title-editable"
              style={{
                ...titleStyle,
                border: titleError ? '2px solid #ef4444' : undefined,
                borderRadius: titleError ? '4px' : undefined
              }}
              placeholder={!page.title ? '' : 'Card title'}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            {titleError && (
              <div 
                style={{ 
                  color: '#ef4444', 
                  fontSize: '12px', 
                  marginTop: '4px',
                  fontWeight: '500'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {titleError}
              </div>
            )}
          </div>
        ) : (
          <>
            {!page.title ? (
              // For unsaved cards with no title, show different display based on content
              <div 
                className="card-title-placeholder"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }}
                title="Click to add title"
              >
                <span className="unsaved-indicator">📝</span>
                <span className="placeholder-text">
                  {(page.content || page.contentPreview) ? 'Click to add title...' : 'Click to add title...'}
                </span>
              </div>
            ) : (
              <h3 
                className={`card-title ${!page.title ? 'unsaved-title' : ''}`}
                style={titleStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }}
              >
                {page.title || ''}
              </h3>
            )}
          </>
        )}

        <div className="card-controls">
          {/* Generation stop button - only show when generating */}
          {isGenerating && onStopGeneration && (
            <button
              type="button"
              className="btn btn-small"
              onClick={(e) => {
                e.stopPropagation();
                onStopGeneration();
              }}
              title="Stop generation"
              style={{ 
                color: '#ef4444',
                fontWeight: 'bold',
                fontSize: '12px'
              }}
            >
              ⏹️
            </button>
          )}
          
          {/* Small save status indicator */}
          <div 
            className={`save-status-indicator ${page.title ? 'saved' : 'unsaved'} ${saveIndicatorPulse ? 'pulse' : ''}`}
            title={page.title ? 'Saved to library' : 'Unsaved - needs title to be saved'}
          >
            <div className="save-dot"></div>
          </div>
          
          <button
            type="button"
            className={`ai-context-button ${isInAIContext ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (page.canBeInAIContext ?? true) {
                toggleAIContext(pageId);
              }
            }}
            disabled={!(page.canBeInAIContext ?? true)}
            title={
              !(page.canBeInAIContext ?? true) 
                ? `${page.typeInfo?.label || 'This card type'} cannot be used in AI context`
                : isInAIContext 
                  ? "Remove from AI context" 
                  : "Add to AI context"
            }
          >
            AI
          </button>
          
          <button
            type="button"
            className="btn btn-small"
            onClick={async (e) => {
              e.stopPropagation();
              // Load full content before editing
              const content = await loadFullContent();
              setEditContent(content);
              setIsEditingContent(true);
              // Always show title as editable when editing content
              setIsEditingTitle(true);
            }}
            disabled={isLoadingContent}
            title="Edit card"
          >
            {isLoadingContent ? '🔄' : '✏️'}
          </button>
          
          {/* Remove from workspace button */}
          <button
            type="button"
            className="btn btn-small"
            onClick={(e) => {
              e.stopPropagation();
              // Show warning for unsaved cards since they'll be deleted permanently
              if (!page.title) {
                if (window.confirm('This unsaved card will be permanently deleted when removed from the workspace. Continue?')) {
                  onDelete(pageId);
                }
              } else {
                onDelete(pageId);
              }
            }}
            title={page.title ? "Remove card from workspace (keeps in library)" : "Remove unsaved card (will be permanently deleted)"}
            style={{ 
              color: page.title ? '#f59e0b' : '#ef4444',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            −
          </button>
          
          {/* Delete from library button (only for saved cards with titles) */}
          {page.title && onDeleteFromLibrary && (
            <button
              type="button"
              className="btn btn-small"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Delete this card completely from the library? This cannot be undone.')) {
                  onDeleteFromLibrary(pageId);
                }
              }}
              title="Delete card completely from library"
              style={{ 
                color: '#ef4444',
                fontWeight: 'bold',
                fontSize: '16px'
              }}
            >
              ×
            </button>
          )}
          
          {/* Reordering controls */}
          {(onMoveUp || onMoveDown) && (
            <>
              <button
                type="button"
                className="btn btn-small"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp?.(pageId);
                }}
                disabled={isFirst}
                title="Move card up"
                style={{ opacity: isFirst ? 0.3 : 1 }}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown?.(pageId);
                }}
                disabled={isLast}
                title="Move card down"
                style={{ opacity: isLast ? 0.3 : 1 }}
              >
                ↓
              </button>
            </>
          )}
          
          <button
            type="button"
            className="btn btn-small"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleDisplay();
            }}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {getDisplayIcon()}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="card-content">
          {isEditingContent ? (
            <div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleContentKeyDown}
                className="form-input form-textarea"
                style={{ 
                  width: '100%', 
                  marginBottom: '12px',
                  minHeight: editContent.length > 1000 ? '400px' : '120px',
                  maxHeight: '80vh'
                }}
                autoFocus
                placeholder="Write your content in markdown..."
              />
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                {editContent.length.toLocaleString()} characters • {Math.round(editContent.split(/\s+/).filter((w: string) => w.length > 0).length).toLocaleString()} words
              </div>
              <div className="flex gap-sm">
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={async () => {
                    // Save both title and content
                    await handleTitleSubmit();
                    await handleContentSubmit();
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    const contentToRestore = fullContent || page.content || page.contentPreview || '';
                    setEditContent(contentToRestore);
                    setIsEditingContent(false);
                    // Also cancel title editing
                    setEditTitle(page.title || '');
                    setIsEditingTitle(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div 
              className="card-content-display card-content-expanded"
              onDoubleClick={async () => {
                const content = await loadFullContent();
                setEditContent(content);
                setIsEditingContent(true);
                // Also enable title editing when double-clicking content
                setIsEditingTitle(true);
              }}
            >
              {(page.content || page.contentPreview) ? (
                // Fully expanded - show complete content or load it if needed
                fullContent ? (
                  <ReactMarkdown>{fullContent}</ReactMarkdown>
                ) : (
                  <>
                    <ReactMarkdown>{page.content || page.contentPreview}</ReactMarkdown>
                  </>
                )
              ) : (
                <div className="empty-content-placeholder">
                  {!page.title ? (
                    // For completely empty unsaved cards
                    <p style={{ color: '#f59e0b', fontStyle: 'italic', textAlign: 'center' }}>
                      Empty card - Double-click to add content
                    </p>
                  ) : (
                    // For cards with titles but no content
                    <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
                      No content yet. Double-click to add content.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      
      {/* Inline Page Search Interface */}
      {localShowAddInterface && onAddPage && onCancelAdd && (
        <PageSearchInterface
          libraryId={libraryId}
          workspaceId={workspaceId}
          workspaceCards={[workspacePage]} // Pass current workspace page to avoid showing it
          onCardSelected={(card) => onAddPage(card.id, workspacePage.position)}
          onCancel={() => {
            setLocalShowAddInterface(false);
            onCancelAdd();
          }}
        />
      )}
      
      {/* AI Generation Interface */}
      {showGenerateInterface && onGeneratePageBelow && (
        <GenerateInterface
          libraryId={libraryId}
          position={workspacePage.position}
          contextCards={aiContextPages}
          onGenerate={(prompt, model, position) => {
            onGeneratePageBelow(position, prompt, model);
            setLocalShowAddInterface(false);
          }}
          onCancel={() => setShowGenerateInterface(false)}
        />
      )}
      
      {/* File Add Interface */}
      {localShowFileAddInterface && onAddFile && onCancelFileAdd && (
        <FileAddInterface
          libraryId={libraryId}
          workspaceId={workspaceId}
          position={workspacePage.position}
          onFileSelected={(file: any) => onAddFile(file, workspacePage.position)}
          onFileUploaded={(filePage: any) => onFileUploaded && onFileUploaded(filePage)}
          onCancel={() => {
            setLocalShowFileAddInterface(false);
            onCancelFileAdd();
          }}
        />
      )}
      
      {/* File Upload Interface */}
      {showUploadInterface && onFileUploaded && onCancelUpload && (
        <FileUploadInterface
          libraryId={libraryId}
          streamId={workspaceId}
          position={workspacePage.position}
          onFileUploaded={(filePage: any) => onFileUploaded(filePage)}
          onCancel={onCancelUpload}
        />
      )}
    </div>
  );
};

export default Page;