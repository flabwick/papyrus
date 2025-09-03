import React, { useState, useEffect } from 'react';
import api from '../services/api';

interface FileSearchInterfaceProps {
  brainId: string;
  streamId: string;
  onFileSelected: (file: any) => void;
  onCancel: () => void;
}

const FileSearchInterface: React.FC<FileSearchInterfaceProps> = ({
  brainId,
  streamId,
  onFileSelected,
  onCancel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allFiles, setAllFiles] = useState<any[]>([]);

  useEffect(() => {
    loadAllFiles();
  }, [brainId]);

  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch();
    } else {
      setSearchResults(allFiles);
    }
  }, [searchQuery, allFiles]);

  const loadAllFiles = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/brains/${brainId}/files`);
      setAllFiles(response.data.files || []);
      setSearchResults(response.data.files || []);
    } catch (error) {
      console.error('Failed to load files:', error);
      setAllFiles([]);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const performSearch = () => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = allFiles.filter(file => {
      const fileName = (file.fileName || file.file_name || '').toLowerCase();
      const title = (file.title || file.epub_title || file.pdf_title || '').toLowerCase();
      const author = (file.author || file.epub_author || file.pdf_author || '').toLowerCase();
      const fileType = (file.fileType || file.file_type || '').toLowerCase();
      
      return fileName.includes(query) ||
             title.includes(query) ||
             author.includes(query) ||
             fileType.includes(query);
    });
    setSearchResults(filtered);
  };

  const handleFileSelect = (file: any) => {
    onFileSelected(file);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getFileIcon = (file: any) => {
    const fileType = (file.fileType || file.file_type || 'unknown').toLowerCase();
    switch (fileType) {
      case 'pdf': return '📄';
      case 'epub': return '📚';
      default: return '📁';
    }
  };

  const getFileTypeColor = (file: any) => {
    const fileType = (file.fileType || file.file_type || 'unknown').toLowerCase();
    switch (fileType) {
      case 'pdf': return '#dc2626'; // red
      case 'epub': return '#8b5cf6'; // purple
      default: return '#6b7280'; // gray
    }
  };

  return (
    <div className="file-search-interface">
      <div className="search-header">
        <div className="search-title">
          <span className="search-icon">📁</span>
          Add Existing File to Stream
        </div>
        <button onClick={onCancel} className="cancel-btn" title="Cancel">
          ✕
        </button>
      </div>

      <div className="search-input-section">
        <input
          type="text"
          placeholder="Search files by name, title, or author..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
          autoFocus
        />
      </div>

      <div className="search-results">
        {isLoading ? (
          <div className="loading-state">
            <span className="loading-spinner" />
            Loading files...
          </div>
        ) : searchResults.length > 0 ? (
          <>
            <div className="results-header">
              {searchResults.length} file{searchResults.length !== 1 ? 's' : ''} found
            </div>
            <div className="results-list">
              {searchResults.map((file) => (
                <div
                  key={file.id}
                  className="file-result-item"
                  onClick={() => handleFileSelect(file)}
                >
                  <div className="file-result-icon">
                    <span 
                      className="file-type-indicator"
                      style={{ 
                        backgroundColor: `${getFileTypeColor(file)}15`,
                        color: getFileTypeColor(file)
                      }}
                    >
                      {getFileIcon(file)}
                    </span>
                  </div>
                  
                  <div className="file-result-info">
                    <div className="file-result-title">
                      {file.title || file.epub_title || file.pdf_title || 
                       (file.fileName || file.file_name || 'Untitled').replace(/\.(pdf|epub)$/i, '')}
                    </div>
                    <div className="file-result-meta">
                      <span className="file-type-badge">
                        {(file.fileType || file.file_type || 'unknown').toUpperCase()}
                      </span>
                      {(file.author || file.epub_author || file.pdf_author) && (
                        <span className="file-author">by {file.author || file.epub_author || file.pdf_author}</span>
                      )}
                      <span className="file-size">{formatFileSize(file.fileSize || file.file_size || 0)}</span>
                      {(file.pageCount || file.pdf_page_count) && (
                        <span className="file-pages">{file.pageCount || file.pdf_page_count} pages</span>
                      )}
                      {(file.chapterCount || file.epub_chapter_count) && (
                        <span className="file-chapters">{file.chapterCount || file.epub_chapter_count} chapters</span>
                      )}
                    </div>
                    <div className="file-result-filename">
                      {file.fileName || file.file_name || 'untitled'}
                    </div>
                  </div>

                  <div className="file-result-actions">
                    <button
                      className="select-file-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFileSelect(file);
                      }}
                      title="Add this file to stream"
                    >
                      Add File
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="no-results">
            {searchQuery.trim() ? (
              <>
                <div className="no-results-icon">🔍</div>
                <div className="no-results-text">
                  No files found matching "{searchQuery}"
                </div>
                <div className="no-results-hint">
                  Try a different search term or check your spelling
                </div>
              </>
            ) : (
              <>
                <div className="no-results-icon">📁</div>
                <div className="no-results-text">
                  No files in this brain yet
                </div>
                <div className="no-results-hint">
                  Upload some PDF or EPUB files to get started
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileSearchInterface;