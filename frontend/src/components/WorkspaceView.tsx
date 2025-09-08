import React, { useState, useEffect } from 'react';
import Page from './Page';
import FileViewer from './FileViewer';
import FormCard from './FormCard';
import CardSearchInterface from './PageSearchInterface';
import FileUploadInterface from './FileUploadInterface';
import FileSearchInterface from './FileSearchInterface';
import CommandLineInterface from './CommandLineInterface';
import { Workspace, WorkspaceCard, Card as CardType } from '../types';
import api from '../services/api';
import { useApp } from '../contexts/AppContext';
import config from '../config.js';

interface WorkspaceItem {
  itemType: 'card' | 'file' | 'form';
  position: number;
  id: string;
  [key: string]: any;
}

interface WorkspaceViewProps {
  workspaceId: string;
  libraryId: string;
}

const WorkspaceView: React.FC<WorkspaceViewProps> = ({ workspaceId, libraryId }) => {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceItem[]>([]); // Mixed cards and files
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCardIdForAdd, setActiveCardIdForAdd] = useState<string | null>(null);
  const [generatingCardId, setGeneratingCardId] = useState<string | null>(null);
  const [generationController, setGenerationController] = useState<AbortController | null>(null);
  const [activeCardIdForUpload, setActiveCardIdForUpload] = useState<string | null>(null);
  const [activeCardIdForFileAdd, setActiveCardIdForFileAdd] = useState<string | null>(null);
  const [showCommandUpload, setShowCommandUpload] = useState(false);
  const [showCommandAddPage, setShowCommandAddPage] = useState(false);
  const [showCommandGenerate, setShowCommandGenerate] = useState(false);
  const [showCommandAddFile, setShowCommandAddFile] = useState(false);
  const { setError: setGlobalError, aiContextPages, syncAIContextFromWorkspace } = useApp();

  // Calculate approximate token count for AI context
  const calculateTokenCount = (text: string): number => {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  };

  const getAIContextInfo = () => {
    const contextPages = aiContextPages || [];
    const totalPages = contextPages.length;
    
    let totalTokens = 0;
    contextPages.forEach((pageId: string) => {
      // Find the actual page data from workspace items
      const page = workspaceItems.find(item => item.id === pageId || item.pageId === pageId);
      if (page) {
        const content = (page as any).content || (page as any).contentPreview || '';
        const title = (page as any).title || '';
        totalTokens += calculateTokenCount(title + ' ' + content);
      }
    });

    return { totalPages, totalTokens };
  };

  // Command handlers for CommandLineInterface
  const handleCommandUpload = () => {
    setShowCommandUpload(true);
  };

  const handleCommandNewPage = async () => {
    // Prevent double execution
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      
      // Calculate position for new page
      const nextPosition = workspaceItems.length;
      
      // Create empty unsaved page immediately
      const response = await api.post('/pages/create-empty', {
        libraryId: libraryId,
        workspaceId: workspaceId,
        position: nextPosition
      });

      console.log('Page creation response:', response.data);
      console.log('Response status:', response.status);
      console.log('Has page:', !!response.data.page);
      console.log('Has success:', !!response.data.success);

      if (response.data.page) {
        // Save scroll position before reload
        const scrollPosition = window.scrollY;
        
        // Force reload workspace to show new page
        console.log('Reloading workspace...');
        await loadWorkspace();
        console.log('Workspace reloaded successfully');
        
        // Restore scroll position and auto-focus the new page for editing
        setTimeout(() => {
          // Restore scroll position
          window.scrollTo(0, scrollPosition);
          
          const newPageElement = document.querySelector(`[data-card-id="${response.data.page.id}"]`);
          console.log('Looking for new page element:', response.data.page.id, newPageElement);
          if (newPageElement) {
            // First expand the page by clicking the expand button
            const expandButton = newPageElement.querySelector('button[title="Expand"]');
            if (expandButton) {
              (expandButton as HTMLElement).click();
            }
            
            // Then trigger content editing by clicking the edit button
            setTimeout(() => {
              const editButton = newPageElement.querySelector('button[title="Edit card"]');
              if (editButton) {
                (editButton as HTMLElement).click();
              }
            }, 100);
          }
        }, 200);
      }
    } catch (error) {
      console.error('Failed to create new page:', error);
      setGlobalError('Failed to create new page');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommandGenerate = () => {
    setShowCommandGenerate(true);
  };

  const handleCommandAddPage = () => {
    setShowCommandAddPage(true);
  };

  const handleCommandAddFile = () => {
    setShowCommandAddFile(true);
  };

  const handleCommandAddForm = async () => {
    try {
      // Calculate position for new form
      const nextPosition = workspaceItems.length;
      
      // Create new form and add to workspace in one call
      const response = await api.post(`/workspaces/${workspaceId}/forms/create`, {
        content: '',
        formData: {},
        position: nextPosition,
        isInAIContext: false,
        isCollapsed: false
      });

      console.log('Form creation response:', response.data);

      // Save scroll position before reload
      const scrollPosition = window.scrollY;
      
      // Reload workspace to show new form
      await loadWorkspace();
      
      // Restore scroll position
      setTimeout(() => {
        window.scrollTo(0, scrollPosition);
      }, 100);
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to create form';
      setGlobalError(errorMessage);
      console.error('Form creation error:', err);
    }
  };

  // Add missing functions for command interface
  const handleAddCardToWorkspace = async (cardId: string, position: number) => {
    try {
      console.log('Adding page to workspace:', cardId, 'at position:', position);
      const response = await api.post(`/workspaces/${workspaceId}/pages`, {
        pageId: cardId,
        position: position
      });
      
      console.log('Add page response:', response.data);
      
      if (response.data.success || response.status === 200 || response.status === 201) {
        // Save scroll position before reload
        const scrollPosition = window.scrollY;
        
        // Force reload workspace to show added page
        console.log('Reloading workspace after adding page...');
        await loadWorkspace();
        console.log('Workspace reloaded successfully');
        
        // Restore scroll position
        setTimeout(() => {
          window.scrollTo(0, scrollPosition);
        }, 100);
      }
    } catch (error: any) {
      console.error('Failed to add card to workspace:', error);
      
      // Handle duplicate page error specifically
      if (error.response?.data?.message?.includes('already exists')) {
        setGlobalError('This page is already in this workspace');
      } else {
        setGlobalError('Failed to add page to workspace');
      }
    }
  };

  const handleAddFileToWorkspace = async (file: any, position: number) => {
    try {
      const response = await api.post(`/workspaces/${workspaceId}/files`, {
        fileId: file.id,
        position: position
      });
      
      if (response.data.success) {
        await loadWorkspace();
      }
    } catch (error) {
      console.error('Failed to add file to workspace:', error);
      setGlobalError('Failed to add file to workspace');
    }
  };

  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      if (mounted) {
        await loadWorkspace();
      }
    };
    
    loadData();
    
    return () => {
      mounted = false;
    };
  }, [workspaceId]);

  const loadWorkspace = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Loading workspace:', workspaceId);
      // Load workspace data with pages
      const workspaceResponse = await api.get(`/workspaces/${workspaceId}`);
      console.log('Workspace response:', workspaceResponse.data);
      setWorkspace(workspaceResponse.data.workspace);

      // Load workspace items (mixed cards, files, and forms) - use the workspace data that includes all item types
      if (workspaceResponse.data.workspace) {
        const workspace = workspaceResponse.data.workspace;
        const pages = workspace.pages || [];
        const files = workspace.files || [];
        const forms = workspace.forms || [];
        
        // Combine pages, files, and forms, then sort by position
        const allItems = [...pages, ...files, ...forms].sort((a, b) => a.position - b.position);
        
        console.log('Using workspace pages:', pages.length);
        console.log('Using workspace files:', files.length);
        console.log('Using workspace forms:', forms.length);
        console.log('Total workspace items:', allItems.length);
        
        setWorkspaceItems(allItems);
        
        // Sync AI context state with backend data
        syncAIContextFromWorkspace(allItems);
        
        // Check for form-generated page to auto-stream
        const formGeneratedPageId = (window as any).formGeneratedPageId;
        if (formGeneratedPageId) {
          delete (window as any).formGeneratedPageId;
          
          // Find the generated page and trigger streaming
          const generatedPage = allItems.find(item => item.id === formGeneratedPageId);
          if (generatedPage) {
            setTimeout(() => {
              // Trigger AI streaming by connecting to the streaming endpoint
              const eventSourceUrl = `${config.apiUrl}/ai/stream/${formGeneratedPageId}`;
              const eventSource = new EventSource(eventSourceUrl, { withCredentials: true });
              
              eventSource.onmessage = (event) => {
                try {
                  const data = JSON.parse(event.data);
                  if (data.type === 'chunk') {
                    // Update the page content in real-time
                    setWorkspaceItems(prev => prev.map(item => {
                      if (item.id === formGeneratedPageId) {
                        return { ...item, content: data.totalContent, contentPreview: data.totalContent };
                      }
                      return item;
                    }));
                  } else if (data.type === 'complete') {
                    eventSource.close();
                  } else if (data.type === 'error') {
                    eventSource.close();
                  }
                } catch (error) {
                  console.error('Error parsing AI streaming data:', error);
                }
              };
              
              eventSource.onerror = () => {
                eventSource.close();
              };
            }, 500);
          }
        }
      } else {
        // Fallback: try to load items separately if not included in workspace response
        console.log('Fallback: loading cards separately');
        const itemsResponse = await api.get(`/workspaces/${workspaceId}/cards`);
        console.log('Cards response:', itemsResponse.data);
        setWorkspaceItems(itemsResponse.data.cards || []);
      }
    } catch (err: any) {
      console.error('Error loading workspace:', err);
      const errorMessage = err.response?.data?.message || 'Failed to load workspace';
      setError(errorMessage);
      setGlobalError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCard = async (cardId: string, updates: Partial<CardType>) => {
    try {
      // Store original state for potential revert
      const originalWorkspaceItems = [...workspaceItems];
      
      // Optimistically update the UI immediately
      const newWorkspaceItems = workspaceItems.map(item => {
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
      setWorkspaceItems(newWorkspaceItems);
      
      // Update server in background
      try {
        await api.put(`/pages/${cardId}`, updates);
        // Server updated successfully, optimistic update was correct
        
        // Sync AI context state after successful update
        syncAIContextFromWorkspace(newWorkspaceItems);
      } catch (serverError) {
        // Revert optimistic update on server error
        setWorkspaceItems(originalWorkspaceItems);
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
      const originalWorkspaceItems = workspaceItems;
      const newWorkspaceItems = workspaceItems.filter(item => 
        !(item.itemType === 'card' && (item.cardId || item.id) === cardId)
      );
      setWorkspaceItems(newWorkspaceItems);
      
      // Update server in background
      try {
        await api.delete(`/workspaces/${workspaceId}/pages/${cardId}`);
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setWorkspaceItems(originalWorkspaceItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to remove card from workspace';
      setGlobalError(errorMessage);
    }
  };

  const handleDeleteCardFromBrain = async (cardId: string) => {
    try {
      // Optimistically remove card from UI immediately
      const originalWorkspaceItems = workspaceItems;
      const newWorkspaceItems = workspaceItems.filter(item => 
        !(item.itemType === 'card' && (item.cardId || item.id) === cardId)
      );
      setWorkspaceItems(newWorkspaceItems);
      
      // Update server in background - use hard delete to completely remove from library
      try {
        await api.delete(`/pages/${cardId}?hard=true`);
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setWorkspaceItems(originalWorkspaceItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to delete card from library';
      setGlobalError(errorMessage);
    }
  };

  const handleToggleCollapse = async (workspaceCardId: string) => {
    try {
      const workspaceItem = workspaceItems.find(item => item.itemType === 'card' && item.id === workspaceCardId);
      if (!workspaceItem) return;

      // Optimistically update the UI immediately
      const originalWorkspaceItems = workspaceItems;
      const newWorkspaceItems = workspaceItems.map(item => {
        if (item.itemType === 'card' && item.id === workspaceCardId) {
          return { ...item, isCollapsed: !item.isCollapsed };
        }
        return item;
      });
      setWorkspaceItems(newWorkspaceItems);

      // Update server in background
      try {
        await api.put(`/workspaces/${workspaceId}/pages/${workspaceCardId}`, {
          isCollapsed: !workspaceItem.isCollapsed
        });
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setWorkspaceItems(originalWorkspaceItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to toggle card collapse';
      setGlobalError(errorMessage);
    }
  };


  // Position management functions
  const handleAddCardBelow = (afterPosition: number) => {
    const itemAtPosition = workspaceItems.find(item => item.position === afterPosition);
    if (itemAtPosition) {
      setActiveCardIdForAdd(itemAtPosition.cardId || itemAtPosition.id || '');
    }
  };

  const handleCreateCardBelow = async (afterPosition: number) => {
    try {
      // Calculate position for new card
      const nextPosition = afterPosition + 1;
      
      // Create empty unsaved card immediately
      const response = await api.post('/pages/create-empty', {
        libraryId: libraryId,
        workspaceId: workspaceId,
        position: nextPosition
      });

      // Close any interfaces
      setActiveCardIdForAdd(null);
      
      // Save scroll position before reload
      const scrollPosition = window.scrollY;
      
      // Reload workspace to show new card
      await loadWorkspace();
      
      // Restore scroll position and auto-focus the new card for editing
      setTimeout(() => {
        // Restore scroll position
        window.scrollTo(0, scrollPosition);
        
        const newCardElement = document.querySelector(`[data-card-id="${response.data.page.id}"]`);
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
      const currentIndex = workspaceItems.findIndex(item => 
        item.itemType === 'card' && (item.cardId || item.id) === cardId
      );
      if (currentIndex <= 0) return; // Already at top

      const currentItem = workspaceItems[currentIndex];
      const targetItem = workspaceItems[currentIndex - 1];

      // Store original state for potential revert
      const originalWorkspaceItems = [...workspaceItems];

      // Optimistically update the UI immediately
      const newWorkspaceItems = [...workspaceItems];
      newWorkspaceItems[currentIndex] = targetItem;
      newWorkspaceItems[currentIndex - 1] = currentItem;
      setWorkspaceItems(newWorkspaceItems);

      // Update server in background
      try {
        await api.put(`/workspaces/${workspaceId}/pages/${cardId}`, {
          position: targetItem.position
        });
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setWorkspaceItems(originalWorkspaceItems);
        throw serverError;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to move card';
      setGlobalError(errorMessage);
    }
  };

  const handleMoveDown = async (cardId: string) => {
    try {
      const currentIndex = workspaceItems.findIndex(item => 
        item.itemType === 'card' && (item.cardId || item.id) === cardId
      );
      if (currentIndex >= workspaceItems.length - 1) return; // Already at bottom

      const currentItem = workspaceItems[currentIndex];
      const targetItem = workspaceItems[currentIndex + 1];

      // Store original state for potential revert
      const originalWorkspaceItems = [...workspaceItems];

      // Optimistically update the UI immediately
      const newWorkspaceItems = [...workspaceItems];
      newWorkspaceItems[currentIndex] = targetItem;
      newWorkspaceItems[currentIndex + 1] = currentItem;
      setWorkspaceItems(newWorkspaceItems);

      // Update server in background
      try {
        await api.put(`/workspaces/${workspaceId}/pages/${cardId}`, {
          position: targetItem.position
        });
        // Server updated successfully, optimistic update was correct
      } catch (serverError) {
        // Revert optimistic update on server error
        setWorkspaceItems(originalWorkspaceItems);
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
        pageId: cardId,
        isInAIContext: false,
        isCollapsed: false
      };
      
      // Only add position if it's not null (null means add at end)
      if (insertAfterPosition !== null) {
        requestBody.position = insertAfterPosition;
      }

      await api.post(`/workspaces/${workspaceId}/pages`, requestBody);

      setActiveCardIdForAdd(null);
      await loadWorkspace();
      
      // Restore scroll position after reload
      setTimeout(() => {
        window.scrollTo(0, scrollPosition);
      }, 50);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to add card to workspace';
      setGlobalError(errorMessage);
    }
  };


  const handleCancelAdd = () => {
    setActiveCardIdForAdd(null);
  };

  const handleGenerateFormBelow = async (afterPosition: number, prompt: string, model: string) => {
    try {
      // Add DSL instructions to the prompt for form generation
      const dslInstructions = `\n\nIMPORTANT: Respond ONLY with valid YAML form DSL. Use this format:

form:
  title: "Your Form Title"
  blocks:
    - block_type: "text"
      id: "intro"
      content: "Introduction text"
    - block_type: "textbox"
      id: "field1"
      label: "Field Label:"
      required: true
      style: "single"
      placeholder: "Enter value"
    - block_type: "button"
      id: "submit"
      text: "Submit"
      action_type: "workspace_operation"
      workspace_operation:
        type: "create_card"
        title: "Result: {{field1.value}}"
        content: "Generated content"

Do not include any explanation or markdown formatting, just the YAML.`;

      const fullPrompt = prompt + dslInstructions;

      // Generate form DSL using AI
      const response = await api.post('/ai/generate-form', {
        libraryId: libraryId,
        workspaceId: workspaceId,
        prompt: fullPrompt,
        model: model,
        position: afterPosition
      });

      console.log('✅ Form generated successfully');
      
      // Reload workspace to show new form
      await loadWorkspace();
      
    } catch (error: any) {
      console.error('❌ Form generation error:', error);
      const errorMessage = error.response?.data?.error || 'Failed to generate form';
      setGlobalError(errorMessage);
    }
  };

  const handleGenerateCardBelow = async (afterPosition: number, prompt: string, model: string) => {
    try {
      // Create empty unsaved card for workspaceing content
      // Insert after the triggering card position
      const response = await api.post('/pages/create-empty', {
        libraryId: libraryId,
        workspaceId: workspaceId,
        insertAfterPosition: afterPosition
      });

      const newCardId = response.data.page.id;
      setGeneratingCardId(newCardId);

      // Reload workspace to show new card
      await loadWorkspace();

      // Start real AI generation with workspaceing
      const controller = new AbortController();
      setGenerationController(controller);

      // Start AI generation using Server-Sent Events
      try {
        // First, initiate the generation via POST
        const initResponse = await api.post('/ai/generate-streaming', {
          brainId: libraryId,
          streamId: workspaceId,
          pageId: newCardId,
          prompt,
          model,
          contextPageIds: aiContextPages
        });


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
                setWorkspaceItems(prev => prev.map(item => {
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
            console.error('Error parsing AI workspace data:', error);
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

This content is being generated word by word to demonstrate the workspaceing functionality. Each word appears gradually to show how the system will work when connected to real AI models.

The system supports:
- Multiple AI model selection (${model})
- Real-time content workspaceing
- Ability to stop generation midway
- Automatic card creation in expanded form
- Context-aware responses based on selected cards

Note: Real AI integration requires proper nginx configuration to forward /api/ai/ requests to the backend server.`;

          // Workspace the content word by word (simulation)
          const words = aiResponse.split(' ');
          let currentContent = '';
          
          for (let i = 0; i < words.length; i++) {
            if (controller.signal.aborted) {
              break;
            }
            
            currentContent += (i > 0 ? ' ' : '') + words[i];
            
            // Update the card content
            await api.put(`/pages/${newCardId}`, { content: currentContent });
            
            // Update local state to reflect changes
            setWorkspaceItems(prev => prev.map(item => {
              if (item.itemType === 'card' && (item.id === newCardId || (item as any).cardId === newCardId)) {
                return { ...item, content: currentContent, contentPreview: currentContent };
              }
              return item;
            }));
            
            // Wait a bit to simulate workspaceing
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
    const itemId = workspaceItems.find(item => item.position === afterPosition)?.id || 
                  (workspaceItems.find(item => item.cardId) as any)?.cardId || 
                  `position-${afterPosition}`;
    setActiveCardIdForUpload(itemId);
  };

  const handleFileUploaded = async (uploadedFile: any) => {
    try {
      // Close upload interface
      setActiveCardIdForUpload(null);
      
      // Reload workspace to show new file
      await loadWorkspace();
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
    const itemId = workspaceItems.find(item => item.position === afterPosition)?.id || 
                  (workspaceItems.find(item => item.cardId) as any)?.cardId || 
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

      await api.post(`/workspaces/${workspaceId}/files`, requestBody);

      setActiveCardIdForFileAdd(null);
      await loadWorkspace();
      
      // Restore scroll position after reload
      setTimeout(() => {
        window.scrollTo(0, scrollPosition);
      }, 50);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to add file to workspace';
      setGlobalError(errorMessage);
    }
  };

  const handleCancelFileAdd = () => {
    setActiveCardIdForFileAdd(null);
  };

  // Form handling functions
  const handleRemoveForm = async (formId: string) => {
    try {
      // Optimistically remove from UI immediately
      const updatedItems = workspaceItems.filter(item => 
        !(item.itemType === 'form' && item.id === formId)
      );
      setWorkspaceItems(updatedItems);
      
      // Update server in background
      await api.delete(`/workspaces/${workspaceId}/forms/${formId}`);
    } catch (err: any) {
      // If server request fails, reload workspace to get correct state
      const errorMessage = err.response?.data?.message || 'Failed to remove form';
      setGlobalError(errorMessage);
      await loadWorkspace();
    }
  };

  const handleToggleFormAI = async (formId: string) => {
    try {
      // Find the form and toggle its AI context state optimistically
      const updatedItems = workspaceItems.map(item => {
        if (item.itemType === 'form' && item.id === formId) {
          return { ...item, isInAIContext: !item.isInAIContext };
        }
        return item;
      });
      setWorkspaceItems(updatedItems);
      
      // Update server in background
      await api.put(`/workspaces/${workspaceId}/forms/${formId}/ai-context`);
    } catch (err: any) {
      // If server request fails, reload workspace to get correct state
      const errorMessage = err.response?.data?.message || 'Failed to toggle AI context';
      setGlobalError(errorMessage);
      await loadWorkspace();
    }
  };

  const handleToggleFormCollapse = async (formId: string) => {
    try {
      // Find the form and toggle its collapse state optimistically
      const updatedItems = workspaceItems.map(item => {
        if (item.itemType === 'form' && item.id === formId) {
          return { ...item, isCollapsed: !item.isCollapsed };
        }
        return item;
      });
      setWorkspaceItems(updatedItems);
      
      // Update server in background
      await api.put(`/workspaces/${workspaceId}/forms/${formId}/collapsed`);
    } catch (err: any) {
      // If server request fails, reload workspace to get correct state
      const errorMessage = err.response?.data?.message || 'Failed to toggle collapse';
      setGlobalError(errorMessage);
      await loadWorkspace();
    }
  };

  // File handling functions
  const handleDeleteFile = async (fileId: string) => {
    try {
      await api.delete(`/workspaces/${workspaceId}/files/${fileId}`);
      await loadWorkspace(); // Reload to reflect changes
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to remove file';
      setGlobalError(errorMessage);
    }
  };

  const handleMoveFileUp = async (fileId: string) => {
    try {
      // Find current file position
      const fileIndex = workspaceItems.findIndex(item => item.id === fileId && item.itemType === 'file');
      if (fileIndex <= 0) return; // Already at top

      const newPosition = fileIndex - 1;
      await api.put(`/workspaces/${workspaceId}/files/${fileId}`, { position: newPosition });
      await loadWorkspace(); // Reload to reflect changes
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to move file';
      setGlobalError(errorMessage);
    }
  };

  const handleMoveFileDown = async (fileId: string) => {
    try {
      // Find current file position
      const fileIndex = workspaceItems.findIndex(item => item.id === fileId && item.itemType === 'file');
      if (fileIndex >= workspaceItems.length - 1) return; // Already at bottom

      const newPosition = fileIndex + 1;
      await api.put(`/workspaces/${workspaceId}/files/${fileId}`, { position: newPosition });
      await loadWorkspace(); // Reload to reflect changes
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to move file';
      setGlobalError(errorMessage);
    }
  };


  const handleCreateCardForEmptyWorkspace = async () => {
    try {
      // Create empty unsaved card immediately at position 0
      const response = await api.post('/pages/create-empty', {
        libraryId: libraryId,
        workspaceId: workspaceId,
        position: 0
      });

      // Close any interfaces
      setActiveCardIdForAdd(null);
      
      // Save scroll position before reload
      const scrollPosition = window.scrollY;
      
      // Reload workspace to show new card
      await loadWorkspace();
      
      // Restore scroll position and auto-focus the new card for editing
      setTimeout(() => {
        // Restore scroll position
        window.scrollTo(0, scrollPosition);
        
        const newCardElement = document.querySelector(`[data-card-id="${response.data.page.id}"]`);
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
      <div className="workspace-view">
        <div className="text-center" style={{ padding: '2rem' }}>
          <span className="loading-spinner" style={{ width: '24px', height: '24px' }} />
          <p style={{ marginTop: '1rem' }}>Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="workspace-view">
        <div className="error-message">
          {error}
        </div>
        <button 
          onClick={loadWorkspace} 
          className="btn btn-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="workspace-view">
        <div className="error-message">
          Workspace not found
        </div>
      </div>
    );
  }


  const handleRefreshWorkspace = async () => {
    await loadWorkspace();
  };

  return (
    <div className="workspace-view">
      {/* Workspace header with refresh button */}
      <div className="workspace-header" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem',
        padding: '0.5rem 0',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div style={{ color: '#6b7280', fontSize: '14px' }}>
          {workspaceItems.length} item{workspaceItems.length !== 1 ? 's' : ''} in workspace
        </div>
        <button
          onClick={handleRefreshWorkspace}
          className="btn btn-small"
          disabled={isLoading}
          title="Refresh workspace to see latest changes"
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

      {/* Workspace items (both cards and files) */}
      {workspaceItems.map((item, index) => {
        const itemId = item.id || '';
        
        
        if (item.itemType === 'file') {
          // Render file viewer
          return (
            <FileViewer
              key={`file-${itemId}`}
              file={item as WorkspaceItem}
              streamId={workspaceId}
              libraryId={libraryId}
              onDelete={(fileId) => handleDeleteFile(fileId)}
              onMoveUp={(fileId) => handleMoveFileUp(fileId)}
              onMoveDown={(fileId) => handleMoveFileDown(fileId)}
              isFirst={index === 0}
              isLast={index === workspaceItems.length - 1}
              onAddCardBelow={handleAddCardBelow}
              onCreateCardBelow={handleCreateCardBelow}
              onGenerateCardBelow={handleGenerateCardBelow}
              onUploadFileBelow={handleUploadFileBelow}
              onAddFileBelow={handleAddFileBelow}
            />
          );
        } else if (item.itemType === 'form') {
          // Render form card
          return (
            <FormCard
              key={itemId}
              form={item}
              workspaceId={workspaceId}
              onRemove={handleRemoveForm}
              onToggleAI={handleToggleFormAI}
              onToggleCollapse={handleToggleFormCollapse}
              showAddInterface={false}
              onShowAddInterface={() => {}}
              onWorkspaceUpdate={loadWorkspace}
            />
          );
        } else if (item.itemType === 'card') {
          // Render card
          return (
            <Page
              key={`card-${itemId}-${item.position || index}`}
              page={item as any}
              workspacePage={item as any}  
              workspaceId={workspaceId}
              libraryId={libraryId}
              onUpdate={handleUpdateCard}
              onDelete={handleDeleteCard}
              onDeleteFromLibrary={handleDeleteCardFromBrain}
              onToggleCollapse={handleToggleCollapse}
              onAddPageBelow={handleAddCardBelow}
              onCreatePageBelow={handleCreateCardBelow}
              onGeneratePageBelow={handleGenerateCardBelow}
              onUploadFileBelow={handleUploadFileBelow}
              isGenerating={generatingCardId === itemId}
              onStopGeneration={handleStopGeneration}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              isFirst={index === 0}
              isLast={index === workspaceItems.length - 1}
              showAddInterface={activeCardIdForAdd === itemId}
              onAddPage={handleInlineAddCard}
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


      {workspaceItems.length === 0 && (
        <div className="text-center" style={{ padding: '2rem', color: '#6b7280' }}>
          <p>This workspace is empty.</p>
          <div className="flex gap-md justify-center" style={{ marginTop: '1rem' }}>
            <button
              onClick={() => {
                console.log('⚫ Black Add Page button clicked (empty workspace)!');
                console.log('Setting activeCardIdForAdd to: empty-workspace');
                setActiveCardIdForAdd('empty-workspace');
              }}
              className="btn btn-primary btn-small"
              title="Add an existing page from this library"
            >
              📎 Add Page
            </button>
            <button
              onClick={handleCreateCardForEmptyWorkspace}
              className="btn btn-secondary btn-small"
              title="Create a new page in this library"
            >
              ✨ Create Page
            </button>
            <button
              onClick={() => setActiveCardIdForUpload('empty-workspace')}
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
              onClick={() => setActiveCardIdForFileAdd('empty-workspace')}
              className="btn btn-small"
              title="Add existing file from this library"
              style={{ 
                backgroundColor: '#8b5cf6',
                color: 'white'
              }}
            >
              📚 Add File
            </button>
            <button
              onClick={() => setGeneratingCardId('empty-workspace-generate')}
              className="btn btn-small"
              title="Generate page with AI"
              style={{ 
                backgroundColor: '#f59e0b',
                color: 'white'
              }}
            >
              🤖 Generate
            </button>
          </div>
        </div>
      )}
      
      {/* Empty workspace interfaces */}
      {workspaceItems.length === 0 && activeCardIdForAdd === 'empty-workspace' && (
        <CardSearchInterface
          libraryId={libraryId}
          workspaceId={workspaceId}
          workspaceCards={[]}
          onCardSelected={(card) => handleInlineAddCard(card.id, null)}
          onCancel={handleCancelAdd}
        />
      )}
      
      {/* Empty workspace file upload interface */}
      {workspaceItems.length === 0 && activeCardIdForUpload === 'empty-workspace' && (
        <FileUploadInterface
          libraryId={libraryId}
          streamId={workspaceId}
          position={0}
          onFileUploaded={handleFileUploaded}
          onCancel={handleCancelUpload}
        />
      )}
      
      {/* Empty workspace file add interface */}
      {workspaceItems.length === 0 && activeCardIdForFileAdd === 'empty-workspace' && (
        <FileSearchInterface
          libraryId={libraryId}
          workspaceId={workspaceId}
          onFileSelected={(file) => handleAddExistingFile(file, null)}
          onCancel={handleCancelFileAdd}
        />
      )}

      {/* Empty workspace generate interface */}
      {workspaceItems.length === 0 && generatingCardId === 'empty-workspace-generate' && (
        <div className="generate-interface" style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', margin: '1rem 0' }}>
          <h3>Generate Page with AI</h3>
          <textarea
            placeholder="Describe what you want to generate..."
            style={{ width: '100%', minHeight: '100px', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                const prompt = (e.target as HTMLTextAreaElement).value;
                if (prompt.trim()) {
                  handleGenerateCardBelow(0, prompt, 'gpt-4');
                  setGeneratingCardId(null);
                }
              }
            }}
          />
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-primary btn-small"
              onClick={(e) => {
                const textarea = e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement;
                const prompt = textarea?.value;
                if (prompt?.trim()) {
                  handleGenerateCardBelow(0, prompt, 'gpt-4');
                  setGeneratingCardId(null);
                }
              }}
            >
              Generate
            </button>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setGeneratingCardId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Command-triggered interfaces */}
      {showCommandUpload && (
        <div style={{ marginBottom: '80px' }}>
          <FileUploadInterface
            libraryId={libraryId}
            streamId={workspaceId}
            position={workspaceItems.length}
            onFileUploaded={(filePage: any) => {
              setShowCommandUpload(false);
              loadWorkspace();
            }}
            onCancel={() => setShowCommandUpload(false)}
          />
        </div>
      )}
      
      {showCommandAddPage && (
        <div style={{ marginBottom: '80px' }}>
          <CardSearchInterface
            libraryId={libraryId}
            workspaceId={workspaceId}
            workspaceCards={workspaceItems.filter(item => item.itemType === 'card') as any}
            onCardSelected={(card) => {
              handleAddCardToWorkspace(card.id, workspaceItems.length);
              setShowCommandAddPage(false);
            }}
            onCancel={() => setShowCommandAddPage(false)}
          />
        </div>
      )}
      
      {showCommandAddFile && (
        <div style={{ marginBottom: '80px' }}>
          <FileSearchInterface
            libraryId={libraryId}
            workspaceId={workspaceId}
            onFileSelected={(file: any) => {
              handleAddFileToWorkspace(file, workspaceItems.length);
              setShowCommandAddFile(false);
            }}
            onCancel={() => setShowCommandAddFile(false)}
          />
        </div>
      )}
      
      {showCommandGenerate && (
        <div style={{ marginBottom: '80px', padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '8px', margin: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Generate Content with AI</h3>
            {(() => {
              const { totalPages, totalTokens } = getAIContextInfo();
              return (
                <div style={{ 
                  padding: '8px 12px', 
                  background: '#f3f4f6', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#6b7280'
                }}>
                  <strong>AI Context:</strong> {totalPages} pages • ~{totalTokens.toLocaleString()} tokens
                </div>
              );
            })()}
          </div>
          
          {/* Output Type Selection */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Output Type:</label>
            <select
              id="command-generate-output-type"
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-medium)',
                borderRadius: '6px',
                fontFamily: 'var(--font-family)',
                fontSize: '14px',
                background: 'var(--bg-card)',
                minWidth: '150px',
                marginRight: '12px'
              }}
              defaultValue="page"
              onChange={(e) => {
                const promptTextarea = document.getElementById('command-generate-prompt') as HTMLTextAreaElement;
                const outputType = e.target.value;
                if (outputType === 'form' && promptTextarea) {
                  // Update placeholder and add DSL guidance for forms
                  promptTextarea.placeholder = "Describe the form you want to create (e.g., 'Create a contact form with name, email, and message fields')...";
                } else if (promptTextarea) {
                  promptTextarea.placeholder = "Enter your prompt for AI generation...";
                }
              }}
            >
              <option value="page">Page</option>
              <option value="form">Form</option>
            </select>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              Choose whether to generate a page with content or an interactive form
            </span>
          </div>

          {/* Form DSL Instructions */}
          {(() => {
            const outputTypeSelect = document.getElementById('command-generate-output-type') as HTMLSelectElement;
            const isFormSelected = outputTypeSelect?.value === 'form';
            return isFormSelected ? (
              <div style={{
                marginBottom: '12px',
                padding: '12px',
                background: '#f8f9fa',
                border: '1px solid #e9ecef',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#495057'
              }}>
                <strong>Form Generation:</strong> Describe the form you want to create. The AI will generate it using YAML DSL format with text blocks, input fields, and action buttons. Examples:
                <ul style={{ margin: '8px 0', paddingLeft: '16px' }}>
                  <li>"Create a survey form with rating questions"</li>
                  <li>"Build a contact form with validation"</li>
                  <li>"Make a project planning form with multiple sections"</li>
                </ul>
              </div>
            ) : null;
          })()}
          
          <textarea
            placeholder="Enter your prompt for AI generation..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '12px',
              border: '1px solid var(--border-medium)',
              borderRadius: '6px',
              marginBottom: '12px',
              fontFamily: 'var(--font-family)',
              fontSize: '14px',
              resize: 'vertical'
            }}
            id="command-generate-prompt"
          />
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Model:</label>
            <select
              id="command-generate-model"
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-medium)',
                borderRadius: '6px',
                fontFamily: 'var(--font-family)',
                fontSize: '14px',
                background: 'var(--bg-card)',
                minWidth: '200px'
              }}
              defaultValue="claude-3-5-sonnet-20241022"
            >
              <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-primary"
              onClick={(e) => {
                const textarea = document.getElementById('command-generate-prompt') as HTMLTextAreaElement;
                const modelSelect = document.getElementById('command-generate-model') as HTMLSelectElement;
                const outputTypeSelect = document.getElementById('command-generate-output-type') as HTMLSelectElement;
                const prompt = textarea?.value;
                const model = modelSelect?.value || 'claude-3-5-sonnet-20241022';
                const outputType = outputTypeSelect?.value || 'page';
                
                if (prompt?.trim()) {
                  if (outputType === 'form') {
                    handleGenerateFormBelow(workspaceItems.length, prompt, model);
                  } else {
                    handleGenerateCardBelow(workspaceItems.length, prompt, model);
                  }
                  setShowCommandGenerate(false);
                }
              }}
            >
              Generate
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCommandGenerate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Command Line Interface - Fixed at bottom */}
      <CommandLineInterface
        onUploadFile={handleCommandUpload}
        onNewPage={handleCommandNewPage}
        onGenerate={handleCommandGenerate}
        onAddPage={handleCommandAddPage}
        onAddFile={handleCommandAddFile}
        onAddForm={handleCommandAddForm}
      />
    </div>
  );
};

export default WorkspaceView;