import React, { useState, useEffect, useCallback } from 'react';
import { Card as CardType, WorkspaceCard } from '../types';
import { useApp } from '../contexts/AppContext';
import api from '../services/api';

// Dynamic import for react-pdf to avoid bundling issues
let Document: any = null;
let Page: any = null;
let pdfjs: any = null;

// Dynamically load react-pdf components
const loadPDFComponents = async () => {
  if (!Document) {
    try {
      // Load react-pdf components
      const pdfModule = await import('react-pdf');
      Document = pdfModule.Document;
      Page = pdfModule.Page;
      
      // Load pdfjs-dist
      pdfjs = await import('pdfjs-dist');
      
      // Set up PDF.js worker - use local worker file
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      
      console.log('PDF.js loaded with version:', pdfjs.version || 'unknown');
    } catch (error) {
      console.error('Failed to load PDF components:', error);
      throw error;
    }
  }
  return { Document, Page };
};

interface PDFCardProps {
  card: CardType;
  streamCard: WorkspaceCard;
  streamId: string;
  libraryId: string;
  depth?: number;
  onDelete: (cardId: string) => void;
  onMoveUp?: (cardId: string) => void;
  onMoveDown?: (cardId: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

interface PDFFileInfo {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  pageCount?: number;
  author?: string;
  title?: string;
  subject?: string;
  contentPreview?: string;
  processingStatus: string;
}

const PDFCard: React.FC<PDFCardProps> = ({
  card,
  streamCard,
  streamId,
  libraryId,
  depth = 0,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<PDFFileInfo | null>(null);
  const [componentsLoaded, setComponentsLoaded] = useState(false);
  const { aiContextCards } = useApp();

  const cardId = (card as any).cardId || card.id;
  
  // PDF files cannot be in AI context as per spec
  const canBeInAIContext = false;

  useEffect(() => {
    // Load file information when component mounts
    loadFileInfo();
    
    // Preload PDF components
    loadPDFComponents().then(() => {
      setComponentsLoaded(true);
    }).catch(err => {
      console.error('Failed to load PDF components:', err);
      setError('Failed to load PDF viewer');
    });
  }, [cardId]);

  const loadFileInfo = async () => {
    try {
      const response = await api.get(`/cards/${cardId}/file-info`);
      setFileInfo(response.data.fileInfo);
    } catch (error) {
      console.error('Failed to load file info:', error);
      setError('Failed to load file information');
    }
  };

  const loadPDFData = useCallback(async () => {
    if (!fileInfo || pdfData || isLoading) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Get PDF file data as blob URL
      const response = await api.get(`/files/${fileInfo.id}/content`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfData(url);
    } catch (error) {
      console.error('Failed to load PDF data:', error);
      setError('Failed to load PDF content');
    } finally {
      setIsLoading(false);
    }
  }, [fileInfo, pdfData, isLoading]);

  const handleExpand = async () => {
    if (!isExpanded && componentsLoaded) {
      await loadPDFData();
    }
    setIsExpanded(!isExpanded);
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
  };

  const onDocumentLoadError = (error: any) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF document');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  // PDF-specific styling
  const cardClasses = [
    'card',
    'card-file',
    'card-pdf',
    isExpanded && 'card-expanded',
    depth > 0 && 'card-nested'
  ].filter(Boolean).join(' ');

  const titleStyle = depth > 0 ? {
    fontSize: `${Math.max(13, 15 - depth)}px`
  } : {};

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfData && pdfData.startsWith('blob:')) {
        URL.revokeObjectURL(pdfData);
      }
    };
  }, [pdfData]);

  if (!fileInfo) {
    return (
      <div className={cardClasses}>
        <div className="card-header">
          <div className="card-title" style={titleStyle}>
            📄 Loading PDF...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClasses} data-card-id={cardId}>
      <div className="card-header" onClick={handleExpand}>
        <div className="card-file-icon">📄</div>
        <div className="card-title-container">
          <h3 className="card-title" style={titleStyle}>
            {fileInfo.title || fileInfo.fileName}
          </h3>
          <div className="card-file-metadata">
            {fileInfo.pageCount && `${fileInfo.pageCount} pages`}
            {fileInfo.pageCount && fileInfo.fileSize && ' • '}
            {formatFileSize(fileInfo.fileSize)}
            {fileInfo.author && ` • by ${fileInfo.author}`}
          </div>
        </div>

        <div className="card-controls">
          {/* AI Context disabled for file cards */}
          <button
            type="button"
            className="ai-context-button disabled"
            disabled
            title="PDF files cannot be used in AI context"
          >
            AI
          </button>
          
          {/* Download button */}
          <button
            type="button"
            className="btn btn-small"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const response = await api.get(`/files/${fileInfo.id}/download`, {
                  responseType: 'blob'
                });
                const blob = new Blob([response.data], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileInfo.fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (error) {
                console.error('Download failed:', error);
              }
            }}
            title="Download PDF"
          >
            📥
          </button>
          
          {/* Remove from stream button */}
          <button
            type="button"
            className="btn btn-small"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Remove this PDF from the stream?')) {
                onDelete(cardId);
              }
            }}
            title="Remove PDF from stream"
            style={{ 
              color: '#f59e0b',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            −
          </button>
          
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
                title="Move PDF up"
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
                title="Move PDF down"
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
              handleExpand();
            }}
            title={isExpanded ? 'Collapse PDF viewer' : 'Expand PDF viewer'}
          >
            {isExpanded ? '‹' : '›'}
          </button>
        </div>
      </div>

      {/* Collapsed state - show content preview */}
      {!isExpanded && (
        <div className="card-content card-content-preview">
          <div className="pdf-preview">
            {fileInfo.contentPreview ? (
              <p className="content-preview-text">
                {fileInfo.contentPreview}
                {fileInfo.contentPreview.length >= 500 && '...'}
              </p>
            ) : (
              <p className="no-preview">
                <em>No text preview available for this PDF</em>
              </p>
            )}
          </div>
          {fileInfo.processingStatus !== 'complete' && (
            <div className="processing-status">
              Status: {fileInfo.processingStatus}
            </div>
          )}
        </div>
      )}

      {/* Expanded state - show PDF viewer */}
      {isExpanded && (
        <div className="card-content card-content-expanded">
          <div className="pdf-viewer-container">
            {isLoading && (
              <div className="pdf-loading">
                <p>Loading PDF viewer...</p>
              </div>
            )}
            
            {error && (
              <div className="pdf-error">
                <p style={{ color: '#ef4444' }}>❌ {error}</p>
                <button
                  className="btn btn-small"
                  onClick={async () => {
                    setError(null);
                    await loadPDFData();
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            
            {pdfData && componentsLoaded && Document && !error && (
              <div className="pdf-viewer">
                <Document
                  file={pdfData}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={<div className="pdf-loading">Loading PDF...</div>}
                  error={<div className="pdf-error">Failed to load PDF</div>}
                >
                  <Page 
                    pageNumber={currentPage}
                    width={Math.min(800, window.innerWidth - 100)}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                  />
                </Document>
                
                {numPages && numPages > 1 && (
                  <div className="pdf-controls">
                    <button
                      className="btn btn-small"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage <= 1}
                    >
                      ◀ Previous
                    </button>
                    
                    <span className="pdf-page-info">
                      Page {currentPage} of {numPages}
                    </span>
                    
                    <button
                      className="btn btn-small"
                      onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                      disabled={currentPage >= numPages}
                    >
                      Next ▶
                    </button>
                    
                    <div className="pdf-page-input">
                      <input
                        type="number"
                        min={1}
                        max={numPages}
                        value={currentPage}
                        onChange={(e) => {
                          const page = parseInt(e.target.value);
                          if (page >= 1 && page <= numPages) {
                            setCurrentPage(page);
                          }
                        }}
                        style={{ width: '60px', textAlign: 'center' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {!componentsLoaded && !error && (
              <div className="pdf-loading">
                <p>Loading PDF viewer components...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFCard;