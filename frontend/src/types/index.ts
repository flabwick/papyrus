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

// Page types (formerly Card types)
export interface Page {
  id: string;
  libraryId: string;
  title: string | null;
  displayTitle: string; // Title or "Click to add title..." for unsaved pages
  contentPreview: string; // First 500 characters for quick display
  fileSize: number;
  hasFile: boolean;
  filePath?: string;
  lastModified?: string;
  createdAt: string;
  updatedAt: string;
  content?: string; // Full content (only included when specifically requested)
  // Page Type System fields (optional for backward compatibility)
  pageType?: 'saved' | 'file' | 'unsaved';
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

export interface PageVersion {
  id: string;
  pageId: string;
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

export interface WorkspacePage {
  // Workspace page metadata
  id?: string; // Workspace page ID (may not always be present)
  workspaceId?: string;
  pageId?: string;
  position: number;
  isInAIContext: boolean;
  isCollapsed: boolean;
  addedAt: string;
  depth: number;
  
  // Page data (merged in when fetching workspace pages)
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
  // Page Type System fields (optional for backward compatibility)
  pageType?: 'saved' | 'file' | 'unsaved';
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

// Page links (formerly Card links)
export interface PageLink {
  id: string;
  sourcePageId: string;
  targetPageId: string;
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
  aiContextPages: string[]; // Array of page IDs
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

// Legacy type aliases for backward compatibility during migration
export type Card = Page;
export type CardVersion = PageVersion;
export type WorkspaceCard = WorkspacePage;
export type CardLink = PageLink;