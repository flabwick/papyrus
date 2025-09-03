import React from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider, useApp } from './contexts/AppContext';
import Login from './components/Login';
import Header from './components/Header';
import StreamView from './components/StreamView';
import CommandBar from './components/CommandBar';
import BrainInterface from './components/BrainInterface';
import { Brain, Stream } from './types';
import api from './services/api';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { selectedBrain, currentStream, setBrain, setStream, setError } = useApp();
  const [showBrainInterface, setShowBrainInterface] = React.useState(false);
  const [brainInterfaceInitialBrain, setBrainInterfaceInitialBrain] = React.useState<Brain | null>(null);

  const handleBrainSelect = (brain: Brain) => {
    setBrain(brain);
    setStream(null); // Clear current stream when changing brains
  };

  const handleStreamSelect = (stream: Stream) => {
    setStream(stream);
    setShowBrainInterface(false); // Close brain interface when stream is selected
  };

  const handleNewStream = async () => {
    if (!selectedBrain) return;

    try {
      const title = prompt('Enter stream title:');
      if (!title?.trim()) return;

      const response = await api.post('/streams', {
        brainId: selectedBrain.id,
        name: title.trim(),
        isFavorited: false
      });

      const newStream = response.data.stream;
      setStream(newStream);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to create stream';
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
        onBrainSelect={handleBrainSelect}
        onStreamSelect={handleStreamSelect}
        onNewStream={handleNewStream}
        onOpenBrainInterface={() => {
          setBrainInterfaceInitialBrain(null);
          setShowBrainInterface(true);
        }}
        onOpenCurrentBrainManagement={() => {
          setBrainInterfaceInitialBrain(selectedBrain);
          setShowBrainInterface(true);
        }}
      />
      
      <main className="app-main">
        <div className="app-content">
          {showBrainInterface ? (
            <BrainInterface
              isOpen={true}
              onClose={() => {
                setShowBrainInterface(false);
                setBrainInterfaceInitialBrain(null);
              }}
              onBrainSelect={handleBrainSelect}
              onStreamSelect={handleStreamSelect}
              initialBrain={brainInterfaceInitialBrain}
            />
          ) : selectedBrain && currentStream ? (
            <StreamView
              streamId={currentStream.id}
              brainId={selectedBrain.id}
            />
          ) : selectedBrain ? (
            <div className="text-center" style={{ padding: '2rem' }}>
              <p>Select a stream or create a new one to get started.</p>
              <button 
                onClick={handleNewStream}
                className="btn btn-primary"
              >
                Create New Stream
              </button>
            </div>
          ) : (
            <div className="text-center" style={{ padding: '2rem' }}>
              <p>Loading your brains...</p>
            </div>
          )}
        </div>
      </main>

      <CommandBar
        streamId={currentStream?.id}
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