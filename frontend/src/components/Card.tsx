import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card as CardType, StreamCard } from '../types';
import { useApp } from '../contexts/AppContext';
import api from '../services/api';
import CardSearchInterface from './CardSearchInterface';
import GenerateInterface from './GenerateInterface';
import FileUploadInterface from './FileUploadInterface';
import FileSearchInterface from './FileSearchInterface';
import PDFCard from './PDFCard';
import EPUBCard from './EPUBCard';

interface CardProps {
  card: CardType;
  streamCard: StreamCard;
  streamId: string;
  brainId: string;
  depth?: number;
  onUpdate: (cardId: string, updates: Partial<CardType>) => void;
  onDelete: (cardId: string) => void; // Remove from stream
  onDeleteFromBrain?: (cardId: string) => void; // Delete completely from brain
  onToggleCollapse?: (streamCardId: string) => void; // Made optional since we handle display locally now
  onAddCardBelow?: (afterPosition: number) => void;
  onCreateCardBelow?: (afterPosition: number) => void;
  onGenerateCardBelow?: (afterPosition: number, prompt: string, model: string) => void;
  onUploadFileBelow?: (afterPosition: number) => void;
  isGenerating?: boolean;
  onStopGeneration?: () => void;
  onMoveUp?: (cardId: string) => void;
  onMoveDown?: (cardId: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
  showAddInterface?: boolean;
  onAddCard?: (cardId: string, position: number) => void;
  onCancelAdd?: () => void;
  showUploadInterface?: boolean;
  onFileUploaded?: (fileCard: any) => void;
  onCancelUpload?: () => void;
  onAddFileBelow?: (afterPosition: number) => void;
  showFileAddInterface?: boolean;
  onAddFile?: (file: any, position: number) => void;
  onCancelFileAdd?: () => void;
}

const Card: React.FC<CardProps> = ({
  card,
  streamCard,
  streamId,
  brainId,
  depth = 0,
  onUpdate,
  onDelete,
  onDeleteFromBrain,
  onToggleCollapse,
  onAddCardBelow,
  onCreateCardBelow,
  onGenerateCardBelow,
  onUploadFileBelow,
  isGenerating = false,
  onStopGeneration,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
  showAddInterface = false,
  onAddCard,
  onCancelAdd,
  showUploadInterface = false,
  onFileUploaded,
  onCancelUpload,
  onAddFileBelow,
  showFileAddInterface = false,
  onAddFile,
  onCancelFileAdd,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(!card.title);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editTitle, setEditTitle] = useState(card.title || '');
  const [editContent, setEditContent] = useState(card.content || card.contentPreview || '');
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [saveIndicatorPulse, setSaveIndicatorPulse] = useState(false);
  const [showGenerateInterface, setShowGenerateInterface] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const { aiContextCards, toggleAIContext } = useApp();

  const cardId = (card as any).cardId || card.id; // Use cardId if available, fallback to id
  const isInAIContext = aiContextCards.includes(cardId);
  
  // Three display states: 0 = collapsed (heading only), 1 = preview (limited), 2 = expanded (full)
  // AI generated cards default to expanded (2), others default to preview (1)
  const [displayState, setDisplayState] = useState<0 | 1 | 2>(
    (!card.title && card.content) || isGenerating ? 2 : 1
  );

  useEffect(() => {
    setEditTitle(card.title || '');
    setEditContent(card.content || card.contentPreview || '');
    // Reset full content when card changes
    setFullContent(null);
  }, [card.title, card.content, card.contentPreview]);

  // Load full content when editing starts
  const loadFullContent = async () => {
    if (fullContent !== null || isLoadingContent) return fullContent;
    
    try {
      setIsLoadingContent(true);
      const response = await api.get(`/cards/${cardId}`);
      const content = response.data.card.content || '';
      setFullContent(content);
      return content;
    } catch (error) {
      console.error('Failed to load full card content:', error);
      // Fallback to existing content
      const fallbackContent = card.content || card.contentPreview || '';
      setFullContent(fallbackContent);
      return fallbackContent;
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleTitleSubmit = async () => {
    const newTitle = editTitle.trim();
    const oldTitle = card.title || '';
    
    if (newTitle !== oldTitle) {
      if (!card.title) {
        // Use the special update endpoint for unsaved cards to trigger conversion
        try {
          const response = await api.put(`/cards/${card.id}/update-with-title`, {
            title: newTitle || null,
            content: fullContent || card.content || card.contentPreview || ''
          });
          
          // Show save animation when title is added (converting to saved)
          if (newTitle && response.data.card.title) {
            setSaveIndicatorPulse(true);
            setTimeout(() => setSaveIndicatorPulse(false), 1000);
          }
          
          // The card may have converted from unsaved to saved
          if (response.data.card.title) {
            // Update immediately without scroll position changes
            if (onUpdate) {
              await onUpdate(card.id, { 
                title: response.data.card.title,
                cardType: response.data.card.cardType 
              });
            }
          }
        } catch (error: any) {
          console.error('Failed to update unsaved card:', error);
          
          // Check for title conflict error
          if (error.response?.status === 409 || error.response?.data?.message?.includes('already exists')) {
            setTitleError(`A card with the title "${newTitle}" already exists in this brain`);
            return; // Don't proceed with fallback
          }
          
          // Other errors - fallback to regular update
          try {
            await onUpdate(card.id, { title: newTitle });
            setTitleError(null);
          } catch (fallbackError: any) {
            if (fallbackError.response?.status === 409 || fallbackError.response?.data?.message?.includes('already exists')) {
              setTitleError(`A card with the title "${newTitle}" already exists in this brain`);
            }
          }
        }
      } else {
        try {
          await onUpdate(card.id, { title: newTitle });
          setTitleError(null); // Clear any previous errors
        } catch (error: any) {
          if (error.response?.status === 409 || error.response?.data?.message?.includes('already exists')) {
            setTitleError(`A card with the title "${newTitle}" already exists in this brain`);
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
      setEditTitle(card.title || '');
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
    const originalContent = fullContent || card.content || card.contentPreview || '';
    if (editContent !== originalContent) {
      if (!card.title) {
        // Use the special update endpoint for unsaved cards
        try {
          const response = await api.put(`/cards/${card.id}/update-with-title`, {
            title: card.title || null,
            content: editContent
          });
          
          // Show save animation (but card remains unsaved until title is added)
          setSaveIndicatorPulse(true);
          setTimeout(() => setSaveIndicatorPulse(false), 1000);
          
          // Update content immediately
          if (onUpdate) {
            await onUpdate(card.id, { 
              content: editContent,
              contentPreview: editContent.substring(0, 500)
            });
          }
        } catch (error) {
          console.error('Failed to update unsaved card content:', error);
          // Fallback to regular update
          await onUpdate(cardId, { content: editContent });
        }
      } else {
        await onUpdate(cardId, { content: editContent });
        // Show save animation for regular cards too
        setSaveIndicatorPulse(true);
        setTimeout(() => setSaveIndicatorPulse(false), 1000);
      }
    }
    setIsEditingContent(false);
  };

  const handleContentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      const contentToRestore = fullContent || card.content || card.contentPreview || '';
      setEditContent(contentToRestore);
      setIsEditingContent(false);
      // Also cancel title editing
      setEditTitle(card.title || '');
      setIsEditingTitle(false);
    }
    // Ctrl+S to save both title and content
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleTitleSubmit();
      handleContentSubmit();
    }
  };

  // Toggle between the three display states
  const handleToggleDisplay = () => {
    setDisplayState(prevState => {
      if (prevState === 0) return 1; // collapsed → preview
      if (prevState === 1) return 2; // preview → expanded
      return 0; // expanded → collapsed
    });
  };

  // Get the appropriate icon for current display state
  const getDisplayIcon = () => {
    switch (displayState) {
      case 0: return '›'; // Collapsed - right arrow (different symbol)
      case 1: return '‹'; // Preview - left arrow (different symbol)
      case 2: return '«'; // Expanded - double left arrow (different symbol)
      default: return '‹';
    }
  };

  const cardClasses = [
    'card',
    card.title ? 'card-saved' : 'card-unsaved',
    isInAIContext && 'card-ai-context',
    displayState === 0 && 'card-collapsed',
    displayState === 1 && 'card-preview',
    displayState === 2 && 'card-expanded',
    depth > 0 && 'card-nested'
  ].filter(Boolean).join(' ');

  const titleStyle = depth > 0 ? {
    fontSize: `${Math.max(13, 15 - depth)}px`
  } : {};

  // Check if this is a file card and render appropriate component
  if ((card as any).isFileCard || (card as any).fileId || (card as any).cardType === 'file') {
    console.log('File card detected:', { 
      cardType: (card as any).cardType, 
      fileId: (card as any).fileId,
      fileType: (card as any).fileType,
      isFileCard: (card as any).isFileCard,
      content: card.content
    });
    
    // Determine file type from card metadata or content indicators
    const isPDFCard = (card as any).fileType === 'pdf' || 
                      card.title?.toLowerCase().includes('pdf') ||
                      card.content?.includes('PDF Document');
    const isEPUBCard = (card as any).fileType === 'epub' || 
                       card.title?.toLowerCase().includes('epub') ||
                       card.content?.includes('EPUB eBook') ||
                       card.content?.startsWith('File:'); // New file cards start with "File:"
    
    if (isPDFCard) {
      return (
        <PDFCard
          card={card}
          streamCard={streamCard}
          streamId={streamId}
          brainId={brainId}
          depth={depth}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          isFirst={isFirst}
          isLast={isLast}
        />
      );
    } else if (isEPUBCard) {
      return (
        <EPUBCard
          card={card}
          streamCard={streamCard}
          streamId={streamId}
          brainId={brainId}
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
    <div className={cardClasses} data-card-id={cardId}>
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
              placeholder={!card.title ? '' : 'Card title'}
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
            {!card.title ? (
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
                  {(card.content || card.contentPreview) ? 'Click to add title...' : 'Click to add title...'}
                </span>
              </div>
            ) : (
              <h3 
                className={`card-title ${!card.title ? 'unsaved-title' : ''}`}
                style={titleStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }}
              >
                {card.title || ''}
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
            className={`save-status-indicator ${card.title ? 'saved' : 'unsaved'} ${saveIndicatorPulse ? 'pulse' : ''}`}
            title={card.title ? 'Saved to brain' : 'Unsaved - needs title to be saved'}
          >
            <div className="save-dot"></div>
          </div>
          
          <button
            type="button"
            className={`ai-context-button ${isInAIContext ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (card.canBeInAIContext ?? true) {
                toggleAIContext(cardId);
              }
            }}
            disabled={!(card.canBeInAIContext ?? true)}
            title={
              !(card.canBeInAIContext ?? true) 
                ? `${card.typeInfo?.label || 'This card type'} cannot be used in AI context`
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
          
          {/* Remove from stream button */}
          <button
            type="button"
            className="btn btn-small"
            onClick={(e) => {
              e.stopPropagation();
              // Show warning for unsaved cards since they'll be deleted permanently
              if (!card.title) {
                if (window.confirm('This unsaved card will be permanently deleted when removed from the stream. Continue?')) {
                  onDelete(cardId);
                }
              } else {
                onDelete(cardId);
              }
            }}
            title={card.title ? "Remove card from stream (keeps in brain)" : "Remove unsaved card (will be permanently deleted)"}
            style={{ 
              color: card.title ? '#f59e0b' : '#ef4444',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            −
          </button>
          
          {/* Delete from brain button (only for saved cards with titles) */}
          {card.title && onDeleteFromBrain && (
            <button
              type="button"
              className="btn btn-small"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Delete this card completely from the brain? This cannot be undone.')) {
                  onDeleteFromBrain(cardId);
                }
              }}
              title="Delete card completely from brain"
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
                  onMoveUp?.(cardId);
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
                  onMoveDown?.(cardId);
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
            title={displayState === 0 ? 'Show preview' : displayState === 1 ? 'Show full' : 'Collapse'}
          >
            {getDisplayIcon()}
          </button>
        </div>
      </div>

      {displayState > 0 && (
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
                    const contentToRestore = fullContent || card.content || card.contentPreview || '';
                    setEditContent(contentToRestore);
                    setIsEditingContent(false);
                    // Also cancel title editing
                    setEditTitle(card.title || '');
                    setIsEditingTitle(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div 
              className={`card-content-display ${displayState === 1 ? 'card-content-preview' : 'card-content-expanded'}`}
              onDoubleClick={async () => {
                const content = await loadFullContent();
                setEditContent(content);
                setIsEditingContent(true);
                // Also enable title editing when double-clicking content
                setIsEditingTitle(true);
              }}
            >
              {(card.content || card.contentPreview) ? (
                <>
                  {displayState === 2 ? (
                    // Fully expanded - show complete content or load it if needed
                    fullContent ? (
                      <ReactMarkdown>{fullContent}</ReactMarkdown>
                    ) : (
                      <>
                        <ReactMarkdown>{card.content || card.contentPreview}</ReactMarkdown>
                        {(!card.content && card.contentPreview && card.contentPreview.length >= 500) && (
                          <div 
                            className="read-more-indicator"
                            onClick={async () => {
                              await loadFullContent();
                            }}
                            style={{ 
                              color: '#6b7280', 
                              fontSize: '12px', 
                              marginTop: '8px', 
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                          >
                            {isLoadingContent ? 'Loading full content...' : '...click to load full content'}
                          </div>
                        )}
                      </>
                    )
                  ) : (
                    // Preview mode - show limited content with read more
                    <>
                      <div className="card-preview-content">
                        <ReactMarkdown>{card.content || card.contentPreview}</ReactMarkdown>
                      </div>
                      {(card.content || card.contentPreview) && (card.content || card.contentPreview).length > 200 && (
                        <div 
                          className="read-more-indicator"
                          onClick={() => setDisplayState(2)}
                          style={{ 
                            color: '#3b82f6', 
                            fontSize: '12px', 
                            marginTop: '4px', 
                            cursor: 'pointer',
                            fontWeight: '500'
                          }}
                        >
                          ...read more
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="empty-content-placeholder">
                  {!card.title ? (
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
      
      {/* Card Action Buttons - Add/Create below this card */}
      {(onAddCardBelow || onCreateCardBelow || onUploadFileBelow) && displayState > 0 && (
        <div className="card-actions" style={{
          display: 'flex',
          gap: '8px',
          padding: '8px 12px',
          borderTop: '1px solid #f3f4f6',
          backgroundColor: '#fafbfc',
          justifyContent: 'center'
        }}>
          {onAddCardBelow && !showAddInterface && !showUploadInterface && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onAddCardBelow(streamCard.position)}
              title="Add existing card below this one"
              style={{ 
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              📎 Add Card
            </button>
          )}
          {onCreateCardBelow && !showAddInterface && !showGenerateInterface && !showUploadInterface && (
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => onCreateCardBelow(streamCard.position)}
              title="Create new card below this one"
              style={{ 
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ✨ Create Card
            </button>
          )}
          {onGenerateCardBelow && !showAddInterface && !showGenerateInterface && !showUploadInterface && (
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => setShowGenerateInterface(true)}
              title="Generate new card with AI below this one"
              style={{ 
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              🤖 Generate Card
            </button>
          )}
          {onUploadFileBelow && !showAddInterface && !showGenerateInterface && !showUploadInterface && !showFileAddInterface && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onUploadFileBelow(streamCard.position)}
              title="Upload PDF or EPUB file below this card"
              style={{ 
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#16a34a',
                color: 'white'
              }}
            >
              📁 Upload File
            </button>
          )}
          {onAddFileBelow && !showAddInterface && !showGenerateInterface && !showUploadInterface && !showFileAddInterface && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onAddFileBelow(streamCard.position)}
              title="Add existing file below this card"
              style={{ 
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#8b5cf6',
                color: 'white'
              }}
            >
              📚 Add File
            </button>
          )}
        </div>
      )}
      
      {/* Inline Card Search Interface */}
      {showAddInterface && onAddCard && onCancelAdd && (
        <CardSearchInterface
          brainId={brainId}
          streamId={streamId}
          streamCards={[streamCard]} // Pass current stream card to avoid showing it
          onCardSelected={(card) => onAddCard(card.id, streamCard.position)}
          onCancel={onCancelAdd}
        />
      )}
      
      {/* AI Generation Interface */}
      {showGenerateInterface && onGenerateCardBelow && (
        <GenerateInterface
          brainId={brainId}
          position={streamCard.position}
          contextCards={aiContextCards}
          onGenerate={(prompt, model, position) => {
            onGenerateCardBelow(position, prompt, model);
            setShowGenerateInterface(false);
          }}
          onCancel={() => setShowGenerateInterface(false)}
        />
      )}
      
      {/* File Upload Interface */}
      {showUploadInterface && onFileUploaded && onCancelUpload && (
        <FileUploadInterface
          brainId={brainId}
          streamId={streamId}
          position={streamCard.position}
          onFileUploaded={onFileUploaded}
          onCancel={onCancelUpload}
        />
      )}
      
      {/* File Search Interface */}
      {showFileAddInterface && onAddFile && onCancelFileAdd && (
        <FileSearchInterface
          brainId={brainId}
          streamId={streamId}
          onFileSelected={(file) => onAddFile(file, streamCard.position)}
          onCancel={onCancelFileAdd}
        />
      )}
      
    </div>
  );
};

export default Card;