# Papyrus Forms System Documentation

**Generated:** 2025-09-07  
**Version:** 1.0  
**Status:** Production Ready

## Overview

The Papyrus Forms System is a comprehensive dynamic form framework that enables users to create interactive forms using a YAML-based Domain Specific Language (DSL). Forms can collect user input, perform template variable substitution, and execute workspace operations including AI-powered content generation.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Components                      │
├─────────────────────────────────────────────────────────────┤
│ FormCard.tsx          │ Form container and editor          │
│ FormRenderer.tsx      │ Dynamic form rendering engine     │
│ ButtonBlock.tsx       │ Interactive button components     │
│ TextBlock.tsx         │ Static text display blocks        │
│ TextboxBlock.tsx      │ Input field components            │
├─────────────────────────────────────────────────────────────┤
│                    Backend Services                         │
├─────────────────────────────────────────────────────────────┤
│ FormDSLParser.js      │ YAML parsing and validation       │
│ AIProviderService.js  │ AI integration (OpenAI/Anthropic) │
│ Form.js               │ Database model and operations     │
│ WorkspaceForm.js      │ Workspace integration            │
├─────────────────────────────────────────────────────────────┤
│                    Database Schema                          │
├─────────────────────────────────────────────────────────────┤
│ forms                 │ Form definitions and content      │
│ workspace_forms       │ Form-workspace relationships      │
└─────────────────────────────────────────────────────────────┘
```

## Form DSL Specification

### Basic Structure

```yaml
form:
  title: "Form Title"
  blocks:
    - block_type: "text"
      id: "intro"
      content: "Welcome text"
    
    - block_type: "textbox"
      id: "user-input"
      label: "Input Label:"
      required: true
      style: "single"
    
    - block_type: "button"
      id: "submit-btn"
      text: "Submit"
      action_type: "workspace_operation"
      workspace_operation:
        type: "create_card"
        title: "Result: {{user-input.value}}"
        content: "Generated content"
```

### Block Types

#### 1. Text Block
Static content display with markdown support.

```yaml
- block_type: "text"
  id: "unique-id"
  content: "**Bold text** and *italic text*"
  visibility: "visible"  # optional: visible|hidden
```

#### 2. Textbox Block
User input fields with validation.

```yaml
- block_type: "textbox"
  id: "field-id"
  label: "Field Label:"
  value: ""              # default value
  required: true          # validation
  style: "single"         # single|multi
  placeholder: "Enter text here"
```

**Styles:**
- `single`: Single-line input field
- `multi`: Multi-line textarea

#### 3. Button Block
Interactive buttons that trigger workspace operations.

```yaml
- block_type: "button"
  id: "button-id"
  text: "Button Text"
  disabled: false
  action_type: "workspace_operation"
  workspace_operation:
    type: "create_card|generate"
    # ... operation-specific parameters
```

### Workspace Operations

#### Create Card Operation
Creates new pages with resolved template content.

```yaml
workspace_operation:
  type: "create_card"
  position: "below"        # above|below|top|bottom
  title: "Page: {{field.value}}"
  content: |
    # {{title-field.value}}
    
    Content with {{variable.value}} substitution.
```

#### Generate Operation
AI-powered content generation with two output types.

##### Page Generation (Streaming)
Creates untitled pages with AI-streamed content.

```yaml
workspace_operation:
  type: "generate"
  output_type: "page"
  position: "below"
  prompt: "Write about {{topic.value}} using {{method.value}}"
```

##### Form Generation (Non-Streaming)
Generates new forms using AI with DSL instructions.

```yaml
workspace_operation:
  type: "generate"
  output_type: "form"
  position: "below"
  prompt: "Create a form for {{purpose.value}} with relevant fields"
```

### Template Variable System

#### Variable Resolution
Template variables use the format `{{block-id.property}}` and are resolved using form state.

**Form State Structure:**
```javascript
{
  "field-id": {
    "type": "textbox",
    "value": "user input"
  },
  "button-id": {
    "type": "button", 
    "disabled": false
  }
}
```

**Resolution Examples:**
- `{{research-topic.value}}` → `"Machine Learning"`
- `{{methodology.value}}` → `"Quantitative Analysis"`

#### Resolution Process
1. Parse template variables using regex `/\{\{([^}]+)\}\}/g`
2. Split variable into `[blockId, property]`
3. Look up `formState[blockId][property]`
4. Replace with resolved value or return original if not found

## Data Flow

### Form Execution Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Input    │───▶│  Form Renderer   │───▶│  Form State     │
│   (Frontend)    │    │  (Frontend)      │    │  (Frontend)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        │
┌─────────────────┐    ┌──────────────────┐             │
│  Button Click   │───▶│  Execute API     │◀────────────┘
│  (Frontend)     │    │  (Frontend)      │
└─────────────────┘    └──────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Forms Route    │───▶│  Template        │───▶│  Workspace      │
│  (Backend)      │    │  Resolution      │    │  Operation      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Page/Form      │◀───│  AI Generation   │◀───│  Operation      │
│  Creation       │    │  (if applicable) │    │  Execution      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### AI Generation Flow

#### Page Generation (Streaming)
```
Form Button Click
       │
       ▼
Template Resolution
       │
       ▼
Create Untitled Page (JSON params)
       │
       ▼
Add to Workspace
       │
       ▼
Frontend Auto-Detection
       │
       ▼
EventSource Connection (/api/ai/stream/:pageId)
       │
       ▼
Real-time Content Streaming
       │
       ▼
Page Content Updates
```

#### Form Generation (Non-Streaming)
```
Form Button Click
       │
       ▼
Template Resolution + DSL Instructions
       │
       ▼
AI Provider API Call
       │
       ▼
YAML DSL Response
       │
       ▼
Form Creation
       │
       ▼
Add to Workspace
```

## API Endpoints

### Form Management
```
GET    /api/forms                     - List user forms
POST   /api/forms                     - Create new form
GET    /api/forms/form/:id            - Get specific form
PUT    /api/forms/form/:id            - Update form
DELETE /api/forms/form/:id            - Delete form
POST   /api/forms/form/:id/validate   - Validate form DSL
POST   /api/forms/form/:id/execute    - Execute form operation
```

### Workspace Integration
```
GET    /api/workspaces/:id/forms      - Get workspace forms
POST   /api/workspaces/:id/forms      - Add form to workspace
DELETE /api/workspaces/:id/forms/:id  - Remove form from workspace
```

### AI Integration
```
GET    /api/ai/models                 - Get available AI models
GET    /api/ai/stream/:pageId         - Stream AI content to page
POST   /api/ai/test-generate          - Test AI generation
```

## Database Schema

### Forms Table
```sql
CREATE TABLE forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,           -- YAML DSL content
    form_data JSONB DEFAULT '{}',    -- Form state/responses
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Workspace Forms Table
```sql
CREATE TABLE workspace_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    depth INTEGER DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT false,
    is_in_ai_context BOOLEAN DEFAULT false,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Frontend Components

### FormCard Component
**Location:** `/frontend/src/components/FormCard.tsx`

**Purpose:** Container component for form display and editing.

**Key Features:**
- Form DSL editor with syntax highlighting
- Real-time validation feedback
- Expand/collapse functionality
- Save and update operations
- Integration with workspace operations

**Props:**
```typescript
interface FormCardProps {
  form: any;
  workspaceId: string;
  onRemove: (formId: string) => void;
  onToggleAI: (formId: string) => void;
  onToggleCollapse: (formId: string) => void;
  onWorkspaceUpdate: () => void;
}
```

### FormRenderer Component
**Location:** `/frontend/src/components/FormRenderer.tsx`

**Purpose:** Dynamic rendering engine for form blocks.

**Key Features:**
- Parses YAML DSL into interactive components
- Manages form state and validation
- Handles button operations and API calls
- Template variable resolution
- Error handling and user feedback

**State Management:**
```typescript
const [formState, setFormState] = useState<any>({});
const [validationResult, setValidationResult] = useState<any>(null);
const [globalError, setGlobalError] = useState<string | null>(null);
```

### Block Components

#### ButtonBlock Component
**Location:** `/frontend/src/components/ButtonBlock.tsx`

**Features:**
- Workspace operation execution
- Loading states during operations
- Error handling and user feedback
- Template variable preview

#### TextboxBlock Component
**Location:** `/frontend/src/components/TextboxBlock.tsx`

**Features:**
- Single and multi-line input support
- Real-time validation
- Required field indicators
- Placeholder text support

## Backend Services

### FormDSLParser Service
**Location:** `/backend/src/services/formDSLParser.js`

**Purpose:** YAML parsing, validation, and template resolution.

**Key Methods:**
```javascript
static parseFormDSL(yamlContent)              // Parse YAML to JSON
static validateFormStructure(formDefinition)   // Validate form structure
static resolveTemplateVariables(text, state)   // Resolve {{var}} templates
static processWorkspaceOperation(operation)    // Validate operations
```

**Template Resolution Algorithm:**
1. Find all `{{variable}}` patterns using regex
2. Split variable into `blockId.property` parts
3. Look up value in form state object
4. Replace with resolved value or return original

### AI Provider Service
**Location:** `/backend/src/services/aiProviders.js`

**Purpose:** Multi-provider AI integration for content generation.

**Supported Providers:**
- **OpenAI:** GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo
- **Anthropic:** Claude 3.5 Sonnet, Claude 3.5 Haiku
- **Google:** Gemini Pro

**Key Methods:**
```javascript
getAvailableModels()                           // List available models
generateContent(prompt, modelId)               // Non-streaming generation
generateStreaming(modelId, prompt, context)    // Streaming generation
```

## Workspace Integration

### Form-Workspace Relationship
Forms are integrated into workspaces alongside pages and files, creating a unified content management system.

**Workspace Loading:**
```javascript
// Load all workspace items (pages, files, forms)
const pages = workspace.pages || [];
const files = workspace.files || [];
const forms = workspace.forms || [];

const allItems = [...pages, ...files, ...forms].sort((a, b) => a.position - b.position);
```

**Form Rendering in Workspace:**
```javascript
if (item.itemType === 'form') {
  return (
    <FormCard
      key={itemId}
      form={item}
      workspaceId={workspaceId}
      onWorkspaceUpdate={loadWorkspace}
    />
  );
}
```

### Auto-Streaming for Generated Pages
When forms generate pages, the system automatically triggers AI streaming:

1. **Form Execution:** Button click stores page ID in `window.formGeneratedPageId`
2. **Workspace Refresh:** Detects stored page ID after reload
3. **Auto-Streaming:** Connects to EventSource endpoint automatically
4. **Content Updates:** Real-time content replaces JSON parameters

## AI Integration Details

### Streaming Architecture
Generated pages use Server-Sent Events (SSE) for real-time content updates:

**Backend Streaming:**
```javascript
// AI streaming endpoint
router.get('/stream/:pageId', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Stream AI content chunks
  aiService.generateStreaming(model, prompt, context, 
    (chunk) => res.write(`data: ${JSON.stringify({type: 'chunk', content: chunk})}\n\n`),
    () => res.write(`data: ${JSON.stringify({type: 'complete'})}\n\n`),
    (error) => res.write(`data: ${JSON.stringify({type: 'error', message: error.message})}\n\n`)
  );
});
```

**Frontend Streaming:**
```javascript
const eventSource = new EventSource(`/api/ai/stream/${pageId}`, { withCredentials: true });

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'chunk') {
    // Update page content in real-time
    setWorkspaceItems(prev => prev.map(item => {
      if (item.id === pageId) {
        return { ...item, content: data.totalContent };
      }
      return item;
    }));
  }
};
```

### Form Generation with DSL Instructions
When generating forms, the system appends comprehensive DSL instructions to ensure valid YAML output:

```javascript
const dslInstructions = `

IMPORTANT: Respond ONLY with valid YAML form DSL. Use this format:

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
    - block_type: "button"
      id: "submit"
      text: "Submit"
      action_type: "workspace_operation"
      workspace_operation:
        type: "create_card"
        title: "Result: {{field1.value}}"
        content: "Generated content"

Do not include any explanation or markdown formatting, just the YAML.`;
```

## Error Handling

### Frontend Error Handling
- **Form Validation:** Real-time DSL syntax validation with error display
- **API Errors:** User-friendly error messages for failed operations
- **Streaming Errors:** Graceful handling of connection failures
- **Template Errors:** Clear feedback for unresolved variables

### Backend Error Handling
- **DSL Parsing:** Comprehensive YAML syntax error reporting
- **Template Resolution:** Graceful handling of missing variables
- **AI Provider Errors:** Proper error propagation with context
- **Database Errors:** Transaction rollback and error logging

## Security Considerations

### Input Validation
- **DSL Content:** YAML parsing with schema validation
- **Template Variables:** Sanitization to prevent injection
- **User Input:** Server-side validation of all form inputs
- **AI Prompts:** Content filtering and length limits

### Authentication & Authorization
- **Session-based Auth:** All form operations require valid user session
- **Library Ownership:** Users can only access forms in their libraries
- **Workspace Access:** Form operations validate workspace ownership
- **API Key Security:** AI provider keys stored securely in environment variables

## Performance Considerations

### Frontend Optimization
- **Form State Management:** Efficient React state updates
- **Debounced Validation:** Reduced API calls during typing
- **Lazy Loading:** Forms loaded on-demand in workspaces
- **Memory Management:** Proper EventSource cleanup

### Backend Optimization
- **Database Indexing:** Optimized queries for form retrieval
- **Caching:** Form DSL parsing results cached when possible
- **Streaming Efficiency:** Chunked content delivery for large responses
- **Connection Pooling:** Efficient database connection management

## Development Workflow

### Adding New Block Types
1. **Define DSL Schema:** Add block type to validation schema
2. **Create Frontend Component:** Implement React component for block
3. **Update FormRenderer:** Add block type to rendering switch
4. **Add Backend Validation:** Update DSL parser validation rules
5. **Test Integration:** Verify end-to-end functionality

### Adding New Workspace Operations
1. **Define Operation Schema:** Add operation type to validation
2. **Implement Backend Handler:** Add operation logic to forms route
3. **Update Frontend:** Add operation support to button components
4. **Add Template Support:** Ensure variable resolution works
5. **Test Execution:** Verify operation creates expected results

## Testing Strategy

### Unit Tests
- **DSL Parser:** YAML parsing and validation logic
- **Template Resolution:** Variable substitution accuracy
- **Form Components:** React component behavior
- **AI Integration:** Provider API interactions

### Integration Tests
- **Form Execution:** End-to-end form operation testing
- **Workspace Integration:** Form-workspace relationship testing
- **AI Streaming:** Real-time content generation testing
- **Error Scenarios:** Comprehensive error handling testing

### Manual Testing
- **User Workflows:** Complete form creation and execution flows
- **Cross-browser:** Compatibility across different browsers
- **Performance:** Large form and workspace performance
- **Edge Cases:** Unusual input and error conditions

## Deployment

### Environment Variables
```bash
# AI Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...

# Database Configuration
DATABASE_URL=postgresql://...
```

### Database Migrations
```bash
# Apply forms schema
npm run migrate

# Verify forms tables
psql -d papyrus -c "\dt forms*"
```

### Build Process
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend  
cd frontend && npm install && npm start
```

## Future Enhancements

### Planned Features
- **Conditional Logic:** Show/hide blocks based on form state
- **Form Templates:** Pre-built form templates for common use cases
- **Advanced Validation:** Custom validation rules and error messages
- **Form Analytics:** Usage tracking and performance metrics
- **Collaborative Editing:** Real-time collaborative form editing
- **Version Control:** Form version history and rollback capabilities

### Technical Improvements
- **Performance:** Form rendering optimization for large forms
- **Accessibility:** Enhanced screen reader and keyboard navigation support
- **Mobile:** Responsive design improvements for mobile devices
- **Offline:** Offline form editing and sync capabilities
- **API:** GraphQL API for more efficient data fetching
- **Testing:** Automated end-to-end testing suite

## Troubleshooting

### Common Issues

#### Form Not Rendering
- **Check DSL Syntax:** Validate YAML formatting
- **Verify Block Types:** Ensure all block types are supported
- **Check Console:** Look for JavaScript errors in browser console

#### Template Variables Not Resolving
- **Verify Variable Names:** Check block IDs match template variables
- **Check Form State:** Ensure form state contains expected values
- **Debug Resolution:** Add logging to template resolution process

#### AI Generation Failing
- **Check API Keys:** Verify AI provider API keys are configured
- **Verify Model Availability:** Ensure requested model is available
- **Check Network:** Verify connectivity to AI provider APIs

#### Streaming Not Working
- **Check EventSource:** Verify browser supports Server-Sent Events
- **Network Issues:** Check for proxy or firewall blocking SSE
- **Backend Logs:** Review server logs for streaming errors

### Debug Commands
```bash
# Check form validation
curl -X POST http://localhost:3001/api/forms/form/ID/validate

# Test AI models
curl -X GET http://localhost:3001/api/ai/models

# Check form execution
curl -X POST http://localhost:3001/api/forms/form/ID/execute
```

---

## Conclusion

The Papyrus Forms System provides a powerful, flexible framework for creating dynamic, AI-integrated forms. The YAML-based DSL enables rapid form development, while the template variable system and workspace operations create seamless integration with the broader Papyrus ecosystem.

The system's architecture supports both simple data collection forms and complex AI-powered content generation workflows, making it suitable for a wide range of use cases from basic surveys to advanced research and content creation tools.

For additional support or feature requests, please refer to the project documentation or contact the development team.
