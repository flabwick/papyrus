const Page = require('../models/Page');
const WorkspacePage = require('../models/WorkspacePage');
const Library = require('../models/Library');
const path = require('path');
const fs = require('fs-extra');

/**
 * Welcome Content Service  
 * Creates tutorial pages and welcome workspace content for new libraries
 */

/**
 * Tutorial page content templates
 */
const WELCOME_CARDS = {
  'Welcome to Your Library': `# Welcome to Your Library

Congratulations! You've just created your first **library** in Clarity - a knowledge management system that thinks the way you do.

## What Makes Clarity Different

Unlike traditional file-based systems, Clarity organizes information into:
- **Librarys**: Your knowledge bases (like this one)
- **Pages**: Individual pieces of content 
- **Workspaces**: Curated sequences of pages for different contexts

## Your Learning Journey

This welcome workspace will guide you through the basics:

1. [[What are Pages?]] - Understanding the building blocks
2. [[Working with Workspaces]] - Creating dynamic sequences  
3. [[AI Context Selection]] - Powering up with AI
4. [[Getting Started]] - Your next steps

Take your time exploring each concept. Welcome to a new way of thinking about knowledge!`,

  'What are Pages?': `# What are Pages?

Pages are the fundamental building blocks in Clarity. Think of them as individual thoughts, notes, or pieces of information that can be connected and recombined in infinite ways.

## Types of Pages

**Manual Pages**: Created directly in Clarity
- Text notes and ideas
- Markdown-formatted content
- Links to other pages using [[page-title]] syntax

**Imported Pages**: Created from files
- PDF documents automatically split into sections
- EPUB books converted to chapter pages  
- Markdown files from your filesystem
- Text files and documents

## Page Features

### Linking and Embedding
- Use [[page-title]] to link to other pages
- Embedded pages show as expandable sections
- Create knowledge networks naturally

### Content Preview
- Each page shows a preview of its content
- Click to expand and see full content
- Edit directly or update source files

## Example Page Structure

This page demonstrates several concepts:
- It links to [[Working with Workspaces]] (the next tutorial)
- It contains structured markdown content
- It can be embedded in other pages
- It maintains connections to its source concepts

Pages make knowledge modular and reusable - the same page can appear in multiple workspaces for different purposes.`,

  'Working with Workspaces': `# Working with Workspaces

Workspaces are where the magic happens in Clarity. Think of them as dynamic, contextual playlists of your knowledge pages.

## What Are Workspaces?

Unlike folders that store files, workspaces curate pages for specific purposes:
- **Research workspaces** for projects
- **Learning workspaces** for topics you're studying  
- **AI conversation workspaces** for specific questions
- **Reference workspaces** for frequently used pages

## Workspace Features

### Page Organization
- Add any page to any workspace
- Reorder pages by dragging (future feature)
- Create nested hierarchies with indentation
- Same page can appear in multiple workspaces

### Context Management  
- Each page's state is per-workspace
- Collapse pages you don't need to see
- Select pages for AI context independently
- Maintain different views for different purposes

## Workspace Types

**Temporary Workspaces** (default)
- Auto-deleted after 30 days if unused
- Perfect for quick research or exploration
- Clean up automatically

**Favorited Workspaces** ⭐
- Permanent and protected from cleanup
- For important long-term references
- Your knowledge library

## This Welcome Workspace

This workspace demonstrates workspace concepts:
- Sequential tutorial flow
- Nested page relationships  
- Mixed content types
- AI context selection ready

Next up: [[AI Context Selection]] - where workspaces become truly powerful.`,

  'AI Context Selection': `# AI Context Selection ✨

This is where Clarity becomes your AI-powered knowledge companion. The AI context system lets you select specific pages to include in AI conversations.

## How It Works

**The Magic Button**: Each page has a context toggle (✨ icon)
- Click to include/exclude pages from AI context
- Selected pages become available to AI models
- Context is maintained per-workspace  

**Smart Context Building**
- Add relevant background pages
- Include recent research or notes
- Select supporting documentation
- Build context for specific questions

## Example Workflow

1. **Research Phase**: Import PDFs and articles as pages
2. **Workspace Creation**: Add relevant pages to a research workspace  
3. **Context Selection**: Toggle pages relevant to your question
4. **AI Conversation**: Ask questions with full context available
5. **Knowledge Building**: Save AI responses as new pages

## Context Management

**Token Awareness**
- Real-time token counter in footer
- Stay within model limits
- Optimize context for better responses

**Per-Workspace Context**
- Different workspaces maintain separate AI contexts
- Same page can be in/out of context in different workspaces
- Flexible context building for different purposes

## AI-Generated Pages

When you generate new pages with AI:
- Pages are created with full content
- Automatically added to current workspace
- Can reference context pages using [[page-title]] syntax
- Become part of your knowledge graph

Ready to put it all together? Check out [[Getting Started]] for your next steps.`,

  'Getting Started': `# Getting Started

You now understand the core concepts of Clarity. Here's how to begin building your knowledge system.

## Immediate Next Steps

### 1. Import Your First Content
- Drag and drop a PDF or EPUB file
- Upload text files or markdown documents  
- Try SSH import for bulk file operations
- Watch files automatically become pages

### 2. Create Your First Workspace
- Click "New Workspace" in the interface
- Add some imported pages
- Practice reordering and organizing
- Try different depth levels for hierarchy

### 3. Experiment with AI Context
- Toggle some pages into AI context (✨ button)
- Watch the token counter in the footer
- Generate a new page using the selected context
- See how AI uses your pages to provide better answers

## Advanced Features to Explore

### File System Integration
- SSH directly into your library folders
- Edit files in your favorite IDE
- Watch changes sync automatically  
- Maintain file system workflows

### Cross-Library Connections
- Reference pages from other libraries: [[other-library/page-title]]
- Build connections across projects
- Maintain specialized library hierarchies

### Workspace Management
- Create focused workspaces for different projects
- Favorite important workspaces to prevent auto-cleanup
- Use temporary workspaces for exploration
- Build reusable reference workspaces

## Building Your Knowledge System

**Start Small**: Begin with one topic or project
**Stay Consistent**: Regular imports and organization
**Connect Ideas**: Use [[page-title]] links liberally  
**Leverage AI**: Use context selection for better responses
**Iterate**: Refine your workspaces and connections over time

## Getting Help

- Check documentation for advanced features
- Use CLI commands for power user workflows
- Explore file system integration options
- Join the community for tips and best practices

Welcome to your knowledge journey with Clarity! 

---

*This completes your welcome workspace. Feel free to favorite this workspace (⭐) to keep it as a reference, or let it auto-cleanup in 30 days as you build your own workspaces.*`
};

/**
 * Create all welcome pages for a new library
 * @param {string} libraryId - Library ID
 * @param {string} workspaceId - Welcome workspace ID  
 * @returns {Promise<Array>} - Array of created pages
 */
async function createWelcomePages(libraryId, workspaceId) {
  const library = await Library.findById(libraryId);
  if (!library) {
    throw new Error('Library not found');
  }

  const createdPages = [];
  let position = 0;

  // Create pages in order and add to welcome workspace
  for (const [title, content] of Object.entries(WELCOME_CARDS)) {
    try {
      // Create the page with content (this will create the file)
      const page = await Page.create(libraryId, title, {
        content: content.trim(),
        fileSize: Buffer.byteLength(content.trim(), 'utf8')
      });

      // Add page to welcome workspace with proper position
      await WorkspacePage.addPageToWorkspace(workspaceId, page.id, position, 0, {
        isInAIContext: false, // Don't include tutorial pages in AI context by default
        isCollapsed: position > 0 // Collapse all except the first page
      });

      createdPages.push({
        page: await page.toJSON(),
        position: position
      });

      position++;
      console.log(`✅ Created welcome page: ${title}`);

    } catch (error) {
      console.error(`❌ Failed to create welcome page '${title}':`, error.message);
      // Continue with other pages even if one fails
    }
  }

  console.log(`✅ Created ${createdPages.length} welcome pages for library ${libraryId}`);
  return createdPages;
}

/**
 * Recreate welcome workspace and pages for an existing library
 * @param {string} libraryId - Library ID
 * @returns {Promise<Object>} - Created workspace and pages
 */
async function recreateWelcomeWorkspace(libraryId) {
  const library = await Library.findById(libraryId);
  if (!library) {
    throw new Error('Library not found');
  }

  // Check if welcome workspace already exists
  const Workspace = require('../models/Workspace');
  const existingWorkspace = Workspace.findByLibraryAndName(libraryId, 'Welcome to Your Library');
  
  if (existingWorkspace) {
    throw new Error('Welcome workspace already exists. Delete it first if you want to recreate it.');
  }

  // Create new welcome workspace with tutorial content
  const workspace = await Workspace.create(libraryId, 'Welcome to Your Library', true);
  
  return {
    workspace: await workspace.toJSON(true), // Include pages in response
    message: 'Welcome workspace recreated successfully'
  };
}

/**
 * Get welcome content template for a specific page
 * @param {string} pageTitle - Page title
 * @returns {string|null} - Page content template or null if not found
 */
function getWelcomePageTemplate(pageTitle) {
  return WELCOME_CARDS[pageTitle] || null;
}

/**
 * Check if a page is a welcome page
 * @param {string} pageTitle - Page title to check
 * @returns {boolean} - True if this is a welcome page
 */
function isWelcomePage(pageTitle) {
  return Object.keys(WELCOME_CARDS).includes(pageTitle);
}

/**
 * Get list of all welcome page titles
 * @returns {Array<string>} - Array of welcome page titles
 */
function getWelcomePageTitles() {
  return Object.keys(WELCOME_CARDS);
}

/**
 * Create a sample demonstration workspace for existing users
 * @param {string} libraryId - Library ID
 * @returns {Promise<Object>} - Created demo workspace and pages
 */
async function createDemoWorkspace(libraryId) {
  const library = await Library.findById(libraryId);
  if (!library) {
    throw new Error('Library not found');
  }

  const Workspace = require('../models/Workspace');
  
  // Create demo workspace
  const demoWorkspace = await Workspace.create(libraryId, 'Workspace Demo', false);
  
  // Create a few demo pages to show workspace functionality  
  const demoPages = {
    'Workspace Demo Overview': `# Workspace Demo

This is a demonstration of workspace functionality for existing Clarity users.

This workspace contains several pages to show you:
- How pages can be organized in workspaces
- How nested hierarchies work with depth
- How AI context selection works
- How the same page can appear in multiple workspaces

Explore the pages below to see workspaces in action!`,

    'Nested Page Example': `# Nested Page Example

This page demonstrates how depth works in workspaces:

- This is a top-level page (depth 0)
- Child pages can be nested under it (depth 1)  
- And even deeper nesting is possible (depth 2+)

Use depth to:
- Create hierarchical organization
- Show relationships between concepts
- Build structured arguments or explanations
- Group related pages together`,

    'AI Context Demo': `# AI Context Demo  

This page shows how AI context selection works:

1. **Toggle Context**: Click the ✨ button to add pages to AI context
2. **Token Counting**: Watch the footer for token count updates
3. **Generate Pages**: Create new pages with context awareness
4. **Cross-Reference**: AI can reference selected pages in responses

Try selecting this page and others for AI context, then generate a new page asking about workspaces!`
  };

  const createdPages = [];
  let position = 0;

  for (const [title, content] of Object.entries(demoPages)) {
    const page = await Page.create(libraryId, title, {
      content: content.trim(),
      fileSize: Buffer.byteLength(content.trim(), 'utf8')
    });

    // Add with different depths to demonstrate hierarchy
    const depth = position === 0 ? 0 : (position === 1 ? 1 : 0);
    
    await WorkspacePage.addPageToWorkspace(demoWorkspace.id, page.id, position, depth, {
      isInAIContext: position === 2, // Only the AI demo page in context initially
      isCollapsed: false 
    });

    createdPages.push(await page.toJSON());
    position++;
  }

  return {
    workspace: await demoWorkspace.toJSON(true),
    createdPages,
    message: 'Demo workspace created successfully'
  };
}

module.exports = {
  createWelcomePages,
  recreateWelcomeWorkspace,
  createDemoWorkspace,
  getWelcomePageTemplate,
  isWelcomePage,
  getWelcomePageTitles
};