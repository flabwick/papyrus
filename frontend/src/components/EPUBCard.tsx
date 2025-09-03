import React, { useState, useEffect } from 'react';
import { Card as CardType, StreamCard } from '../types';
import api from '../services/api';

interface EPUBCardProps {
  card: CardType;
  streamCard: StreamCard;
  streamId: string;
  brainId: string;
  depth?: number;
  onDelete: (cardId: string) => void;
  onMoveUp?: (cardId: string) => void;
  onMoveDown?: (cardId: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

interface EPUBFileInfo {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  title?: string;
  author?: string;
  publisher?: string;
  language?: string;
  isbn?: string;
  publicationDate?: string;
  description?: string;
  chapterCount?: number;
  hasImages: boolean;
  hasToc: boolean;
  subjects?: string[];
  coverImagePath?: string;
  processingStatus: string;
}

const EPUBCard: React.FC<EPUBCardProps> = ({
  card,
  streamCard,
  streamId,
  brainId,
  depth = 0,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
}) => {
  const [fileInfo, setFileInfo] = useState<EPUBFileInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(card.title || '');
  const [isExpanded, setIsExpanded] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);

  const cardId = (card as any).cardId || card.id;

  useEffect(() => {
    loadFileInfo();
  }, [cardId]);

  const loadFileInfo = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/cards/${cardId}/file-info`);
      const info = response.data.fileInfo;
      setFileInfo(info);
      
      // Try to load cover image if available
      if (info.coverImagePath) {
        loadCoverImage(info.id, info.coverImagePath);
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to load EPUB file info:', err);
      setError('Failed to load EPUB information');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCoverImage = async (fileId: string, coverPath: string) => {
    try {
      const response = await api.get(`/brains/${card.brainId}/files/${fileId}/cover`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data]);
      const url = URL.createObjectURL(blob);
      setCoverImageUrl(url);
    } catch (error) {
      console.error('Failed to load cover image:', error);
      // Not critical, just no cover image
    }
  };

  const handleTitleSave = async () => {
    try {
      if (editTitle) {
        await api.put(`/cards/${cardId}`, { title: editTitle.trim() });
      }
      setIsEditing(false);
      // Update the card title in parent if needed
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  };

  const handleDownload = async () => {
    if (!fileInfo) return;
    
    try {
      const response = await api.get(`/cards/${cardId}/file-download`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/epub+zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileInfo.fileName || 'book.epub';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (coverImageUrl && coverImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(coverImageUrl);
      }
    };
  }, [coverImageUrl]);

  if (isLoading) {
    return (
      <div className="file-card epub-card loading">
        <div className="file-card-header">
          <div className="file-type-icon">📚</div>
          <div className="file-card-title">Loading EPUB...</div>
        </div>
        <div className="file-card-loading">
          <div className="loading-spinner"></div>
          <span>Loading book information...</span>
        </div>
      </div>
    );
  }

  if (error || !fileInfo) {
    return (
      <div className="file-card epub-card error">
        <div className="file-card-header">
          <div className="file-type-icon">❌</div>
          <div className="file-card-title">{card.title}</div>
        </div>
        <div className="file-card-error">
          {error || 'Failed to load EPUB information'}
        </div>
      </div>
    );
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const displayTitle = fileInfo.title || fileInfo.fileName.replace('.epub', '');
  const displayAuthor = fileInfo.author || 'Unknown Author';

  return (
    <div className={`file-card epub-card ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* File Card Header - Always Visible */}
      <div className="file-card-header">
        <div className="file-type-icon">📚</div>
        
        <div className="file-card-title-section">
          {isEditing ? (
            <input
              type="text"
              value={editTitle || ''}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyPress={(e) => e.key === 'Enter' && handleTitleSave()}
              className="file-title-edit"
              autoFocus
            />
          ) : (
            <h3 
              className="file-card-title"
              onClick={() => setIsEditing(true)}
              title="Click to edit title"
            >
              {card.title}
            </h3>
          )}
          <div className="file-metadata-summary">
            <span className="file-type-badge">EPUB</span>
            <span className="file-author">by {displayAuthor}</span>
            <span className="file-size">{formatFileSize(fileInfo.fileSize)}</span>
            {fileInfo.chapterCount && (
              <span className="chapter-count">{fileInfo.chapterCount} chapters</span>
            )}
          </div>
        </div>

        <div className="file-card-controls">
          {/* NO AI Context button - files cannot be in AI context */}
          
          <button 
            className="file-control-btn expand-btn"
            onClick={handleToggleExpand}
            title={isExpanded ? "Close book view" : "Open book view"}
          >
            {isExpanded ? '📖' : '👁️'}
          </button>
          <button 
            className="file-control-btn download-btn"
            onClick={handleDownload}
            title="Download EPUB file"
          >
            📥
          </button>
          <button 
            className="file-control-btn delete-btn"
            onClick={() => onDelete(cardId)}
            title="Remove from stream"
          >
            🗑️
          </button>
          {onMoveUp && !isFirst && (
            <button 
              className="file-control-btn move-btn"
              onClick={() => onMoveUp(cardId)}
              title="Move up"
            >
              ⬆️
            </button>
          )}
          {onMoveDown && !isLast && (
            <button 
              className="file-control-btn move-btn"
              onClick={() => onMoveDown(cardId)}
              title="Move down"
            >
              ⬇️
            </button>
          )}
        </div>
      </div>
      
      {/* Expanded File Viewer - Portrait Mode */}
      {isExpanded && (
        <div className="file-card-content epub-viewer-portrait">
          <div className="epub-book-display">
            {/* Left Column: Cover Image */}
            <div className="epub-cover-column">
              {coverImageUrl ? (
                <div className="epub-cover-container">
                  <img 
                    src={coverImageUrl} 
                    alt={`Cover of ${displayTitle}`}
                    className="epub-cover-image"
                  />
                </div>
              ) : (
                <div className="epub-cover-placeholder">
                  <div className="cover-icon">📚</div>
                  <div className="cover-text">
                    <div className="cover-title">{displayTitle}</div>
                    <div className="cover-author">{displayAuthor}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Book Information */}
            <div className="epub-info-column">
              <div className="epub-title-section">
                <h2 className="epub-display-title">{displayTitle}</h2>
                <h3 className="epub-display-author">by {displayAuthor}</h3>
              </div>

              <div className="epub-metadata-grid">
                {fileInfo.publisher && (
                  <div className="metadata-row">
                    <span className="metadata-label">Publisher:</span>
                    <span className="metadata-value">{fileInfo.publisher}</span>
                  </div>
                )}
                {fileInfo.publicationDate && (
                  <div className="metadata-row">
                    <span className="metadata-label">Published:</span>
                    <span className="metadata-value">{fileInfo.publicationDate}</span>
                  </div>
                )}
                {fileInfo.language && (
                  <div className="metadata-row">
                    <span className="metadata-label">Language:</span>
                    <span className="metadata-value">{fileInfo.language}</span>
                  </div>
                )}
                {fileInfo.isbn && (
                  <div className="metadata-row">
                    <span className="metadata-label">ISBN:</span>
                    <span className="metadata-value">{fileInfo.isbn}</span>
                  </div>
                )}
                <div className="metadata-row">
                  <span className="metadata-label">Chapters:</span>
                  <span className="metadata-value">{fileInfo.chapterCount || 'Unknown'}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-label">File Size:</span>
                  <span className="metadata-value">{formatFileSize(fileInfo.fileSize)}</span>
                </div>
              </div>

              {/* Book Features */}
              <div className="epub-features">
                {fileInfo.hasImages && (
                  <span className="feature-badge">📷 Illustrated</span>
                )}
                {fileInfo.hasToc && (
                  <span className="feature-badge">📑 Table of Contents</span>
                )}
              </div>

              {/* Description */}
              {fileInfo.description && (
                <div className="epub-description">
                  <h4>Description</h4>
                  <div className="description-text">
                    {fileInfo.description}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="epub-actions">
                <button className="epub-action-btn primary" onClick={handleDownload}>
                  📥 Download EPUB
                </button>
                <button className="epub-action-btn secondary" disabled>
                  📖 Read Online (Coming Soon)
                </button>
                <button className="epub-action-btn secondary" disabled>
                  📄 Convert to Cards (Coming Soon)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EPUBCard;