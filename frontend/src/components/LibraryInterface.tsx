import React, { useState, useEffect } from 'react';
import { Library, Workspace, Card } from '../types';
import { useApp } from '../contexts/AppContext';
import api from '../services/api';
import LibraryList from './LibraryList';
import LibraryManagement from './LibraryManagement';

interface LibraryInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  onLibrarySelect: (library: Library) => void;
  onWorkspaceSelect: (workspace: Workspace) => void;
  initialLibrary?: Library | null; // Optional: if provided, opens directly to this library's management
}

type View = 'library-list' | 'library-management';

const LibraryInterface: React.FC<LibraryInterfaceProps> = ({
  isOpen,
  onClose,
  onLibrarySelect,
  onWorkspaceSelect,
  initialLibrary,
}) => {
  const [view, setView] = useState<View>('library-list');
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null);
  const [librarys, setLibrarys] = useState<Library[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { setError, selectedLibrary: globalSelectedLibrary, setLibrary: setGlobalLibrary, setWorkspace: setGlobalWorkspace } = useApp();

  useEffect(() => {
    if (isOpen) {
      loadLibrarys();
      
      // If initialLibrary is provided, set up the view to show that library's management
      if (initialLibrary) {
        setSelectedLibrary(initialLibrary);
        setView('library-management');
      } else {
        setSelectedLibrary(null);
        setView('library-list');
      }
    }
  }, [isOpen, initialLibrary]);

  // No longer needed for non-modal interface

  const loadLibrarys = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/libraries');
      setLibrarys(response.data.librarys || []);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to load librarys';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLibrarySelect = (library: Library) => {
    setSelectedLibrary(library);
    setView('library-management');
  };

  const handleWorkspaceSelect = (workspace: Workspace) => {
    onWorkspaceSelect(workspace);
    onClose();
  };

  const handleLibraryChange = (library: Library) => {
    onLibrarySelect(library);
    onClose();
  };

  const handleBackToLibraryList = () => {
    setView('library-list');
    setSelectedLibrary(null);
  };

  const handleCreateLibrary = async (title: string) => {
    try {
      setIsLoading(true);
      const response = await api.post('/libraries', { name: title });
      const newLibrary = response.data.library;
      setLibrarys([...librarys, newLibrary]);
      setSelectedLibrary(newLibrary);
      setView('library-management');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to create library';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenameLibrary = async (library: Library, newTitle: string) => {
    try {
      await api.put(`/libraries/${library.id}`, { name: newTitle });
      setLibrarys(librarys.map(b => 
        b.id === library.id ? { ...b, name: newTitle } as any : b
      ));
      // If this is the currently selected library, update it too
      if (selectedLibrary?.id === library.id) {
        setSelectedLibrary({ ...selectedLibrary, name: newTitle } as any);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to rename library';
      setError(errorMessage);
    }
  };

  const handleDeleteLibrary = async (library: Library) => {
    try {
      setIsLoading(true);
      await api.delete(`/libraries/${library.id}`);
      setLibrarys(librarys.filter(b => b.id !== library.id));
      
      // If we deleted the currently selected library, go back to library list
      if (selectedLibrary?.id === library.id) {
        setSelectedLibrary(null);
        setView('library-list');
      }
      
      // Also clear global app state if this library was globally selected
      if (globalSelectedLibrary?.id === library.id) {
        setGlobalLibrary(null);
        setGlobalWorkspace(null);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to delete library';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="library-interface">
      <div className="library-interface-header">
        <h1>
          {view === 'library-list' ? 'Librarys' : (selectedLibrary as any)?.name || selectedLibrary?.title}
        </h1>
        <button
          type="button"
          className="library-interface-close"
          onClick={onClose}
          title="Back to Workspace"
        >
          ← Back to Workspace
        </button>
      </div>

      <div className="library-interface-content">
        {view === 'library-list' ? (
          <LibraryList
            librarys={librarys}
            isLoading={isLoading}
            onLibrarySelect={handleLibrarySelect}
            onCreateLibrary={handleCreateLibrary}
            onRenameLibrary={handleRenameLibrary}
            onDeleteLibrary={handleDeleteLibrary}
          />
        ) : selectedLibrary ? (
          <LibraryManagement
            library={selectedLibrary}
            onWorkspaceSelect={handleWorkspaceSelect}
            onLibrarySelect={handleLibraryChange}
            onBack={handleBackToLibraryList}
          />
        ) : null}
      </div>
    </div>
  );
};

export default LibraryInterface;