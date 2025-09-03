import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Library, Workspace, AppState } from '../types';

interface AppContextType extends AppState {
  setLibrary: (library: Library | null) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  toggleAIContext: (cardId: string) => void;
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
  | { type: 'SET_BRAIN'; payload: Library | null }
  | { type: 'SET_WORKSPACE'; payload: Workspace | null }
  | { type: 'TOGGLE_AI_CONTEXT'; payload: string }
  | { type: 'CLEAR_AI_CONTEXT' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: AppState = {
  selectedLibrary: null,
  currentWorkspace: null,
  aiContextCards: [],
  isLoading: false,
  error: null,
};

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_BRAIN':
      return {
        ...state,
        selectedLibrary: action.payload,
        currentWorkspace: null, // Clear workspace when changing librarys
      };
    case 'SET_WORKSPACE':
      return {
        ...state,
        currentWorkspace: action.payload,
      };
    case 'TOGGLE_AI_CONTEXT':
      const cardId = action.payload;
      const isInContext = state.aiContextCards.includes(cardId);
      return {
        ...state,
        aiContextCards: isInContext
          ? state.aiContextCards.filter(id => id !== cardId)
          : [...state.aiContextCards, cardId],
      };
    case 'CLEAR_AI_CONTEXT':
      return {
        ...state,
        aiContextCards: [],
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
    dispatch({ type: 'SET_BRAIN', payload: library });
  };

  const setWorkspace = (workspace: Workspace | null) => {
    dispatch({ type: 'SET_WORKSPACE', payload: workspace });
  };

  const toggleAIContext = (cardId: string) => {
    dispatch({ type: 'TOGGLE_AI_CONTEXT', payload: cardId });
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