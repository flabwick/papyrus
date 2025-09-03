# Clarity Frontend Module 1: Stream-Based Card Management Interface

## Module Overview

This module implements the core user interface for Clarity, a knowledge management system that organizes information into "cards" (individual pieces of content) arranged in "streams" (temporary, reorderable sequences). The interface prioritizes functional efficiency over visual polish, drawing inspiration from terminal interfaces and power-user tools.

## Project Context

Clarity is built around three core concepts:
- **Brains**: Persistent knowledge bases (like folders)
- **Cards**: Individual pieces of content (markdown text, typically 100-500 words)
- **Streams**: Temporary, tab-like views showing selected cards in sequence

The backend API is fully implemented with authentication, CRUD operations, and real-time synchronization. This frontend module creates the primary user interface for working with cards through the stream metaphor.

## Technical Foundation

### Prerequisites
- Modern React application (Create React App or similar)
- Backend API running on configured endpoint (typically `http://localhost:3001/api`)
- User authentication system (session-based via cookies)

### Core Dependencies Required
```json
{
  "react": "^18.x",
  "react-dom": "^18.x", 
  "react-markdown": "^8.x",
  "axios": "^1.x"
}
```

### API Endpoints This Module Uses
```
Authentication:
- POST /api/auth/login
- GET /api/auth/user
- POST /api/auth/logout

Brain Management:
- GET /api/brains

Stream Management:  
- GET /api/streams
- POST /api/streams
- GET /api/streams/:id
- PUT /api/streams/:id
- DELETE /api/streams/:id
- GET /api/streams/:id/cards
- POST /api/streams/:id/cards
- PUT /api/streams/:id/cards/:cardId
- DELETE /api/streams/:id/cards/:cardId

Card Management:
- GET /api/cards
- POST /api/cards
- GET /api/cards/:id
- PUT /api/cards/:id
- DELETE /api/cards/:id
```

## Visual Design Requirements

### Design Philosophy
Follow the "terminal-inspired efficiency" aesthetic from the Visual Style Guide:
- Functional minimalism over decorative elements
- Bold structural elements (thick borders, clear spacing)
- Light theme optimized for reading and writing
- Accumulative button design (many small, efficient controls)

### Color Palette (Mandatory)
- Background: `#f8f9fa` (very light gray)
- Card Background: `#ffffff` (pure white)
- Text Primary: `#111827` (very dark gray)
- Borders Strong: `#374151` (3px width for primary structure)
- Borders Medium: `#d1d5db` (2px width for secondary structure)
- AI Context Highlight: `#e0e7ff` (light purple background)
- AI Context Border: `#6366f1` (indigo accent)

### Typography (Mandatory)
- Font Family: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Stream Title: 15px, weight 600
- Card Title: 15px, weight 600 (reduces with nesting depth)
- Body Text: 14px, weight 400, line-height 1.6
- Button Text: 10-11px, weight 500-600

### Layout Structure (Mandatory)
```
Application Layout:
├── Header (brain selector, stream title, status)
├── Main Content (stream view with cards)
└── Command Bar (actions, AI context counter, status)
```

## Component Architecture

### 1. App Component (Root)
**Responsibilities:**
- Authentication state management
- Global application state
- Route between login and main interface
- Error boundary for the entire application

**State Management:**
- Current user (from authentication)
- Selected brain
- Loading states
- Global error states

### 2. StreamView Component (Primary Interface)
**Responsibilities:**
- Display current stream with all cards
- Handle card ordering and positioning
- Manage stream-level actions (rename, delete, duplicate)
- Coordinate between cards and stream metadata

**Props:**
- `streamId`: Current stream identifier
- `brainId`: Parent brain identifier

**State Management:**
- Current stream data (title, favorited status, etc.)
- Array of cards in stream with positions
- Stream editing states (rename mode, etc.)

### 3. Card Component (Core Content)
**Responsibilities:**
- Display individual card content (title and body)
- Handle card editing (inline title editing, full content editing)
- Manage card states (collapsed/expanded, AI context selection)
- Render nested cards through `[[card-title]]` syntax
- Provide card-level actions (edit, delete, move)

**Props:**
- `card`: Card data object
- `streamId`: Parent stream
- `depth`: Nesting level (0 = top level)
- `isInAIContext`: Whether card is selected for AI
- `isCollapsed`: Current collapse state
- `onUpdate`: Callback for card changes
- `onAIContextToggle`: Callback for AI selection
- `onDelete`: Callback for card deletion

**State Management:**
- Edit mode (none, title-edit, content-edit)
- Local card content (for optimistic updates)
- Nested card expansion states

### 4. CardEditor Component
**Responsibilities:**
- Full-screen or modal editing interface for card content
- Markdown editing with preview
- Save/cancel functionality
- Link insertion helpers for `[[card-title]]` syntax

**Props:**
- `card`: Card being edited
- `isOpen`: Whether editor is active
- `onSave`: Callback with updated content
- `onCancel`: Callback to close without saving

### 5. StreamSelector Component
**Responsibilities:**
- List available streams in current brain
- Create new streams
- Switch between streams
- Display stream metadata (card count, last accessed)

**Props:**
- `brainId`: Current brain
- `currentStreamId`: Active stream
- `onStreamSelect`: Callback for stream changes
- `onStreamCreate`: Callback for new streams

### 6. BrainSelector Component
**Responsibilities:**
- List available brains for current user
- Switch between brains
- Display brain metadata (card count, storage usage)

**Props:**
- `currentBrainId`: Active brain
- `onBrainSelect`: Callback for brain changes

### 7. CommandBar Component
**Responsibilities:**
- Stream-level actions (add card, AI generate, stream settings)
- AI context management (token counter, clear selection)
- System status display (sync status, storage usage)
- Quick action buttons

**Props:**
- `streamId`: Current stream
- `aiContextCards`: Array of selected cards
- `onAddCard`: Callback for card creation
- `onAIGenerate`: Callback for AI operations

### 8. AddCardInterface Component
**Responsibilities:**
- Quick card creation within streams
- Position selection for new cards
- Template selection or blank card creation
- Integration point for future file upload

**Props:**
- `streamId`: Target stream
- `position`: Where to insert new card
- `onCardCreated`: Callback when card is added

## User Interface Flow

### Primary Workflow
1. **Authentication**: User logs in, application loads user data
2. **Brain Selection**: User selects or defaults to a brain
3. **Stream Loading**: Application loads default stream or user selects stream
4. **Card Interaction**: User creates, edits, and organizes cards within stream
5. **AI Context**: User selects cards for AI processing (future functionality)

### Core User Actions

#### Stream Management
- **View Stream**: Load stream with all cards in order
- **Create Stream**: New empty stream in current brain
- **Rename Stream**: Inline editing of stream title
- **Delete Stream**: Remove stream (with confirmation)
- **Switch Stream**: Change to different stream in same brain

#### Card Management
- **Create Card**: Add new card at specific position in stream
- **Edit Card Title**: Inline editing with immediate save
- **Edit Card Content**: Full editor interface with markdown support
- **Delete Card**: Remove card from stream (with soft-delete option)
- **Toggle AI Context**: Add/remove card from AI context selection
- **Collapse/Expand**: Toggle card content visibility
- **Move Card**: Change card position within stream (future: drag-and-drop)

#### Content Features
- **Markdown Rendering**: Display cards with proper markdown formatting
- **Link Rendering**: `[[card-title]]` links display as embedded cards
- **Nested Display**: Linked cards show as indented sub-cards
- **Search Cards**: Find cards to add to current stream

## Technical Implementation Guidelines

### State Management Strategy
Use React's built-in state management (useState, useContext) rather than external libraries:

**Global State (Context):**
- Authentication state
- Selected brain
- Current stream
- AI context selection

**Local State (Component):**
- Individual card edit states
- Collapse states
- Form inputs
- Loading states

### API Integration Patterns

**Error Handling:**
- All API calls must handle errors gracefully
- Display user-friendly error messages
- Maintain application state on errors
- Provide retry mechanisms for failed operations

**Optimistic Updates:**
- Update UI immediately for user actions
- Revert changes if API calls fail
- Show loading states for delayed operations

**Data Synchronization:**
- Refresh stream data when cards are modified
- Update card positions after reordering
- Sync AI context selection across components

### Performance Considerations

**Efficient Rendering:**
- Virtualize long streams (100+ cards)
- Lazy load card content for collapsed cards
- Debounce auto-save operations
- Minimize re-renders with proper dependency arrays

**Memory Management:**
- Clean up event listeners
- Cancel pending API requests on unmount
- Limit nested card depth to prevent infinite loops

## User Experience Requirements

### Keyboard Shortcuts (Essential)
- `Ctrl+N`: Create new card
- `Ctrl+E`: Edit current card
- `Ctrl+S`: Save current edit
- `Escape`: Cancel current edit
- `Ctrl+/`: Toggle AI context for current card
- `Tab/Shift+Tab`: Navigate between cards

### Visual Feedback (Essential)
- **Loading States**: Show spinner or skeleton for API operations
- **Save Indicators**: Visual confirmation when changes are saved
- **Error States**: Clear error messages with suggested actions
- **Hover Effects**: Subtle feedback on interactive elements

### Responsive Behavior
- **Desktop First**: Optimize for desktop/laptop usage
- **Mobile Functional**: Ensure core functionality works on mobile
- **Touch Targets**: Buttons min 44px for mobile touch
- **Text Scaling**: Respect system font size preferences

## Security Considerations

### Input Validation
- Sanitize all markdown content before rendering
- Validate card titles for length and characters
- Prevent XSS through proper React rendering practices

### Authentication
- Handle session expiration gracefully
- Redirect to login when authentication fails
- Clear sensitive data on logout

### Data Protection
- Never store passwords in frontend state
- Use HTTPS for all API communications
- Implement proper CORS headers

## Testing Strategy

### Unit Testing
- Test individual components in isolation
- Mock API responses for predictable testing
- Test user interaction flows (click, type, submit)
- Validate state changes and prop handling

### Integration Testing
- Test API integration with real backend
- Verify authentication flows
- Test error handling scenarios
- Validate data persistence

### User Acceptance Testing
- Create test scenarios for core workflows
- Verify keyboard shortcut functionality
- Test responsive behavior across devices
- Validate accessibility with screen readers

## Development Phases

### Phase 1: Basic Structure (Week 1)
**Goal**: Static interface with mock data
- Authentication component with login form
- Basic stream view with hardcoded cards
- Card component with static content
- Command bar with non-functional buttons

**Deliverable**: Visual interface matching style guide

### Phase 2: API Integration (Week 2)
**Goal**: Connect to real backend data
- Authentication API integration
- Brain and stream data loading
- Card CRUD operations
- Error handling and loading states

**Deliverable**: Functional read/write interface

### Phase 3: Advanced Interactions (Week 3)
**Goal**: Full feature set for basic usage
- Inline editing for cards and streams
- AI context selection system
- Keyboard shortcuts
- Card positioning and movement

**Deliverable**: Production-ready core interface

### Phase 4: Polish and Performance (Week 4)
**Goal**: Optimize and refine user experience
- Performance optimization
- Advanced keyboard navigation
- Mobile responsive improvements
- User testing and feedback incorporation

**Deliverable**: Polished, efficient interface ready for daily use

## Success Metrics

### Functional Requirements
- [ ] User can log in and see their brains/streams
- [ ] User can create, edit, and delete cards
- [ ] User can organize cards within streams
- [ ] User can select cards for AI context
- [ ] Interface responds to all actions within 200ms
- [ ] All keyboard shortcuts work correctly

### User Experience Requirements
- [ ] Interface matches visual style guide exactly
- [ ] No visual glitches or layout breaks
- [ ] Error messages are clear and actionable
- [ ] Loading states prevent user confusion
- [ ] Mobile interface is functional (not perfect)

### Technical Requirements
- [ ] No console errors in production build
- [ ] API integration handles all error cases
- [ ] Authentication state persists across page refreshes
- [ ] Component architecture supports future features
- [ ] Code is documented and maintainable

## Future Expansion Points

This module provides the foundation for future enhancements:
- File upload and processing interface
- Real-time collaboration features
- Advanced AI integration and generation
- Card linking and graph visualization
- Export and sharing capabilities
- Advanced search and filtering

The architecture should accommodate these features without major refactoring of core components.

---

## Handoff Checklist

Before beginning development, ensure:
- [ ] Backend API is running and accessible
- [ ] Test user accounts are available
- [ ] Visual style guide assets are available
- [ ] Development environment is configured
- [ ] API endpoints are documented and tested
- [ ] Design system requirements are understood

This module represents the core value proposition of Clarity: efficient, stream-based knowledge management with powerful card organization capabilities. Success here enables all future development and establishes the foundation for a truly useful knowledge management tool.