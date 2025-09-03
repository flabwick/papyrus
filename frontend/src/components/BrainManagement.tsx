import React, { useState, useEffect } from 'react';
import { Brain, Stream, Card } from '../types';
import { useApp } from '../contexts/AppContext';
import api from '../services/api';

interface BrainManagementProps {
  brain: Brain;
  onStreamSelect: (stream: Stream) => void;
  onBrainSelect: (brain: Brain) => void;
  onBack: () => void;
}

type Section = 'streams' | 'cards' | 'files';

const BrainManagement: React.FC<BrainManagementProps> = ({
  brain,
  onStreamSelect,
  onBrainSelect,
  onBack,
}) => {
  const [activeSection, setActiveSection] = useState<Section>('streams');
  const [streams, setStreams] = useState<Stream[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRenamingBrain, setIsRenamingBrain] = useState(false);
  const [brainTitle, setBrainTitle] = useState(brain.title);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const { setError } = useApp();

  const loadStreams = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/streams?brainId=${brain.id}`);
      setStreams(response.data.streams || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load streams');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCards = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/brains/${brain.id}/cards`);
      setCards(response.data.cards || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load cards');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/brains/${brain.id}/files`);
      setFiles(response.data.files || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setBrainTitle((brain as any).name || brain.title);
  }, [brain.title, (brain as any).name]);

  useEffect(() => {
    if (activeSection === 'streams') {
      loadStreams();
    } else if (activeSection === 'cards') {
      loadCards();
    } else if (activeSection === 'files') {
      loadFiles();
    }
  }, [activeSection, brain.id]);

  const handleStartBrainEdit = () => {
    const brainName = (brain as any).name || brain.title || '';
    setBrainTitle(brainName);
    setIsRenamingBrain(true);
  };

  const handleRenameBrain = async () => {
    if (!brainTitle.trim()) {
      setIsRenamingBrain(false);
      return;
    }

    const newName = brainTitle.trim();
    const currentName = (brain as any).name || brain.title || '';
    
    if (newName === currentName) {
      setIsRenamingBrain(false);
      return;
    }

    try {
      // Check if brain name already exists
      const response = await api.get('/brains');
      const brains = response.data.brains || [];
      const nameExists = brains.some((b: any) => 
        b.id !== brain.id && 
        ((b.name || b.title || '').toLowerCase() === newName.toLowerCase())
      );

      if (nameExists) {
        setError(`A brain named "${newName}" already exists`);
        setIsRenamingBrain(false);
        setBrainTitle(currentName); // Reset to original name
        return;
      }

      // Update the brain name
      await api.put(`/brains/${brain.id}`, { name: newName });
      const updatedBrain = { ...brain, name: newName } as any;
      onBrainSelect(updatedBrain);
      
      setIsRenamingBrain(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to rename brain');
      setBrainTitle(currentName); // Reset on error
      setIsRenamingBrain(false);
    }
  };

  const handleBrainEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameBrain();
    } else if (e.key === 'Escape') {
      const currentName = (brain as any).name || brain.title || '';
      setBrainTitle(currentName);
      setIsRenamingBrain(false);
    }
  };

  const handleCreateStream = async () => {
    try {
      const response = await api.post('/streams', {
        brainId: brain.id,
        name: `Stream ${streams.length + 1}`,
      });
      const newStream = response.data.stream;
      setStreams([...streams, newStream]);
      onStreamSelect(newStream);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create stream');
    }
  };

  const handleToggleFavorite = async (stream: Stream) => {
    try {
      const response = await api.put(`/streams/${stream.id}`, {
        isFavorited: !stream.isFavorited,
      });
      setStreams(streams.map(s => 
        s.id === stream.id ? { ...s, isFavorited: !s.isFavorited } : s
      ));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update stream');
    }
  };

  const handleDeleteStream = async (stream: Stream) => {
    const streamName = (stream as any).name || stream.title || 'Unknown Stream';
    if (window.confirm(`Are you sure you want to delete "${streamName}"?`)) {
      try {
        await api.delete(`/streams/${stream.id}`);
        setStreams(streams.filter(s => s.id !== stream.id));
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to delete stream');
      }
    }
  };

  const handleOpenCardInNewStream = async (card: Card) => {
    try {
      const response = await api.post('/streams', {
        brainId: brain.id,
        name: card.title,
      });
      const newStream = response.data.stream;
      
      // Add the card to the new stream
      await api.post(`/streams/${newStream.id}/cards`, {
        cardId: card.id,
        position: 1,
      });
      
      onStreamSelect(newStream);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to open card in new stream');
    }
  };

  const handleDeleteCard = async (card: Card) => {
    if (window.confirm(`Are you sure you want to delete "${card.title}"?`)) {
      try {
        await api.delete(`/cards/${card.id}`);
        setCards(cards.filter(c => c.id !== card.id));
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to delete card');
      }
    }
  };

  const handleOpenFileInStream = async (file: any) => {
    try {
      const fileName = file.pdf_title || file.epub_title || file.file_name || 'Untitled';
      const response = await api.post('/streams/open-file', {
        fileId: file.id,
        brainId: brain.id,
        streamTitle: `${fileName}`
      });
      
      if (response.data.success && response.data.stream) {
        // Navigate to the newly created stream
        onStreamSelect(response.data.stream);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to open file in stream');
    }
  };

  const handleDeleteFile = async (file: any) => {
    const fileName = file.pdf_title || file.epub_title || file.file_name || 'Untitled';
    if (window.confirm(`Are you sure you want to delete "${fileName}"? This will remove the file from all streams and delete it permanently.`)) {
      try {
        await api.delete(`/brains/${brain.id}/files/${file.id}`);
        setFiles(files.filter(f => f.id !== file.id));
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to delete file');
      }
    }
  };

  const filteredStreams = streams.filter(stream => {
    const streamName = (stream as any).name || stream.title || '';
    return streamName.toLowerCase().includes(searchTerm.toLowerCase());
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name':
        const aName = (a as any).name || a.title || '';
        const bName = (b as any).name || b.title || '';
        return aName.localeCompare(bName);
      case 'date':
        return new Date(b.lastAccessedAt || b.createdAt).getTime() - 
               new Date(a.lastAccessedAt || a.createdAt).getTime();
      default:
        return 0;
    }
  });

  const filteredCards = cards.filter(card => {
    const cardTitle = card.title || '';
    const cardPreview = (card as any).content_preview || card.contentPreview || '';
    return cardTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
           cardPreview.toLowerCase().includes(searchTerm.toLowerCase());
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return (a.title || '').localeCompare(b.title || '');
      case 'date':
        const aDate = (a as any).updated_at || a.updatedAt || a.createdAt;
        const bDate = (b as any).updated_at || b.updatedAt || b.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      case 'size':
        const aSize = parseInt((a as any).file_size || a.fileSize || '0');
        const bSize = parseInt((b as any).file_size || b.fileSize || '0');
        return bSize - aSize;
      default:
        return 0;
    }
  });

  const filteredFiles = files.filter(file => {
    const fileName = file.file_name || file.fileName || '';
    const fileType = file.file_type || file.fileType || '';
    const fileTitle = file.pdf_title || file.epub_title || '';
    const fileAuthor = file.pdf_author || file.epub_author || '';
    return fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           fileType.toLowerCase().includes(searchTerm.toLowerCase()) ||
           fileTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
           fileAuthor.toLowerCase().includes(searchTerm.toLowerCase());
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name':
        const aName = a.file_name || a.fileName || '';
        const bName = b.file_name || b.fileName || '';
        return aName.localeCompare(bName);
      case 'date':
        const aDate = a.uploaded_at || a.uploadedAt || a.created_at;
        const bDate = b.uploaded_at || b.uploadedAt || b.created_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      case 'size':
        const aSize = parseInt(a.file_size || a.fileSize || '0');
        const bSize = parseInt(b.file_size || b.fileSize || '0');
        return bSize - aSize;
      default:
        return 0;
    }
  });

  return (
    <div className="brain-management">
      <div className="brain-management-header">
        <button
          type="button"
          className="brain-back-button"
          onClick={onBack}
          title="Back to brain list"
        >
          ← Back
        </button>
        
        <div className="brain-title-section">
          {isRenamingBrain ? (
            <input
              type="text"
              value={brainTitle}
              onChange={(e) => setBrainTitle(e.target.value)}
              onBlur={handleRenameBrain}
              onKeyDown={handleBrainEditKeyDown}
              className="brain-title-input"
              autoFocus
              style={{
                background: 'white',
                border: '2px solid var(--focus-ring)',
                borderRadius: 'var(--border-radius)',
                padding: 'var(--spacing-xs) var(--spacing-sm)',
                fontSize: '24px',
                fontWeight: 'var(--font-weight-title)',
                width: '100%',
                minWidth: '300px',
              }}
            />
          ) : (
            <h2
              className="brain-title"
              onClick={handleStartBrainEdit}
              title="Click to rename brain"
            >
              {(brain as any).name || brain.title}
              <span className="rename-hint">✏️</span>
            </h2>
          )}
        </div>
      </div>

      <div className="brain-management-nav">
        <button
          type="button"
          className={`nav-tab ${activeSection === 'streams' ? 'active' : ''}`}
          onClick={() => setActiveSection('streams')}
        >
          Streams ({streams.length})
        </button>
        <button
          type="button"
          className={`nav-tab ${activeSection === 'cards' ? 'active' : ''}`}
          onClick={() => setActiveSection('cards')}
        >
          Cards ({cards.length})
        </button>
        <button
          type="button"
          className={`nav-tab ${activeSection === 'files' ? 'active' : ''}`}
          onClick={() => setActiveSection('files')}
        >
          Files ({files.length})
        </button>
      </div>

      <div className="brain-management-content">
        {activeSection !== 'files' && (
          <div className="content-controls">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${activeSection}...`}
              className="form-input search-input"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="form-input sort-select"
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              {activeSection === 'cards' && <option value="size">Sort by Size</option>}
            </select>
          </div>
        )}

        {activeSection === 'streams' && (
          <div className="streams-section">
            <div className="section-header">
              <h3>Streams</h3>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={handleCreateStream}
              >
                + New Stream
              </button>
            </div>

            {isLoading ? (
              <div className="loading-spinner"></div>
            ) : filteredStreams.length === 0 ? (
              <div className="empty-state">
                <p>No streams found. Create your first stream to get started!</p>
              </div>
            ) : (
              <div className="items-grid">
                {filteredStreams.map((stream) => (
                  <div key={stream.id} className="item-card stream-card">
                    <div className="item-card-header">
                      <h4
                        className="item-title"
                        onClick={() => onStreamSelect(stream)}
                      >
                        {(stream as any).name || stream.title}
                      </h4>
                      <div className="item-actions">
                        <button
                          type="button"
                          className={`action-btn favorite-btn ${stream.isFavorited ? 'favorited' : ''}`}
                          onClick={() => handleToggleFavorite(stream)}
                          title={stream.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          {stream.isFavorited ? '★' : '☆'}
                        </button>
                        <button
                          type="button"
                          className="action-btn delete-btn"
                          onClick={() => handleDeleteStream(stream)}
                          title="Delete stream"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="item-card-meta">
                      <p>Last accessed: {formatDate(stream.lastAccessedAt || stream.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'cards' && (
          <div className="cards-section">
            <div className="section-header">
              <h3>Cards</h3>
            </div>

            {isLoading ? (
              <div className="loading-spinner"></div>
            ) : filteredCards.length === 0 ? (
              <div className="empty-state">
                <p>No cards found in this brain.</p>
              </div>
            ) : (
              <div className="items-grid">
                {filteredCards.map((card) => {
                  const contentPreview = (card as any).content_preview || card.contentPreview || '';
                  const fileSize = parseInt((card as any).file_size || card.fileSize || '0');
                  const updatedDate = (card as any).updated_at || card.updatedAt || card.createdAt;
                  
                  return (
                    <div key={card.id} className="item-card card-card">
                      <div className="item-card-header">
                        <h4 className="item-title">{card.title}</h4>
                        <div className="item-actions">
                          <button
                            type="button"
                            className="action-btn open-btn"
                            onClick={() => handleOpenCardInNewStream(card)}
                            title="Open in new stream"
                          >
                            ↗
                          </button>
                          <button
                            type="button"
                            className="action-btn delete-btn"
                            onClick={() => handleDeleteCard(card)}
                            title="Delete card"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className="card-preview">
                        <p>{contentPreview || 'No preview available'}</p>
                      </div>
                      <div className="item-card-meta">
                        <p>{formatBytes(fileSize)} • {formatDate(updatedDate)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeSection === 'files' && (
          <div className="files-section">
            <div className="content-controls">
              <input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <div className="sort-controls">
                <label>Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
                  className="sort-select"
                >
                  <option value="date">Date</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                </select>
              </div>
            </div>

            {isLoading ? (
              <div className="loading-message">
                <span className="loading-spinner" />
                Loading files...
              </div>
            ) : filteredFiles.length > 0 ? (
              <div className="items-grid">
                {filteredFiles.map((file) => (
                  <div key={file.id} className="item-card file-item">
                    <div className="item-header">
                      <div className="file-icon">
                        {file.file_type === 'pdf' ? '📄' : file.file_type === 'epub' ? '📚' : '📁'}
                      </div>
                      <h4 className="item-title">
                        {file.pdf_title || file.epub_title || file.file_name}
                      </h4>
                      <div className="item-actions">
                        <button
                          className="action-btn open-btn"
                          onClick={() => handleOpenFileInStream(file)}
                          title="Open in new stream"
                        >
                          ➡️
                        </button>
                        <button
                          className="action-btn download-btn"
                          onClick={() => window.open(`/api/files/${file.id}/download`, '_blank')}
                          title="Download file"
                        >
                          📥
                        </button>
                        <button
                          className="action-btn delete-btn"
                          onClick={() => handleDeleteFile(file)}
                          title="Delete file permanently"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <div className="file-metadata">
                      <p>
                        <strong>Type:</strong> {file.file_type?.toUpperCase()}
                        {file.pdf_page_count && ` • ${file.pdf_page_count} pages`}
                        {file.epub_chapter_count && ` • ${file.epub_chapter_count} chapters`}
                      </p>
                      <p>
                        <strong>Size:</strong> {formatBytes(file.file_size)}
                        <span className="file-date">
                          • Uploaded {formatDate(file.uploaded_at || file.created_at)}
                        </span>
                      </p>
                      {(file.pdf_author || file.epub_author) && (
                        <p><strong>Author:</strong> {file.pdf_author || file.epub_author}</p>
                      )}
                      {file.epub_publisher && (
                        <p><strong>Publisher:</strong> {file.epub_publisher}</p>
                      )}
                    </div>
                    {file.content_preview && (
                      <div className="file-preview">
                        <p>{file.content_preview.substring(0, 200)}...</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h3>No Files Found</h3>
                <p>
                  {searchTerm 
                    ? `No files match "${searchTerm}".` 
                    : 'No files have been uploaded to this brain yet.'
                  }
                </p>
                <p>Upload PDF and EPUB files through streams to see them here.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return 'today';
  if (diffDays <= 7) return `${diffDays} days ago`;
  if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
};

export default BrainManagement;