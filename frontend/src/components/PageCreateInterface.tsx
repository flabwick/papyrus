import React, { useState, useEffect } from 'react';
import { Card as CardType } from '../types';
import api from '../services/api';

interface CardCreateInterfaceProps {
  libraryId: string;
  onCardCreated: (card: CardType) => void;
  onCancel: () => void;
}

const CardCreateInterface: React.FC<CardCreateInterfaceProps> = ({
  libraryId,
  onCardCreated,
  onCancel
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [titleError, setTitleError] = useState('');
  const [isTitleValid, setIsTitleValid] = useState(true);

  useEffect(() => {
    if (title.trim()) {
      checkTitleExists();
    } else {
      setTitleError('');
      setIsTitleValid(true);
    }
  }, [title, libraryId]);

  const checkTitleExists = async () => {
    try {
      const response = await api.get(`/libraries/${libraryId}/pages/check-title`, {
        params: { title: title.trim() }
      });
      
      if (response.data.exists) {
        setTitleError('A card with this title already exists');
        setIsTitleValid(false);
      } else {
        setTitleError('');
        setIsTitleValid(true);
      }
    } catch (err) {
      // If the endpoint doesn't exist, fall back to client-side validation
      // This will be caught when the user tries to create the card
      setTitleError('');
      setIsTitleValid(true);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      setTitleError('Title is required');
      setIsTitleValid(false);
      return;
    }

    if (!isTitleValid) {
      return;
    }

    setIsCreating(true);
    try {
      const response = await api.post('/cards', {
        title: title.trim(),
        content: content.trim(),
        libraryId: libraryId
      });

      const newCard = response.data.card;
      onCardCreated(newCard);
    } catch (err: any) {
      if (err.response?.data?.message?.includes('already exists')) {
        setTitleError('A card with this title already exists');
        setIsTitleValid(false);
      } else {
        // Ensure error message is always a string
        const errorMessage = typeof err.response?.data?.message === 'string' 
          ? err.response.data.message 
          : err.response?.data?.message?.message || err.message || 'Failed to create card';
        setTitleError(errorMessage);
        setIsTitleValid(false);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
    // Ctrl+S or Cmd+S to save
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!isCreating && isTitleValid && title.trim()) {
        handleCreate();
      }
    }
  };

  return (
    <div className="card" style={{ borderStyle: 'solid', borderColor: '#10b981' }}>
      <div className="card-header">
        <h3 className="card-title">Create New Page</h3>
        <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '0.25rem' }}>
          Create a new page in this library and add it to the current workspace
        </div>
      </div>
      
      <div className="card-content">
        {/* Title Input */}
        <div className="form-group">
          <label htmlFor="card-title" className="form-label">
            Title <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="card-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`form-input ${!isTitleValid ? 'form-input-error' : ''}`}
            placeholder="Enter card title..."
            autoFocus
            style={{
              borderColor: !isTitleValid ? '#ef4444' : undefined,
              backgroundColor: !isTitleValid ? '#fef2f2' : undefined
            }}
          />
          {titleError && (
            <div style={{ 
              color: '#ef4444', 
              fontSize: '14px', 
              marginTop: '0.25rem',
              fontWeight: '500'
            }}>
              {titleError}
            </div>
          )}
        </div>

        {/* Content Textarea */}
        <div className="form-group">
          <label htmlFor="card-content" className="form-label">
            Content
          </label>
          <textarea
            id="card-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="form-input form-textarea"
            placeholder="Write your content in markdown..."
            rows={8}
            style={{ 
              width: '100%', 
              resize: 'vertical',
              minHeight: '200px'
            }}
          />
          <div style={{ 
            fontSize: '12px', 
            color: '#6b7280', 
            marginTop: '0.25rem' 
          }}>
            Supports Markdown formatting. Press Ctrl+S (or Cmd+S) to save.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-sm justify-end">
          <button
            onClick={onCancel}
            className="btn btn-small"
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="btn btn-primary btn-small"
            disabled={!title.trim() || !isTitleValid || isCreating}
          >
            {isCreating ? (
              <>
                <span className="loading-spinner" />
                Creating...
              </>
            ) : (
              'Create Page'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CardCreateInterface;