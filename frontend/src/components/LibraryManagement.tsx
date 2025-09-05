import React, { useState, useEffect } from 'react';
import { Library, Workspace, Card } from '../types';
import { useApp } from '../contexts/AppContext';
import api from '../services/api';

interface LibraryManagementProps {
  library: Library;
  onWorkspaceSelect: (workspace: Workspace) => void;
  onLibrarySelect: (library: Library) => void;
  onBack: () => void;
}

type Section = 'workspaces' | 'pages' | 'files';

const LibraryManagement: React.FC<LibraryManagementProps> = ({
  library,
  onWorkspaceSelect,
  onLibrarySelect,
  onBack,
}) => {
  const [activeSection, setActiveSection] = useState<Section>('workspaces');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [pages, setPages] = useState<Card[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRenamingLibrary, setIsRenamingLibrary] = useState(false);
  const [libraryTitle, setLibraryTitle] = useState(library.title);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const { setError } = useApp();

  const loadWorkspaces = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/workspaces?libraryId=${library.id}`);
      setWorkspaces(response.data.workspaces || []);
    } catch (err: any) {
      const errorMessage = typeof err.response?.data?.message === 'string' 
        ? err.response.data.message 
        : err.response?.data?.message?.message || err.message || 'Failed to load workspaces';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPages = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/libraries/${library.id}/pages`);
      setPages(response.data.pages || []);
    } catch (err: any) {
      const errorMessage = typeof err.response?.data?.message === 'string' 
        ? err.response.data.message 
        : err.response?.data?.message?.message || err.message || 'Failed to load pages';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/libraries/${library.id}/files`);
      setFiles(response.data.files || []);
    } catch (err: any) {
      const errorMessage = typeof err.response?.data?.message === 'string' 
        ? err.response.data.message 
        : err.response?.data?.message?.message || err.message || 'Failed to load files';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setLibraryTitle((library as any).name || library.title);
  }, [library.title, (library as any).name]);

  useEffect(() => {
    if (activeSection === 'workspaces') {
      loadWorkspaces();
    } else if (activeSection === 'pages') {
      loadPages();
    } else if (activeSection === 'files') {
      loadFiles();
    }
  }, [activeSection, library.id]);

  const handleStartLibraryEdit = () => {
    const libraryName = (library as any).name || library.title || '';
    setLibraryTitle(libraryName);
    setIsRenamingLibrary(true);
  };

  const handleRenameLibrary = async () => {
    if (!libraryTitle.trim()) {
      setIsRenamingLibrary(false);
      return;
    }

    const newName = libraryTitle.trim();
    const currentName = (library as any).name || library.title || '';
    
    if (newName === currentName) {
      setIsRenamingLibrary(false);
      return;
    }

    try {
      // Check if library name already exists
      const response = await api.get('/libraries');
      const libraries = response.data.libraries || [];
      const nameExists = libraries.some((b: any) => 
        b.id !== library.id && 
        ((b.name || b.title || '').toLowerCase() === newName.toLowerCase())
      );

      if (nameExists) {
        setError(`A library named "${newName}" already exists`);
        setIsRenamingLibrary(false);
        setLibraryTitle(currentName); // Reset to original name
        return;
      }

      // Update the library name
      await api.put(`/libraries/${library.id}`, { name: newName });
      const updatedLibrary = { ...library, name: newName } as any;
      onLibrarySelect(updatedLibrary);
      
      setIsRenamingLibrary(false);
    } catch (err: any) {
      const errorMessage = typeof err.response?.data?.message === 'string' 
        ? err.response.data.message 
        : err.response?.data?.message?.message || err.message || 'Failed to rename library';
      setError(errorMessage);
      setLibraryTitle(currentName); // Reset on error
      setIsRenamingLibrary(false);
    }
  };

  const handleLibraryEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameLibrary();
    } else if (e.key === 'Escape') {
      const currentName = (library as any).name || library.title || '';
      setLibraryTitle(currentName);
      setIsRenamingLibrary(false);
    }
  };

  const handleCreateWorkspace = async () => {
    try {
      const response = await api.post('/workspaces', {
        libraryId: library.id,
        name: `Workspace ${workspaces.length + 1}`,
      });
      const newWorkspace = response.data.workspace;
      setWorkspaces([...workspaces, newWorkspace]);
      onWorkspaceSelect(newWorkspace);
    } catch (err: any) {
      const errorMessage = typeof err.response?.data?.message === 'string' 
        ? err.response.data.message 
        : err.response?.data?.message?.message || err.message || 'Failed to create workspace';
      setError(errorMessage);
    }
  };

  const handleToggleFavorite = async (workspace: Workspace) => {
    try {
      const response = await api.put(`/workspaces/${workspace.id}`, {
        isFavorited: !workspace.isFavorited,
      });
      setWorkspaces(workspaces.map(w => 
        w.id === workspace.id ? { ...w, isFavorited: !w.isFavorited } : w
      ));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update workspace');
    }
  };

  const handleDeleteWorkspace = async (workspace: Workspace) => {
    const workspaceName = (workspace as any).name || workspace.title || 'Unknown Workspace';
    if (window.confirm(`Are you sure you want to delete "${workspaceName}"?`)) {
      try {
        await api.delete(`/workspaces/${workspace.id}`);
        setWorkspaces(workspaces.filter(w => w.id !== workspace.id));
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to delete workspace');
      }
    }
  };

  const handleOpenCardInNewWorkspace = async (card: Card) => {
    try {
      const response = await api.post('/workspaces', {
        libraryId: library.id,
        name: card.title,
      });
      const newWorkspace = response.data.workspace;
      
      // Add the card to the new workspace
      await api.post(`/workspaces/${newWorkspace.id}/pages`, {
        pageId: card.id,
        position: 1,
      });
      
      onWorkspaceSelect(newWorkspace);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to open card in new workspace');
    }
  };

  const handleDeletePage = async (page: Card) => {
    if (window.confirm(`Are you sure you want to delete "${page.title}"?`)) {
      try {
        await api.delete(`/pages/${page.id}`);
        setPages(pages.filter(c => c.id !== page.id));
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to delete page');
      }
    }
  };

  const handleOpenFileInWorkspace = async (file: any) => {
    try {
      const fileName = file.pdf_title || file.epub_title || file.file_name || 'Untitled';
      const response = await api.post('/workspaces/open-file', {
        fileId: file.id,
        libraryId: library.id,
        workspaceTitle: `${fileName}`
      });
      
      if (response.data.success && response.data.workspace) {
        // Navigate to the newly created workspace
        onWorkspaceSelect(response.data.workspace);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to open file in workspace');
    }
  };

  const handleDeleteFile = async (file: any) => {
    const fileName = file.pdf_title || file.epub_title || file.file_name || 'Untitled';
    if (window.confirm(`Are you sure you want to delete "${fileName}"? This will remove the file from all workspaces and delete it permanently.`)) {
      try {
        await api.delete(`/libraries/${library.id}/files/${file.id}`);
        setFiles(files.filter(f => f.id !== file.id));
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to delete file');
      }
    }
  };

  const filteredWorkspaces = workspaces.filter(workspace => {
    const workspaceName = (workspace as any).name || workspace.title || '';
    return workspaceName.toLowerCase().includes(searchTerm.toLowerCase());
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

  const filteredPages = pages.filter(page => {
    const pageTitle = page.title || '';
    const pagePreview = (page as any).content_preview || page.contentPreview || '';
    return pageTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
           pagePreview.toLowerCase().includes(searchTerm.toLowerCase());
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
    <div className="library-management">
      <div className="library-management-header">
        <button
          type="button"
          className="library-back-button"
          onClick={onBack}
          title="Back to library list"
        >
          ← Back
        </button>
        
        <div className="library-title-section">
          {isRenamingLibrary ? (
            <input
              type="text"
              value={libraryTitle}
              onChange={(e) => setLibraryTitle(e.target.value)}
              onBlur={handleRenameLibrary}
              onKeyDown={handleLibraryEditKeyDown}
              className="library-title-input"
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
              className="library-title"
              onClick={handleStartLibraryEdit}
              title="Click to rename library"
            >
              {(library as any).name || library.title}
              <span className="rename-hint">✏️</span>
            </h2>
          )}
        </div>
      </div>

      <div className="library-management-nav">
        <button
          type="button"
          className={`nav-tab ${activeSection === 'workspaces' ? 'active' : ''}`}
          onClick={() => setActiveSection('workspaces')}
        >
          Workspaces ({workspaces.length})
        </button>
        <button
          type="button"
          className={`nav-tab ${activeSection === 'pages' ? 'active' : ''}`}
          onClick={() => setActiveSection('pages')}
        >
          Pages ({pages.length})
        </button>
        <button
          type="button"
          className={`nav-tab ${activeSection === 'files' ? 'active' : ''}`}
          onClick={() => setActiveSection('files')}
        >
          Files ({files.length})
        </button>
      </div>

      <div className="library-management-content">
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
              {activeSection === 'pages' && <option value="size">Sort by Size</option>}
            </select>
          </div>
        )}

        {activeSection === 'workspaces' && (
          <div className="workspaces-section">
            <div className="section-header">
              <h3>Workspaces</h3>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={handleCreateWorkspace}
              >
                + New Workspace
              </button>
            </div>

            {isLoading ? (
              <div className="loading-spinner"></div>
            ) : filteredWorkspaces.length === 0 ? (
              <div className="empty-state">
                <p>No workspaces found. Create your first workspace to get started!</p>
              </div>
            ) : (
              <div className="items-grid">
                {filteredWorkspaces.map((workspace) => (
                  <div key={workspace.id} className="item-card workspace-card">
                    <div className="item-card-header">
                      <h4
                        className="item-title"
                        onClick={() => onWorkspaceSelect(workspace)}
                      >
                        {(workspace as any).name || workspace.title}
                      </h4>
                      <div className="item-actions">
                        <button
                          type="button"
                          className={`action-btn favorite-btn ${workspace.isFavorited ? 'favorited' : ''}`}
                          onClick={() => handleToggleFavorite(workspace)}
                          title={workspace.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          {workspace.isFavorited ? '★' : '☆'}
                        </button>
                        <button
                          type="button"
                          className="action-btn delete-btn"
                          onClick={() => handleDeleteWorkspace(workspace)}
                          title="Delete workspace"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="item-card-meta">
                      <p>Last accessed: {formatDate(workspace.lastAccessedAt || workspace.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'pages' && (
          <div className="pages-section">
            <div className="section-header">
              <h3>Pages</h3>
            </div>

            {isLoading ? (
              <div className="loading-spinner"></div>
            ) : filteredPages.length === 0 ? (
              <div className="empty-state">
                <p>No pages found in this library.</p>
              </div>
            ) : (
              <div className="items-grid">
                {filteredPages.map((page) => {
                  const contentPreview = (page as any).content_preview || page.contentPreview || '';
                  const fileSize = parseInt((page as any).file_size || page.fileSize || '0');
                  const updatedDate = (page as any).updated_at || page.updatedAt || page.createdAt;
                  
                  return (
                    <div key={page.id} className="item-card card-card">
                      <div className="item-card-header">
                        <h4 className="item-title">{page.title}</h4>
                        <div className="item-actions">
                          <button
                            type="button"
                            className="action-btn open-btn"
                            onClick={() => handleOpenCardInNewWorkspace(page)}
                            title="Open in new workspace"
                          >
                            ↗
                          </button>
                          <button
                            type="button"
                            className="action-btn delete-btn"
                            onClick={() => handleDeletePage(page)}
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
                          onClick={() => handleOpenFileInWorkspace(file)}
                          title="Open in new workspace"
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
                    : 'No files have been uploaded to this library yet.'
                  }
                </p>
                <p>Upload PDF and EPUB files through workspaces to see them here.</p>
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

export default LibraryManagement;