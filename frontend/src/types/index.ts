// User types
export interface User {
  id: string;
  username: string;
  email: string;
  folderPath: string;
  storageQuota: number;
  storageUsed: number;
  createdAt: string;
  updatedAt: string;
}

// Library types
export interface Library {
  id: string;
  userId: string;
  title: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
  storageUsed: number;
}

// Card types
export interface Card {
  id: string;
  libraryId: string;
  title: string | null;
  displayTitle: string; // Title or "Click to add title..." for unsaved cards
  contentPreview: string; // First 500 characters for quick display
  fileSize: number;
  hasFile: boolean;
  filePath?: string;
  lastModified?: string;
  createdAt: string;
  updatedAt: string;
  content?: string; // Full content (only included when specifically requested)
  // Card Type System fields (optional for backward compatibility)
  cardType?: 'saved' | 'file' | 'unsaved';
  isLibraryWide?: boolean;
  workspaceSpecificId?: string;
  fileId?: string;
  hasTitle?: boolean;
  isSavedToLibrary?: boolean;
  canBeInAIContext?: boolean;
  typeInfo?: {
    icon: string;
    label: string;
    description: string;
  };
}

export interface CardVersion {
  id: string;
  cardId: string;
  versionNumber: number;
  content: string;
  isActive: boolean;
  createdAt: string;
}

// Workspace types
export interface Workspace {
  id: string;
  libraryId: string;
  title: string;
  isFavorited: boolean;
  createdAt: string;
  lastAccessedAt: string;
}

export interface WorkspaceCard {
  // Workspace card metadata
  id?: string; // Workspace card ID (may not always be present)
  workspaceId?: string;
  cardId?: string;
  position: number;
  isInAIContext: boolean;
  isCollapsed: boolean;
  addedAt: string;
  depth: number;
  
  // Card data (merged in when fetching workspace cards)
  libraryId: string;
  title: string | null;
  displayTitle: string;
  contentPreview: string;
  fileSize: number;
  hasFile: boolean;
  filePath?: string;
  lastModified?: string;
  createdAt: string;
  updatedAt: string;
  content?: string;
  // Card Type System fields (optional for backward compatibility)
  cardType?: 'saved' | 'file' | 'unsaved';
  isLibraryWide?: boolean;
  workspaceSpecificId?: string;
  fileId?: string;
  hasTitle?: boolean;
  isSavedToLibrary?: boolean;
  canBeInAIContext?: boolean;
  typeInfo?: {
    icon: string;
    label: string;
    description: string;
  };
}

// Card links
export interface CardLink {
  id: string;
  sourceCardId: string;
  targetCardId: string;
  linkText: string;
  createdAt: string;
}

// Authentication types
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// UI State types
export interface AppState {
  selectedLibrary: Library | null;
  currentWorkspace: Workspace | null;
  aiContextCards: string[]; // Array of card IDs
  isLoading: boolean;
  error: string | null;
}

// API Response types
export interface ApiResponse<T = any> {
  data: T;
  success: boolean;
  message?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}