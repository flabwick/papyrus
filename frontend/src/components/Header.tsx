import React, { useState, useEffect } from 'react';
import { Library, Workspace } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import api from '../services/api';

interface HeaderProps {
  onLibrarySelect: (library: Library) => void;
  onWorkspaceSelect: (workspace: Workspace) => void;
  onNewWorkspace: () => Promise<void>;
  onOpenLibraryInterface: () => void;
  onOpenCurrentLibraryManagement: () => void;
}

const Header: React.FC<HeaderProps> = ({ onLibrarySelect, onWorkspaceSelect, onNewWorkspace, onOpenLibraryInterface, onOpenCurrentLibraryManagement }) => {
  const [isEditingWorkspaceName, setIsEditingWorkspaceName] = useState(false);
  const [editWorkspaceName, setEditWorkspaceName] = useState('');
  const { user, logout } = useAuth();
  const { selectedLibrary, currentWorkspace, setError } = useApp();

  // Auto-load first library and workspace on mount
  useEffect(() => {
    const loadInitialData = async () => {
      if (!selectedLibrary) {
        try {
          const response = await api.get('/libraries');
          const libraries = response.data.libraries || [];
          if (libraries.length > 0) {
            onLibrarySelect(libraries[0]);
          }
        } catch (err: any) {
          setError(err.response?.data?.message || 'Failed to load libraries');
        }
      }
    };
    
    loadInitialData();
  }, []);

  useEffect(() => {
    const loadInitialWorkspace = async () => {
      if (selectedLibrary && !currentWorkspace) {
        try {
          const response = await api.get(`/workspaces?libraryId=${selectedLibrary.id}`);
          const workspaces = response.data.workspaces || [];
          if (workspaces.length > 0) {
            onWorkspaceSelect(workspaces[0]);
          }
        } catch (err: any) {
          setError(err.response?.data?.message || 'Failed to load workspaces');
        }
      }
    };
    
    loadInitialWorkspace();
  }, [selectedLibrary]);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      await logout();
    }
  };

  const handleStartWorkspaceEdit = () => {
    if (currentWorkspace) {
      const workspaceName = (currentWorkspace as any).name || currentWorkspace.title || '';
      setEditWorkspaceName(workspaceName);
      setIsEditingWorkspaceName(true);
    }
  };

  const handleWorkspaceRename = async () => {
    if (!currentWorkspace || !selectedLibrary || !editWorkspaceName.trim()) {
      setIsEditingWorkspaceName(false);
      return;
    }

    const newName = editWorkspaceName.trim();
    const currentName = (currentWorkspace as any).name || currentWorkspace.title || '';
    
    if (newName === currentName) {
      setIsEditingWorkspaceName(false);
      return;
    }

    try {
      // Check if workspace name already exists in this library
      const response = await api.get(`/workspaces?libraryId=${selectedLibrary.id}`);
      const workspaces = response.data.workspaces || [];
      const nameExists = workspaces.some((s: any) => 
        s.id !== currentWorkspace.id && 
        ((s.name || s.title || '').toLowerCase() === newName.toLowerCase())
      );

      if (nameExists) {
        setError(`A workspace named "${newName}" already exists in this library`);
        setIsEditingWorkspaceName(false);
        return;
      }

      // Update the workspace name
      await api.put(`/workspaces/${currentWorkspace.id}`, { name: newName });
      
      // Update the current workspace in the app context
      const updatedWorkspace = { ...currentWorkspace, name: newName } as any;
      onWorkspaceSelect(updatedWorkspace);
      
      setIsEditingWorkspaceName(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to rename workspace');
      setIsEditingWorkspaceName(false);
    }
  };

  const handleWorkspaceEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleWorkspaceRename();
    } else if (e.key === 'Escape') {
      setIsEditingWorkspaceName(false);
      setEditWorkspaceName('');
    }
  };


  return (
    <>
      <header className="app-header">
        <div className="flex items-center gap-md">
          {/* Library Interface Button */}
          <button
            type="button"
            className="btn btn-small library-interface-btn"
            onClick={onOpenLibraryInterface}
            title="Open Library Interface"
          >
            🧠
          </button>

          {/* Breadcrumb Navigation */}
          <div className="breadcrumb-nav">
            {selectedLibrary && (
              <>
                <button
                  type="button"
                  className="breadcrumb-item library-breadcrumb"
                  onClick={onOpenCurrentLibraryManagement}
                  title="Manage current library"
                >
                  {(selectedLibrary as any).name || selectedLibrary.title}
                </button>
                {currentWorkspace && (
                  <>
                    <span className="breadcrumb-separator">›</span>
                    {isEditingWorkspaceName ? (
                      <input
                        type="text"
                        value={editWorkspaceName}
                        onChange={(e) => setEditWorkspaceName(e.target.value)}
                        onBlur={handleWorkspaceRename}
                        onKeyDown={handleWorkspaceEditKeyDown}
                        className="breadcrumb-item workspace-breadcrumb-input"
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
                        className="breadcrumb-item workspace-breadcrumb"
                        onClick={handleStartWorkspaceEdit}
                        title="Click to rename workspace"
                      >
                        {(currentWorkspace as any).name || currentWorkspace.title}
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