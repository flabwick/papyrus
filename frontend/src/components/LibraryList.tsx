import React, { useState } from 'react';
import { Library } from '../types';

interface LibraryListProps {
  librarys: Library[];
  isLoading: boolean;
  onLibrarySelect: (library: Library) => void;
  onCreateLibrary: (title: string) => void;
  onRenameLibrary?: (library: Library, newTitle: string) => void;
  onDeleteLibrary?: (library: Library) => void;
}

const LibraryList: React.FC<LibraryListProps> = ({
  librarys,
  isLoading,
  onLibrarySelect,
  onCreateLibrary,
  onRenameLibrary,
  onDeleteLibrary,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newLibraryTitle, setNewLibraryTitle] = useState('');
  const [renamingLibraryId, setRenamingLibraryId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  const handleCreate = () => {
    if (newLibraryTitle.trim()) {
      onCreateLibrary(newLibraryTitle.trim());
      setNewLibraryTitle('');
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewLibraryTitle('');
    }
  };

  const handleStartRename = (library: Library, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent library selection
    setRenamingLibraryId(library.id);
    setRenameTitle((library as any).name || library.title);
  };

  const handleRename = (library: Library) => {
    if (renameTitle.trim() && onRenameLibrary) {
      onRenameLibrary(library, renameTitle.trim());
    }
    setRenamingLibraryId(null);
    setRenameTitle('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, library: Library) => {
    if (e.key === 'Enter') {
      handleRename(library);
    } else if (e.key === 'Escape') {
      setRenamingLibraryId(null);
      setRenameTitle('');
    }
  };

  const handleDeleteLibrary = (library: Library, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent library selection
    const libraryName = (library as any).name || library.title;
    if (window.confirm(`Are you sure you want to delete "${libraryName}"? This will permanently delete all data, files, and workspaces in this library.`)) {
      if (onDeleteLibrary) {
        onDeleteLibrary(library);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="library-list-loading">
        <div className="loading-spinner"></div>
        <p>Loading librarys...</p>
      </div>
    );
  }

  return (
    <div className="library-list">
      <div className="library-list-header">
        <h3>Your Librarys</h3>
        {!isCreating && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsCreating(true)}
          >
            + Create New Library
          </button>
        )}
      </div>

      {isCreating && (
        <div className="library-create-form">
          <input
            type="text"
            value={newLibraryTitle}
            onChange={(e) => setNewLibraryTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter library title..."
            className="form-input"
            autoFocus
          />
          <div className="library-create-actions">
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={handleCreate}
              disabled={!newLibraryTitle.trim()}
            >
              Create
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setIsCreating(false);
                setNewLibraryTitle('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {librarys.length === 0 ? (
        <div className="library-list-empty">
          <p>No librarys found. Create your first library to get started!</p>
        </div>
      ) : (
        <div className="library-list-grid">
          {librarys.map((library) => (
            <div
              key={library.id}
              className="library-card"
              onClick={() => renamingLibraryId !== library.id && onLibrarySelect(library)}
            >
              <div className="library-card-header">
                {renamingLibraryId === library.id ? (
                  <input
                    type="text"
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    onBlur={() => handleRename(library)}
                    onKeyDown={(e) => handleRenameKeyDown(e, library)}
                    className="form-input library-rename-input"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <h4
                    onClick={(e) => handleStartRename(library, e)}
                    className="library-card-title"
                    title="Click to rename"
                  >
                    {(library as any).name || library.title}
                  </h4>
                )}
                <div className="library-card-actions">
                  <span className="library-card-icon">🧠</span>
                  {onDeleteLibrary && (
                    <button
                      type="button"
                      className="library-delete-btn"
                      onClick={(e) => handleDeleteLibrary(library, e)}
                      title="Delete library permanently"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
              <div className="library-card-meta">
                <p className="library-card-storage">
                  {formatBytes(library.storageUsed || 0)} used
                </p>
                <p className="library-card-date">
                  Created {formatDate(library.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
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

export default LibraryList;