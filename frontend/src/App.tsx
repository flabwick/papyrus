import React from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider, useApp } from './contexts/AppContext';
import Login from './components/Login';
import Header from './components/Header';
import WorkspaceView from './components/WorkspaceView';
import CommandBar from './components/CommandBar';
import LibraryInterface from './components/LibraryInterface';
import { Library, Workspace } from './types';
import api from './services/api';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { selectedLibrary, currentWorkspace, setLibrary, setWorkspace, setError } = useApp();
  const [showLibraryInterface, setShowLibraryInterface] = React.useState(false);
  const [libraryInterfaceInitialLibrary, setLibraryInterfaceInitialLibrary] = React.useState<Library | null>(null);

  const handleLibrarySelect = (library: Library) => {
    setLibrary(library);
    setWorkspace(null); // Clear current workspace when changing libraries
  };

  const handleWorkspaceSelect = (workspace: Workspace) => {
    setWorkspace(workspace);
    setShowLibraryInterface(false); // Close library interface when workspace is selected
  };

  const handleNewWorkspace = async () => {
    if (!selectedLibrary) return;

    try {
      const name = prompt('Enter workspace name:');
      if (!name?.trim()) return;

      const response = await api.post('/workspaces', {
        libraryId: selectedLibrary.id,
        name: name.trim(),
        isFavorited: false
      });

      const newWorkspace = response.data.workspace;
      setWorkspace(newWorkspace);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to create workspace';
      setError(errorMessage);
    }
  };


  if (authLoading) {
    return (
      <div className="app">
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh' 
        }}>
          <div style={{ textAlign: 'center' }}>
            <span className="loading-spinner" style={{ width: '32px', height: '32px' }} />
            <p style={{ marginTop: '1rem' }}>Loading Clarity...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app">
        <Login />
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        onLibrarySelect={handleLibrarySelect}
        onWorkspaceSelect={handleWorkspaceSelect}
        onNewWorkspace={handleNewWorkspace}
        onOpenLibraryInterface={() => {
          setLibraryInterfaceInitialLibrary(null);
          setShowLibraryInterface(true);
        }}
        onOpenCurrentLibraryManagement={() => {
          setLibraryInterfaceInitialLibrary(selectedLibrary);
          setShowLibraryInterface(true);
        }}
      />
      
      <main className="app-main">
        <div className="app-content">
          {showLibraryInterface ? (
            <LibraryInterface
              isOpen={true}
              onClose={() => {
                setShowLibraryInterface(false);
                setLibraryInterfaceInitialLibrary(null);
              }}
              onLibrarySelect={handleLibrarySelect}
              onWorkspaceSelect={handleWorkspaceSelect}
              initialLibrary={libraryInterfaceInitialLibrary}
            />
          ) : selectedLibrary && currentWorkspace ? (
            <WorkspaceView
              workspaceId={currentWorkspace.id}
              libraryId={selectedLibrary.id}
            />
          ) : selectedLibrary ? (
            <div className="text-center" style={{ padding: '2rem' }}>
              <p>Select a workspace or create a new one to get started.</p>
              <button 
                onClick={handleNewWorkspace}
                className="btn btn-primary"
              >
                Create New Workspace
              </button>
            </div>
          ) : (
            <div className="text-center" style={{ padding: '2rem' }}>
              <p>Loading your librarys...</p>
            </div>
          )}
        </div>
      </main>

      <CommandBar
        workspaceId={currentWorkspace?.id}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
};

export default App;