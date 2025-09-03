import React, { useState, useEffect } from 'react';
import Card from './Card';
import FileViewer from './FileViewer';
import CardSearchInterface from './CardSearchInterface';
import FileUploadInterface from './FileUploadInterface';
import FileSearchInterface from './FileSearchInterface';
import { Stream, StreamCard, Card as CardType } from '../types';
import api from '../services/api';
import { useApp } from '../contexts/AppContext';
import config from '../config.js';

interface StreamItem {
  itemType: 'card' | 'file';
  position: number;
  id: string;
  [key: string]: any;
}

interface StreamViewProps {
  streamId: string;
  brainId: string;
}

const StreamView: React.FC<StreamViewProps> = ({ streamId, brainId }) => {
  const [stream, setStream] = useState<Stream | null>(null);
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]); // Mixed cards and files
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCardIdForAdd, setActiveCardIdForAdd] = useState<string | null>(null);
  const [generatingCardId, setGeneratingCardId] = useState<string | null>(null);
  const [generationController, setGenerationController] = useState<AbortController | null>(null);
  const [activeCardIdForUpload, setActiveCardIdForUpload] = useState<string | null>(null);
  const [activeCardIdForFileAdd, setActiveCardIdForFileAdd] = useState<string | null>(null);
  const { setError: setGlobalError, aiContextCards } = useApp();

  useEffect(() => {
    loadStream();
  }, [streamId]);

  const loadStream = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Load stream data
      const streamResponse = await api.get(`/streams/${streamId}`);
      setStream(streamResponse.data.stream);

      // Load stream items (mixed cards and files)
      const itemsResponse = await api.get(`/streams/${streamId}/cards`);
      setStreamItems(itemsResponse.data.items || []); // Use items instead of cards
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to load stream';
      setError(errorMessage);
      setGlobalError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCard = async (cardId: string, updates: Partial<CardType>) => {
    try {
      // Store original state for potential revert
      const originalStreamItems = [...streamItems];
      
      // Optimistically update the UI immediately
      const newStreamItems = streamItems.map(item => {
        if (item.itemType === 'card') {
          const currentCardId = item.cardId || item.id;
          if (currentCardId === cardId) {
            return {
              ...item,
              ...updates
            };
          }
        }
        return item;
      });
      setStreamItems(newStreamItems);
      
      // Update server in background
      try {
        await api.put(`/cards/${cardId}`, updates);
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setStreamItems(originalStreamItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to update card';
      setGlobalError(errorMessage);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      // Optimistically remove card from UI immediately
      const originalStreamItems = streamItems;
      const newStreamItems = streamItems.filter(item => 
        !(item.itemType === 'card' && (item.cardId || item.id) === cardId)
      );
      setStreamItems(newStreamItems);
      
      // Update server in background
      try {
        await api.delete(`/streams/${streamId}/cards/${cardId}`);
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setStreamItems(originalStreamItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to remove card from stream';
      setGlobalError(errorMessage);
    }
  };

  const handleDeleteCardFromBrain = async (cardId: string) => {
    try {
      // Optimistically remove card from UI immediately
      const originalStreamItems = streamItems;
      const newStreamItems = streamItems.filter(item => 
        !(item.itemType === 'card' && (item.cardId || item.id) === cardId)
      );
      setStreamItems(newStreamItems);
      
      // Update server in background - use hard delete to completely remove from brain
      try {
        await api.delete(`/cards/${cardId}?hard=true`);
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setStreamItems(originalStreamItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to delete card from brain';
      setGlobalError(errorMessage);
    }
  };

  const handleToggleCollapse = async (streamCardId: string) => {
    try {
      const streamItem = streamItems.find(item => item.itemType === 'card' && item.id === streamCardId);
      if (!streamItem) return;

      // Optimistically update the UI immediately
      const originalStreamItems = streamItems;
      const newStreamItems = streamItems.map(item => {
        if (item.itemType === 'card' && item.id === streamCardId) {
          return { ...item, isCollapsed: !item.isCollapsed };
        }
        return item;
      });
      setStreamItems(newStreamItems);

      // Update server in background
      try {
        await api.put(`/streams/${streamId}/cards/${streamCardId}`, {
          isCollapsed: !streamItem.isCollapsed
        });
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setStreamItems(originalStreamItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to toggle card collapse';
      setGlobalError(errorMessage);
    }
  };


  // Position management functions
  const handleAddCardBelow = (afterPosition: number) => {
    const itemAtPosition = streamItems.find(item => item.position === afterPosition);
    if (itemAtPosition) {
      setActiveCardIdForAdd(itemAtPosition.cardId || itemAtPosition.id || '');
    }
  };

  const handleCreateCardBelow = async (afterPosition: number) => {
    try {
      // Calculate position for new card
      const nextPosition = afterPosition + 1;
      
      // Create empty unsaved card immediately
      const response = await api.post('/cards/create-empty', {
        brainId: brainId,
        streamId: streamId,
        position: nextPosition
      });

      // Close any interfaces
      setActiveCardIdForAdd(null);
      
      // Save scroll position before reload
      const scrollPosition = window.scrollY;
      
      // Reload stream to show new card
      await loadStream();
      
      // Restore scroll position and auto-focus the new card for editing
      setTimeout(() => {
        // Restore scroll position
        window.scrollTo(0, scrollPosition);
        
        const newCardElement = document.querySelector(`[data-card-id="${response.data.card.id}"]`);
        if (newCardElement) {
          // Trigger edit mode by clicking the title (which opens edit)
          const titleElement = newCardElement.querySelector('.card-title');
          if (titleElement) {
            (titleElement as HTMLElement).click();
          }
        }
      }, 100);
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to create card';
      setGlobalError(errorMessage);
    }
  };

  const handleMoveUp = async (cardId: string) => {
    try {
      const currentIndex = streamItems.findIndex(item => 
        item.itemType === 'card' && (item.cardId || item.id) === cardId
      );
      if (currentIndex <= 0) return; // Already at top

      const currentItem = streamItems[currentIndex];
      const targetItem = streamItems[currentIndex - 1];

      // Store original state for potential revert
      const originalStreamItems = [...streamItems];

      // Optimistically update the UI immediately
      const newStreamItems = [...streamItems];
      newStreamItems[currentIndex] = targetItem;
      newStreamItems[currentIndex - 1] = currentItem;
      setStreamItems(newStreamItems);

      // Update server in background
      try {
        await api.put(`/streams/${streamId}/cards/${cardId}`, {
          position: targetItem.position
        });
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setStreamItems(originalStreamItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to move card';
      setGlobalError(errorMessage);
    }
  };

  const handleMoveDown = async (cardId: string) => {
    try {
      const currentIndex = streamItems.findIndex(item => 
        item.itemType === 'card' && (item.cardId || item.id) === cardId
      );
      if (currentIndex >= streamItems.length - 1) return; // Already at bottom

      const currentItem = streamItems[currentIndex];
      const targetItem = streamItems[currentIndex + 1];

      // Store original state for potential revert
      const originalStreamItems = [...streamItems];

      // Optimistically update the UI immediately
      const newStreamItems = [...streamItems];
      newStreamItems[currentIndex] = targetItem;
      newStreamItems[currentIndex + 1] = currentItem;
      setStreamItems(newStreamItems);

      // Update server in background
      try {
        await api.put(`/streams/${streamId}/cards/${cardId}`, {
          position: targetItem.position
        });
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setStreamItems(originalStreamItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to move card';
      setGlobalError(errorMessage);
    }
  };

  // Inline interface handlers
  const handleInlineAddCard = async (cardId: string, insertAfterPosition: number | null) => {
    try {
      // Save scroll position before operation
      const scrollPosition = window.scrollY;
      
      const requestBody: any = {
        cardId: cardId,
        isInAIContext: false,
        isCollapsed: false
      };
      
      // Only add position if it's not null (null means add at end)
      if (insertAfterPosition !== null) {
        requestBody.position = insertAfterPosition;
      }

      await api.post(`/streams/${streamId}/cards`, requestBody);

      setActiveCardIdForAdd(null);
      await loadStream();
      
      // Restore scroll position after reload
      setTimeout(() => {
        window.scrollTo(0, scrollPosition);
      }, 50);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to add card to stream';
      setGlobalError(errorMessage);
    }
  };


  const handleCancelAdd = () => {
    setActiveCardIdForAdd(null);
  };

  const handleGenerateCardBelow = async (afterPosition: number, prompt: string, model: string) => {
    try {
      // Create empty unsaved card for streaming content
      // Insert after the triggering card position
      const response = await api.post('/cards/create-empty', {
        brainId: brainId,
        streamId: streamId,
        insertAfterPosition: afterPosition
      });

      const newCardId = response.data.card.id;
      setGeneratingCardId(newCardId);

      // Reload stream to show new card
      await loadStream();

      // Start real AI generation with streaming
      const controller = new AbortController();
      setGenerationController(controller);

      // Start AI generation using Server-Sent Events
      try {
        // First, initiate the generation via POST
        const initResponse = await api.post('/ai/generate-streaming', {
          brainId,
          streamId,
          cardId: newCardId,
          prompt,
          model,
          contextCardIds: aiContextCards
        });

        console.log('🔍 AI generation initiated:', initResponse.status);

        // Then connect to the streaming endpoint using EventSource
        const eventSourceUrl = `${config.apiUrl}/ai/stream/${newCardId}`;
        
        const eventSource = new EventSource(eventSourceUrl, {
          withCredentials: true
        });

        console.log(`🤖 Starting AI generation with ${model}`);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
              case 'start':
                console.log(`🤖 Starting AI generation with ${data.model}`);
                break;
                
              case 'chunk':
                // Update local state with new content
                setStreamItems(prev => prev.map(item => {
                  if (item.itemType === 'card' && (item.id === newCardId || (item as any).cardId === newCardId)) {
                    return { ...item, content: data.totalContent, contentPreview: data.totalContent };
                  }
                  return item;
                }));
                break;
                
              case 'complete':
                console.log('✅ AI generation completed');
                setGeneratingCardId(null);
                setGenerationController(null);
                eventSource.close();
                return;
                
              case 'error':
                console.error('❌ AI generation error:', data.message);
                setGlobalError(`AI generation failed: ${data.message}`);
                setGeneratingCardId(null);
                setGenerationController(null);
                eventSource.close();
                return;
            }
          } catch (error) {
            console.error('Error parsing AI stream data:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('EventSource error:', error);
          setGlobalError('AI generation connection failed');
          setGeneratingCardId(null);
          setGenerationController(null);
          eventSource.close();
        };

        // Handle cancellation
        controller.signal.addEventListener('abort', () => {
          eventSource.close();
          setGeneratingCardId(null);
          setGenerationController(null);
        });
      } catch (fetchError: any) {
        if (fetchError.name === 'AbortError') {
          console.log('AI generation cancelled by user');
        } else {
          console.error('AI generation fetch error:', fetchError);
          console.error('Error details:', {
            message: fetchError.message,
            name: fetchError.name,
            status: fetchError.status
          });
          console.log('🔄 Falling back to simulation mode...');
          
          // Fallback to simulation mode
          const aiResponse = `This is a simulated AI response to: "${prompt}"

This content is being generated word by word to demonstrate the streaming functionality. Each word appears gradually to show how the system will work when connected to real AI models.

The system supports:
- Multiple AI model selection (${model})
- Real-time content streaming
- Ability to stop generation midway
- Automatic card creation in expanded form
- Context-aware responses based on selected cards

Note: Real AI integration requires proper nginx configuration to forward /api/ai/ requests to the backend server.`;

          // Stream the content word by word (simulation)
          const words = aiResponse.split(' ');
          let currentContent = '';
          
          for (let i = 0; i < words.length; i++) {
            if (controller.signal.aborted) {
              break;
            }
            
            currentContent += (i > 0 ? ' ' : '') + words[i];
            
            // Update the card content
            await api.put(`/cards/${newCardId}`, { content: currentContent });
            
            // Update local state to reflect changes
            setStreamItems(prev => prev.map(item => {
              if (item.itemType === 'card' && (item.id === newCardId || (item as any).cardId === newCardId)) {
                return { ...item, content: currentContent, contentPreview: currentContent };
              }
              return item;
            }));
            
            // Wait a bit to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        setGeneratingCardId(null);
        setGenerationController(null);
      }
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to generate card';
      setGlobalError(errorMessage);
      setGeneratingCardId(null);
      setGenerationController(null);
    }
  };

  const handleStopGeneration = () => {
    if (generationController) {
      generationController.abort();
      setGeneratingCardId(null);
      setGenerationController(null);
    }
  };

  const handleUploadFileBelow = (afterPosition: number) => {
    const itemId = streamItems.find(item => item.position === afterPosition)?.id || 
                  (streamItems.find(item => item.cardId) as any)?.cardId || 
                  `position-${afterPosition}`;
    setActiveCardIdForUpload(itemId);
  };

  const handleFileUploaded = async (uploadedFile: any) => {
    try {
      // Close upload interface
      setActiveCardIdForUpload(null);
      
      // Reload stream to show new file
      await loadStream();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to add uploaded file';
      setGlobalError(errorMessage);
    }
  };

  const handleCancelUpload = () => {
    setActiveCardIdForUpload(null);
  };

  // Add existing file handlers
  const handleAddFileBelow = (afterPosition: number) => {
    const itemId = streamItems.find(item => item.position === afterPosition)?.id || 
                  (streamItems.find(item => item.cardId) as any)?.cardId || 
                  `position-${afterPosition}`;
    setActiveCardIdForFileAdd(itemId);
  };

  const handleAddExistingFile = async (file: any, insertAfterPosition: number | null) => {
    try {
      // Save scroll position before operation
      const scrollPosition = window.scrollY;
      
      const requestBody: any = {
        fileId: file.id,
        isCollapsed: false,
        depth: 0
      };
      
      // Only add position if it's not null (null means add at end)
      if (insertAfterPosition !== null) {
        requestBody.position = insertAfterPosition;
      }

      await api.post(`/streams/${streamId}/files`, requestBody);

      setActiveCardIdForFileAdd(null);
      await loadStream();
      
      // Restore scroll position after reload
      setTimeout(() => {
        window.scrollTo(0, scrollPosition);
      }, 50);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to add file to stream';
      setGlobalError(errorMessage);
    }
  };

  const handleCancelFileAdd = () => {
    setActiveCardIdForFileAdd(null);
  };

  // File handling functions
  const handleDeleteFile = async (fileId: string) => {
    try {
      await api.delete(`/streams/${streamId}/files/${fileId}`);
      await loadStream(); // Reload to reflect changes
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to remove file';
      setGlobalError(errorMessage);
    }
  };

  const handleMoveFileUp = async (fileId: string) => {
    try {
      // Find current file position
      const fileIndex = streamItems.findIndex(item => item.id === fileId && item.itemType === 'file');
      if (fileIndex <= 0) return; // Already at top

      const newPosition = fileIndex - 1;
      await api.put(`/streams/${streamId}/files/${fileId}`, { position: newPosition });
      await loadStream(); // Reload to reflect changes
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to move file';
      setGlobalError(errorMessage);
    }
  };

  const handleMoveFileDown = async (fileId: string) => {
    try {
      // Find current file position
      const fileIndex = streamItems.findIndex(item => item.id === fileId && item.itemType === 'file');
      if (fileIndex >= streamItems.length - 1) return; // Already at bottom

      const newPosition = fileIndex + 1;
      await api.put(`/streams/${streamId}/files/${fileId}`, { position: newPosition });
      await loadStream(); // Reload to reflect changes
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to move file';
      setGlobalError(errorMessage);
    }
  };


  const handleCreateCardForEmptyStream = async () => {
    try {
      // Create empty unsaved card immediately at position 0
      const response = await api.post('/cards/create-empty', {
        brainId: brainId,
        streamId: streamId,
        position: 0
      });

      // Close any interfaces
      setActiveCardIdForAdd(null);
      
      // Save scroll position before reload
      const scrollPosition = window.scrollY;
      
      // Reload stream to show new card
      await loadStream();
      
      // Restore scroll position and auto-focus the new card for editing
      setTimeout(() => {
        // Restore scroll position
        window.scrollTo(0, scrollPosition);
        
        const newCardElement = document.querySelector(`[data-card-id="${response.data.card.id}"]`);
        if (newCardElement) {
          // Trigger edit mode by clicking the title (which opens edit)
          const titleElement = newCardElement.querySelector('.card-title');
          if (titleElement) {
            (titleElement as HTMLElement).click();
          }
        }
      }, 100);
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to create card';
      setGlobalError(errorMessage);
    }
  };

  if (isLoading) {
    return (
      <div className="stream-view">
        <div className="text-center" style={{ padding: '2rem' }}>
          <span className="loading-spinner" style={{ width: '24px', height: '24px' }} />
          <p style={{ marginTop: '1rem' }}>Loading stream...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stream-view">
        <div className="error-message">
          {error}
        </div>
        <button 
          onClick={loadStream} 
          className="btn btn-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="stream-view">
        <div className="error-message">
          Stream not found
        </div>
      </div>
    );
  }


  const handleRefreshStream = async () => {
    await loadStream();
  };

  return (
    <div className="stream-view">
      {/* Stream header with refresh button */}
      <div className="stream-header" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem',
        padding: '0.5rem 0',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div style={{ color: '#6b7280', fontSize: '14px' }}>
          {streamItems.length} item{streamItems.length !== 1 ? 's' : ''} in stream
        </div>
        <button
          onClick={handleRefreshStream}
          className="btn btn-small"
          disabled={isLoading}
          title="Refresh stream to see latest changes"
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
        >
          {isLoading ? (
            <>
              <span className="loading-spinner" style={{ width: '12px', height: '12px' }} />
              Loading...
            </>
          ) : (
            <>
              🔄 Refresh
            </>
          )}
        </button>
      </div>

      {/* Stream items (both cards and files) */}
      {streamItems.map((item, index) => {
        const itemId = item.id || '';
        
        if (item.itemType === 'file') {
          // Render file viewer
          return (
            <FileViewer
              key={`file-${itemId}`}
              file={item}
              streamId={streamId}
              brainId={brainId}
              onDelete={(fileId) => handleDeleteFile(fileId)}
              onMoveUp={(fileId) => handleMoveFileUp(fileId)}
              onMoveDown={(fileId) => handleMoveFileDown(fileId)}
              isFirst={index === 0}
              isLast={index === streamItems.length - 1}
              onAddCardBelow={handleAddCardBelow}
              onCreateCardBelow={handleCreateCardBelow}
              onGenerateCardBelow={handleGenerateCardBelow}
              onUploadFileBelow={handleUploadFileBelow}
              onAddFileBelow={handleAddFileBelow}
            />
          );
        } else if (item.itemType === 'card') {
          // Render card
          return (
            <Card
              key={`card-${itemId}`}
              card={item as any}
              streamCard={item as any}  
              streamId={streamId}
              brainId={brainId}
              onUpdate={handleUpdateCard}
              onDelete={handleDeleteCard}
              onDeleteFromBrain={handleDeleteCardFromBrain}
              onToggleCollapse={handleToggleCollapse}
              onAddCardBelow={handleAddCardBelow}
              onCreateCardBelow={handleCreateCardBelow}
              onGenerateCardBelow={handleGenerateCardBelow}
              onUploadFileBelow={handleUploadFileBelow}
              isGenerating={generatingCardId === itemId}
              onStopGeneration={handleStopGeneration}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              isFirst={index === 0}
              isLast={index === streamItems.length - 1}
              showAddInterface={activeCardIdForAdd === itemId}
              onAddCard={handleInlineAddCard}
              onCancelAdd={handleCancelAdd}
              showUploadInterface={activeCardIdForUpload === itemId}
              onFileUploaded={handleFileUploaded}
              onCancelUpload={handleCancelUpload}
              onAddFileBelow={handleAddFileBelow}
              showFileAddInterface={activeCardIdForFileAdd === itemId}
              onAddFile={handleAddExistingFile}
              onCancelFileAdd={handleCancelFileAdd}
            />
          );
        }
        
        return null;
      })}


      {streamItems.length === 0 && (
        <div className="text-center" style={{ padding: '2rem', color: '#6b7280' }}>
          <p>This stream is empty.</p>
          <div className="flex gap-md justify-center" style={{ marginTop: '1rem' }}>
            <button
              onClick={() => setActiveCardIdForAdd('empty-stream')}
              className="btn btn-primary btn-small"
              title="Add an existing card from this brain"
            >
              📎 Add Card
            </button>
            <button
              onClick={handleCreateCardForEmptyStream}
              className="btn btn-secondary btn-small"
              title="Create a new card in this brain"
            >
              ✨ Create Card
            </button>
            <button
              onClick={() => setActiveCardIdForUpload('empty-stream')}
              className="btn btn-small"
              title="Upload PDF or EPUB file"
              style={{ 
                backgroundColor: '#16a34a',
                color: 'white'
              }}
            >
              📁 Upload File
            </button>
            <button
              onClick={() => setActiveCardIdForFileAdd('empty-stream')}
              className="btn btn-small"
              title="Add existing file from this brain"
              style={{ 
                backgroundColor: '#8b5cf6',
                color: 'white'
              }}
            >
              📚 Add File
            </button>
          </div>
        </div>
      )}
      
      {/* Empty stream interfaces */}
      {streamItems.length === 0 && activeCardIdForAdd === 'empty-stream' && (
        <CardSearchInterface
          brainId={brainId}
          streamId={streamId}
          streamCards={[]}
          onCardSelected={(card) => handleInlineAddCard(card.id, null)}
          onCancel={handleCancelAdd}
        />
      )}
      
      {/* Empty stream file upload interface */}
      {streamItems.length === 0 && activeCardIdForUpload === 'empty-stream' && (
        <FileUploadInterface
          brainId={brainId}
          streamId={streamId}
          position={0}
          onFileUploaded={handleFileUploaded}
          onCancel={handleCancelUpload}
        />
      )}
      
      {/* Empty stream file add interface */}
      {streamItems.length === 0 && activeCardIdForFileAdd === 'empty-stream' && (
        <FileSearchInterface
          brainId={brainId}
          streamId={streamId}
          onFileSelected={(file) => handleAddExistingFile(file, null)}
          onCancel={handleCancelFileAdd}
        />
      )}
      
    </div>
  );
};

export default StreamView;