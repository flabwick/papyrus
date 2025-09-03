import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../services/api';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.js`;

interface FileViewerProps {
  file: any; // File data from stream
  streamId: string;
  brainId: string;
  depth?: number;
  onDelete: (fileId: string) => void;
  onMoveUp?: (fileId: string) => void;
  onMoveDown?: (fileId: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
  // Control button handlers (same as Card component)
  onAddCardBelow?: (afterPosition: number) => void;
  onCreateCardBelow?: (afterPosition: number) => void;
  onGenerateCardBelow?: (afterPosition: number, prompt: string, model: string) => void;
  onUploadFileBelow?: (afterPosition: number) => void;
  onAddFileBelow?: (afterPosition: number) => void;
}

const FileViewer: React.FC<FileViewerProps> = ({
  file,
  streamId,
  brainId,
  depth = 0,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
  onAddCardBelow,
  onCreateCardBelow,
  onGenerateCardBelow,
  onUploadFileBelow,
  onAddFileBelow,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // Move PDF state to parent to persist across re-mounts
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Debug component lifecycle
  useEffect(() => {
    console.log('FileViewer component mounted/re-mounted');
    return () => {
      console.log('FileViewer component unmounting');
    };
  }, []);

  // PDF loading effect
  useEffect(() => {
    console.log('PDF loading effect - file object:', {
      fileId: file?.id,
      fileType: file?.file_type,
      fileKeys: Object.keys(file || {}),
      fullFile: file
    });

    console.log('PDF loading effect triggered with:', {
      fileId: file?.id,
      fileType: file?.file_type,
      isExpanded,
      pdfUrl: !!pdfUrl
    });

    if ((file?.file_type === 'pdf' || file?.fileType === 'pdf') && isExpanded && !pdfUrl) {
      console.log('Conditions met - starting PDF load');
      loadPdfDocument();
    } else {
      console.log('Conditions not met for PDF load:', {
        isPdf: file?.file_type === 'pdf' || file?.fileType === 'pdf',
        isExpanded,
        noPdfUrl: !pdfUrl
      });
    }
  }, [file?.id, isExpanded, pdfUrl]);

  const loadPdfDocument = async () => {
    console.log('Starting PDF load for file:', file.id);
    
    try {
      const response = await api.get(`/cards/files/${file.id}/download`, {
        responseType: 'arraybuffer'
      });
      
      console.log('PDF downloaded successfully, creating blob URL');
      
      const arrayBuffer = response.data;
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      console.log('Created blob URL:', url);
      setPdfUrl(url);
      console.log('Set pdfUrl to:', url);
      
    } catch (err) {
      console.error('Failed to load PDF:', err);
    }
  };

  // Debug FileViewer render
  console.log('FileViewer render - file type:', file?.file_type || file?.fileType);
  console.log('FileViewer render - isExpanded:', isExpanded);
  console.log('FileViewer render - pdfUrl:', pdfUrl);

  const handleDownload = async () => {
    try {
      const response = await api.get(`/cards/files/${file.id}/download`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { 
        type: file.fileType === 'pdf' ? 'application/pdf' : 'application/epub+zip' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
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

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getFileIcon = () => {
    switch (file.fileType) {
      case 'pdf': return '📄';
      case 'epub': return '📚';
      default: return '📁';
    }
  };

  const getFileTypeColor = () => {
    switch (file.fileType) {
      case 'pdf': return '#dc2626'; // red
      case 'epub': return '#8b5cf6'; // purple
      default: return '#6b7280'; // gray
    }
  };

  return (
    <div className={`file-viewer ${file.fileType}-file ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* File Header - Always Visible */}
      <div className="file-viewer-header">
        <div 
          className="file-type-icon" 
          style={{ backgroundColor: `${getFileTypeColor()}15`, color: getFileTypeColor() }}
        >
          {getFileIcon()}
        </div>
        
        <div className="file-info-section">
          <h3 className="file-title">
            {file.title || file.fileName.replace(/\.(pdf|epub)$/i, '')}
          </h3>
          <div className="file-metadata-summary">
            <span 
              className="file-type-badge"
              style={{ backgroundColor: `${getFileTypeColor()}15`, color: getFileTypeColor() }}
            >
              {file.fileType.toUpperCase()}
            </span>
            {file.author && <span className="file-author">by {file.author}</span>}
            <span className="file-size">{formatFileSize(file.fileSize)}</span>
            {file.chapterCount && (
              <span className="file-chapters">{file.chapterCount} chapters</span>
            )}
            {file.pageCount && (
              <span className="file-pages">{file.pageCount} pages</span>
            )}
          </div>
        </div>

        <div className="file-controls">
          <button 
            className="file-control-btn expand-btn"
            onClick={handleToggleExpand}
            title={isExpanded ? "Close file view" : "Open file view"}
          >
            {isExpanded ? '📖' : '👁️'}
          </button>
          <button 
            className="file-control-btn download-btn"
            onClick={handleDownload}
            title="Download file"
          >
            📥
          </button>
          <button 
            className="file-control-btn delete-btn"
            onClick={() => onDelete(file.id)}
            title="Remove from stream"
          >
            🗑️
          </button>
          {onMoveUp && !isFirst && (
            <button 
              className="file-control-btn move-btn"
              onClick={() => onMoveUp(file.id)}
              title="Move up"
            >
              ⬆️
            </button>
          )}
          {onMoveDown && !isLast && (
            <button 
              className="file-control-btn move-btn"
              onClick={() => onMoveDown(file.id)}
              title="Move down"
            >
              ⬇️
            </button>
          )}
        </div>
      </div>
      
      {/* Expanded File Content */}
      {isExpanded && (
        <div className="file-viewer-content">
          {file.fileType === 'epub' && (
            <EPUBViewer file={file} />
          )}
          {file.fileType === 'pdf' && (() => {
            console.log('FileViewer checking PDF render conditions:', {
              fileType: file.fileType,
              isExpanded,
              shouldRenderPDF: file.fileType === 'pdf' && isExpanded
            });
            console.log('FileViewer about to render PDFViewer with props:', {
              file: file?.id,
              pdfUrl,
              pdfUrlType: typeof pdfUrl
            });
            return <PDFViewer file={file} pdfUrl={pdfUrl} setPdfUrl={setPdfUrl} />;
          })()}
        </div>
      )}

      {/* Control Buttons - Always Visible at Bottom */}
      <div className="file-control-section">
        <div className="file-control-buttons">
          {onAddCardBelow && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onAddCardBelow(file.position)}
              title="Add existing card below this file"
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
          {onCreateCardBelow && (
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => onCreateCardBelow(file.position)}
              title="Create new card below this file"
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
          {onGenerateCardBelow && (
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => onGenerateCardBelow(file.position, '', '')} // Empty prompt/model for now
              title="Generate new card with AI below this file"
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
          {onUploadFileBelow && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onUploadFileBelow(file.position)}
              title="Upload PDF or EPUB file below this file"
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
          {onAddFileBelow && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => onAddFileBelow(file.position)}
              title="Add existing file below this file"
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
      </div>
    </div>
  );
};
const EPUBViewer: React.FC<{ file: any }> = ({ file }) => {
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadCoverImage = async (fileId: string, coverPath: string) => {
      try {
        const response = await api.get(`/brains/${file.brainId}/files/${fileId}/cover`, {
          responseType: 'blob'
        });
        const blob = new Blob([response.data]);
        const url = URL.createObjectURL(blob);
        setCoverImageUrl(url);
      } catch (error) {
        console.error('Failed to load cover image:', error);
      }
    };

    // Try to load cover image if available
    if (file.coverImagePath) {
      loadCoverImage(file.id, file.coverImagePath);
    }
  }, [file.id, file.coverImagePath, file.brainId]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (coverImageUrl && coverImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(coverImageUrl);
      }
    };
  }, [coverImageUrl]);

  return (
    <div className="epub-viewer-portrait">
      <div className="epub-book-display">
        {/* Cover Image Column */}
        <div className="epub-cover-column">
          {coverImageUrl ? (
            <div className="epub-cover-container">
              <img 
                src={coverImageUrl} 
                alt={`Cover of ${file.title || file.fileName}`}
                className="epub-cover-image"
              />
            </div>
          ) : (
            <div className="epub-cover-placeholder">
              <div className="cover-icon">📚</div>
              <div className="cover-text">
                <div className="cover-title">{file.title || file.fileName}</div>
                <div className="cover-author">{file.author || 'Unknown Author'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Book Information Column */}
        <div className="epub-info-column">
          <div className="epub-title-section">
            <h2 className="epub-display-title">{file.title || file.fileName}</h2>
            <h3 className="epub-display-author">by {file.author || 'Unknown Author'}</h3>
          </div>

          <div className="epub-metadata-grid">
            <div className="metadata-row">
              <span className="metadata-label">Chapters:</span>
              <span className="metadata-value">{file.chapterCount || 'Unknown'}</span>
            </div>
            <div className="metadata-row">
              <span className="metadata-label">File Size:</span>
              <span className="metadata-value">{(file.fileSize / 1024 / 1024).toFixed(1)} MB</span>
            </div>
            <div className="metadata-row">
              <span className="metadata-label">Format:</span>
              <span className="metadata-value">EPUB</span>
            </div>
          </div>

          {/* Description */}
          {file.description && (
            <div className="epub-description">
              <h4>Description</h4>
              <div className="description-text">
                {file.description}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="epub-actions">
            <button 
              className="epub-action-btn primary" 
              onClick={() => {
                // Download handled by parent
                const event = new CustomEvent('download');
                document.dispatchEvent(event);
              }}
            >
              📥 Download EPUB
            </button>
            <button className="epub-action-btn secondary" disabled>
              📖 Read Online (Coming Soon)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// PDF Viewer Component
const PDFViewer: React.FC<{ 
  file: any; 
  pdfUrl: string | null; 
  setPdfUrl: React.Dispatch<React.SetStateAction<string | null>>; 
}> = ({ file, pdfUrl, setPdfUrl }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [viewMode, setViewMode] = useState<'single' | 'scroll'>('single');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for scroll mode page tracking
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully:', numPages, 'pages');
    setNumPages(numPages);
    setCurrentPage(1);
    setIsLoading(false);
    setError(null);
    // Initialize page refs array
    pageRefs.current = new Array(numPages).fill(null);
  };

  const onDocumentLoadError = (error: any) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF document');
    setIsLoading(false);
  };

  const goToPage = (pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= numPages) {
      setCurrentPage(pageNumber);
      
      // In scroll mode, scroll to the specific page
      if (viewMode === 'scroll' && pageRefs.current[pageNumber - 1]) {
        pageRefs.current[pageNumber - 1]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }
  };

  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setScale(1.0);

  // Intersection Observer for page tracking in scroll mode
  useEffect(() => {
    if (viewMode !== 'scroll' || !scrollContainerRef.current || numPages === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let maxVisiblePage = 1;
        let maxVisibleRatio = 0;

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageIndex = parseInt(entry.target.getAttribute('data-page-number') || '1');
            if (entry.intersectionRatio > maxVisibleRatio) {
              maxVisibleRatio = entry.intersectionRatio;
              maxVisiblePage = pageIndex;
            }
          }
        });

        if (maxVisibleRatio > 0.3) { // Only update if page is significantly visible
          setCurrentPage(maxVisiblePage);
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '-20px 0px -20px 0px',
        threshold: [0.1, 0.3, 0.5, 0.7, 0.9]
      }
    );

    // Observe all page elements
    pageRefs.current.forEach((pageRef) => {
      if (pageRef) {
        observer.observe(pageRef);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [viewMode, numPages]);

  if (!pdfUrl) {
    return (
      <div className="pdf-loading">
        <p>Loading PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pdf-error">
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      {/* PDF Controls */}
      <div className="pdf-controls">
        <div className="pdf-nav-controls">
          <button 
            onClick={prevPage} 
            disabled={currentPage <= 1}
            className="pdf-btn"
          >
            ← Prev
          </button>
          
          <div className="pdf-page-info">
            <input
              type="number"
              value={currentPage}
              onChange={(e) => goToPage(parseInt(e.target.value))}
              min={1}
              max={numPages}
              className="pdf-page-input"
            />
            <span>of {numPages}</span>
          </div>
          
          <button 
            onClick={nextPage} 
            disabled={currentPage >= numPages}
            className="pdf-btn"
          >
            Next →
          </button>
        </div>

        <div className="pdf-zoom-controls">
          <button onClick={zoomOut} className="pdf-btn">−</button>
          <span className="pdf-zoom-level">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="pdf-btn">+</button>
          <button onClick={resetZoom} className="pdf-btn">Reset</button>
        </div>

        <div className="pdf-view-controls">
          <button 
            onClick={() => setViewMode('single')}
            className={`pdf-btn ${viewMode === 'single' ? 'active' : ''}`}
          >
            Single Page
          </button>
          <button 
            onClick={() => setViewMode('scroll')}
            className={`pdf-btn ${viewMode === 'scroll' ? 'active' : ''}`}
          >
            Scroll View
          </button>
        </div>
      </div>

      {/* PDF Document */}
      <div className="pdf-document-container">
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className="pdf-loading">Loading PDF...</div>}
        >
          {viewMode === 'single' ? (
            <Page 
              pageNumber={currentPage} 
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          ) : (
            <div 
              className="pdf-scroll-container" 
              ref={scrollContainerRef}
              style={{
                /* Inline styles for maximum specificity */
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '650px',
                maxHeight: '650px',
                overflowY: 'scroll',
                overflowX: 'hidden',
                contain: 'layout style paint',
                isolation: 'isolate',
                position: 'relative',
                zIndex: 10,
                transform: 'translateZ(0)',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {Array.from(new Array(numPages), (el, index) => (
                <div
                  key={`page_container_${index + 1}`}
                  className="pdf-page-container"
                  ref={(el) => { pageRefs.current[index] = el; }}
                  data-page-number={index + 1}
                  style={{
                    margin: '10px 0',
                    display: 'flex',
                    justifyContent: 'center',
                    width: '100%'
                  }}
                >
                  <Page
                    pageNumber={index + 1}
                    scale={scale}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </div>
              ))}
            </div>
          )}
        </Document>
      </div>
    </div>
  );
};

export default FileViewer;