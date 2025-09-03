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

// Brain types
export interface Brain {
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
  brainId: string;
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
  isBrainWide?: boolean;
  streamSpecificId?: string;
  fileId?: string;
  hasTitle?: boolean;
  isSavedToBrain?: boolean;
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

// Stream types
export interface Stream {
  id: string;
  brainId: string;
  title: string;
  isFavorited: boolean;
  createdAt: string;
  lastAccessedAt: string;
}

export interface StreamCard {
  // Stream card metadata
  id?: string; // Stream card ID (may not always be present)
  streamId?: string;
  cardId?: string;
  position: number;
  isInAIContext: boolean;
  isCollapsed: boolean;
  addedAt: string;
  depth: number;
  
  // Card data (merged in when fetching stream cards)
  brainId: string;
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
  isBrainWide?: boolean;
  streamSpecificId?: string;
  fileId?: string;
  hasTitle?: boolean;
  isSavedToBrain?: boolean;
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
  selectedBrain: Brain | null;
  currentStream: Stream | null;
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