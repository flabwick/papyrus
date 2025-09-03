import React, { useState } from 'react';
import { Brain } from '../types';

interface BrainListProps {
  brains: Brain[];
  isLoading: boolean;
  onBrainSelect: (brain: Brain) => void;
  onCreateBrain: (title: string) => void;
  onRenameBrain?: (brain: Brain, newTitle: string) => void;
  onDeleteBrain?: (brain: Brain) => void;
}

const BrainList: React.FC<BrainListProps> = ({
  brains,
  isLoading,
  onBrainSelect,
  onCreateBrain,
  onRenameBrain,
  onDeleteBrain,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newBrainTitle, setNewBrainTitle] = useState('');
  const [renamingBrainId, setRenamingBrainId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  const handleCreate = () => {
    if (newBrainTitle.trim()) {
      onCreateBrain(newBrainTitle.trim());
      setNewBrainTitle('');
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewBrainTitle('');
    }
  };

  const handleStartRename = (brain: Brain, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent brain selection
    setRenamingBrainId(brain.id);
    setRenameTitle((brain as any).name || brain.title);
  };

  const handleRename = (brain: Brain) => {
    if (renameTitle.trim() && onRenameBrain) {
      onRenameBrain(brain, renameTitle.trim());
    }
    setRenamingBrainId(null);
    setRenameTitle('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, brain: Brain) => {
    if (e.key === 'Enter') {
      handleRename(brain);
    } else if (e.key === 'Escape') {
      setRenamingBrainId(null);
      setRenameTitle('');
    }
  };

  const handleDeleteBrain = (brain: Brain, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent brain selection
    const brainName = (brain as any).name || brain.title;
    if (window.confirm(`Are you sure you want to delete "${brainName}"? This will permanently delete all data, files, and streams in this brain.`)) {
      if (onDeleteBrain) {
        onDeleteBrain(brain);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="brain-list-loading">
        <div className="loading-spinner"></div>
        <p>Loading brains...</p>
      </div>
    );
  }

  return (
    <div className="brain-list">
      <div className="brain-list-header">
        <h3>Your Brains</h3>
        {!isCreating && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsCreating(true)}
          >
            + Create New Brain
          </button>
        )}
      </div>

      {isCreating && (
        <div className="brain-create-form">
          <input
            type="text"
            value={newBrainTitle}
            onChange={(e) => setNewBrainTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter brain title..."
            className="form-input"
            autoFocus
          />
          <div className="brain-create-actions">
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={handleCreate}
              disabled={!newBrainTitle.trim()}
            >
              Create
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setIsCreating(false);
                setNewBrainTitle('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {brains.length === 0 ? (
        <div className="brain-list-empty">
          <p>No brains found. Create your first brain to get started!</p>
        </div>
      ) : (
        <div className="brain-list-grid">
          {brains.map((brain) => (
            <div
              key={brain.id}
              className="brain-card"
              onClick={() => renamingBrainId !== brain.id && onBrainSelect(brain)}
            >
              <div className="brain-card-header">
                {renamingBrainId === brain.id ? (
                  <input
                    type="text"
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    onBlur={() => handleRename(brain)}
                    onKeyDown={(e) => handleRenameKeyDown(e, brain)}
                    className="form-input brain-rename-input"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <h4
                    onClick={(e) => handleStartRename(brain, e)}
                    className="brain-card-title"
                    title="Click to rename"
                  >
                    {(brain as any).name || brain.title}
                  </h4>
                )}
                <div className="brain-card-actions">
                  <span className="brain-card-icon">🧠</span>
                  {onDeleteBrain && (
                    <button
                      type="button"
                      className="brain-delete-btn"
                      onClick={(e) => handleDeleteBrain(brain, e)}
                      title="Delete brain permanently"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
              <div className="brain-card-meta">
                <p className="brain-card-storage">
                  {formatBytes(brain.storageUsed || 0)} used
                </p>
                <p className="brain-card-date">
                  Created {formatDate(brain.createdAt)}
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

export default BrainList;