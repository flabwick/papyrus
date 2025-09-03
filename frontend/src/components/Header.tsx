import React, { useState, useEffect } from 'react';
import { Brain, Stream } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import api from '../services/api';

interface HeaderProps {
  onBrainSelect: (brain: Brain) => void;
  onStreamSelect: (stream: Stream) => void;
  onNewStream: () => Promise<void>;
  onOpenBrainInterface: () => void;
  onOpenCurrentBrainManagement: () => void;
}

const Header: React.FC<HeaderProps> = ({ onBrainSelect, onStreamSelect, onNewStream, onOpenBrainInterface, onOpenCurrentBrainManagement }) => {
  const [isEditingStreamName, setIsEditingStreamName] = useState(false);
  const [editStreamName, setEditStreamName] = useState('');
  const { user, logout } = useAuth();
  const { selectedBrain, currentStream, setError } = useApp();

  // Auto-load first brain and stream on mount
  useEffect(() => {
    const loadInitialData = async () => {
      if (!selectedBrain) {
        try {
          const response = await api.get('/brains');
          const brains = response.data.brains || [];
          if (brains.length > 0) {
            onBrainSelect(brains[0]);
          }
        } catch (err: any) {
          setError(err.response?.data?.message || 'Failed to load brains');
        }
      }
    };
    
    loadInitialData();
  }, []);

  useEffect(() => {
    const loadInitialStream = async () => {
      if (selectedBrain && !currentStream) {
        try {
          const response = await api.get(`/streams?brainId=${selectedBrain.id}`);
          const streams = response.data.streams || [];
          if (streams.length > 0) {
            onStreamSelect(streams[0]);
          }
        } catch (err: any) {
          setError(err.response?.data?.message || 'Failed to load streams');
        }
      }
    };
    
    loadInitialStream();
  }, [selectedBrain]);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      await logout();
    }
  };

  const handleStartStreamEdit = () => {
    if (currentStream) {
      const streamName = (currentStream as any).name || currentStream.title || '';
      setEditStreamName(streamName);
      setIsEditingStreamName(true);
    }
  };

  const handleStreamRename = async () => {
    if (!currentStream || !selectedBrain || !editStreamName.trim()) {
      setIsEditingStreamName(false);
      return;
    }

    const newName = editStreamName.trim();
    const currentName = (currentStream as any).name || currentStream.title || '';
    
    if (newName === currentName) {
      setIsEditingStreamName(false);
      return;
    }

    try {
      // Check if stream name already exists in this brain
      const response = await api.get(`/streams?brainId=${selectedBrain.id}`);
      const streams = response.data.streams || [];
      const nameExists = streams.some((s: any) => 
        s.id !== currentStream.id && 
        ((s.name || s.title || '').toLowerCase() === newName.toLowerCase())
      );

      if (nameExists) {
        setError(`A stream named "${newName}" already exists in this brain`);
        setIsEditingStreamName(false);
        return;
      }

      // Update the stream name
      await api.put(`/streams/${currentStream.id}`, { name: newName });
      
      // Update the current stream in the app context
      const updatedStream = { ...currentStream, name: newName } as any;
      onStreamSelect(updatedStream);
      
      setIsEditingStreamName(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to rename stream');
      setIsEditingStreamName(false);
    }
  };

  const handleStreamEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleStreamRename();
    } else if (e.key === 'Escape') {
      setIsEditingStreamName(false);
      setEditStreamName('');
    }
  };


  return (
    <>
      <header className="app-header">
        <div className="flex items-center gap-md">
          {/* Brain Interface Button */}
          <button
            type="button"
            className="btn btn-small brain-interface-btn"
            onClick={onOpenBrainInterface}
            title="Open Brain Interface"
          >
            🧠
          </button>

          {/* Breadcrumb Navigation */}
          <div className="breadcrumb-nav">
            {selectedBrain && (
              <>
                <button
                  type="button"
                  className="breadcrumb-item brain-breadcrumb"
                  onClick={onOpenCurrentBrainManagement}
                  title="Manage current brain"
                >
                  {(selectedBrain as any).name || selectedBrain.title}
                </button>
                {currentStream && (
                  <>
                    <span className="breadcrumb-separator">›</span>
                    {isEditingStreamName ? (
                      <input
                        type="text"
                        value={editStreamName}
                        onChange={(e) => setEditStreamName(e.target.value)}
                        onBlur={handleStreamRename}
                        onKeyDown={handleStreamEditKeyDown}
                        className="breadcrumb-item stream-breadcrumb-input"
                        autoFocus
                        style={{
                          background: 'white',
                          border: '2px solid var(--focus-ring)',
                          borderRadius: 'var(--border-radius)',
                          padding: 'var(--spacing-xs) var(--spacing-sm)',
                          fontSize: 'var(--font-size-body)',
                          fontWeight: 'var(--font-weight-title)',
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="breadcrumb-item stream-breadcrumb"
                        onClick={handleStartStreamEdit}
                        title="Click to rename stream"
                      >
                        {(currentStream as any).name || currentStream.title}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-md">
          {/* User info and logout */}
          <div className="flex items-center gap-sm">
            <span className="body-text" style={{ fontSize: '12px', color: '#6b7280' }}>
              {user?.username}
            </span>
            <button
              onClick={handleLogout}
              className="btn btn-small"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;