import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Library, Workspace, AppState } from '../types';

interface AppContextType extends AppState {
  setLibrary: (library: Library | null) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  toggleAIContext: (pageId: string) => void;
  clearAIContext: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

type AppAction =
  | { type: 'SET_LIBRARY'; payload: Library | null }
  | { type: 'SET_WORKSPACE'; payload: Workspace | null }
  | { type: 'TOGGLE_AI_CONTEXT'; payload: string }
  | { type: 'CLEAR_AI_CONTEXT' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: AppState = {
  selectedLibrary: null,
  currentWorkspace: null,
  aiContextPages: [],
  isLoading: false,
  error: null,
};

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_LIBRARY':
      return {
        ...state,
        selectedLibrary: action.payload,
        currentWorkspace: null, // Clear workspace when changing libraries
      };
    case 'SET_WORKSPACE':
      return {
        ...state,
        currentWorkspace: action.payload,
      };
    case 'TOGGLE_AI_CONTEXT':
      const pageId = action.payload;
      const isInContext = state.aiContextPages.includes(pageId);
      return {
        ...state,
        aiContextPages: isInContext
          ? state.aiContextPages.filter((id: string) => id !== pageId)
          : [...state.aiContextPages, pageId],
      };
    case 'CLEAR_AI_CONTEXT':
      return {
        ...state,
        aiContextPages: [],
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };
    default:
      return state;
  }
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const setLibrary = (library: Library | null) => {
    dispatch({ type: 'SET_LIBRARY', payload: library });
  };

  const setWorkspace = (workspace: Workspace | null) => {
    dispatch({ type: 'SET_WORKSPACE', payload: workspace });
  };

  const toggleAIContext = (pageId: string) => {
    dispatch({ type: 'TOGGLE_AI_CONTEXT', payload: pageId });
  };

  const clearAIContext = () => {
    dispatch({ type: 'CLEAR_AI_CONTEXT' });
  };

  const setLoading = (loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  };

  const setError = (error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  };

  const value: AppContextType = {
    ...state,
    setLibrary,
    setWorkspace,
    toggleAIContext,
    clearAIContext,
    setLoading,
    setError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};