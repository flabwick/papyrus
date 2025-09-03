const Card = require('../models/Card');
const StreamCard = require('../models/StreamCard');
const Brain = require('../models/Brain');
const path = require('path');
const fs = require('fs-extra');

/**
 * Welcome Content Service  
 * Creates tutorial cards and welcome stream content for new brains
 */

/**
 * Tutorial card content templates
 */
const WELCOME_CARDS = {
  'Welcome to Your Brain': `# Welcome to Your Brain

Congratulations! You've just created your first **brain** in Clarity - a knowledge management system that thinks the way you do.

## What Makes Clarity Different

Unlike traditional file-based systems, Clarity organizes information into:
- **Brains**: Your knowledge bases (like this one)
- **Cards**: Individual pieces of content 
- **Streams**: Curated sequences of cards for different contexts

## Your Learning Journey

This welcome stream will guide you through the basics:

1. [[What are Cards?]] - Understanding the building blocks
2. [[Working with Streams]] - Creating dynamic sequences  
3. [[AI Context Selection]] - Powering up with AI
4. [[Getting Started]] - Your next steps

Take your time exploring each concept. Welcome to a new way of thinking about knowledge!`,

  'What are Cards?': `# What are Cards?

Cards are the fundamental building blocks in Clarity. Think of them as individual thoughts, notes, or pieces of information that can be connected and recombined in infinite ways.

## Types of Cards

**Manual Cards**: Created directly in Clarity
- Text notes and ideas
- Markdown-formatted content
- Links to other cards using [[card-title]] syntax

**Imported Cards**: Created from files
- PDF documents automatically split into sections
- EPUB books converted to chapter cards  
- Markdown files from your filesystem
- Text files and documents

## Card Features

### Linking and Embedding
- Use [[card-title]] to link to other cards
- Embedded cards show as expandable sections
- Create knowledge networks naturally

### Content Preview
- Each card shows a preview of its content
- Click to expand and see full content
- Edit directly or update source files

## Example Card Structure

This card demonstrates several concepts:
- It links to [[Working with Streams]] (the next tutorial)
- It contains structured markdown content
- It can be embedded in other cards
- It maintains connections to its source concepts

Cards make knowledge modular and reusable - the same card can appear in multiple streams for different purposes.`,

  'Working with Streams': `# Working with Streams

Streams are where the magic happens in Clarity. Think of them as dynamic, contextual playlists of your knowledge cards.

## What Are Streams?

Unlike folders that store files, streams curate cards for specific purposes:
- **Research streams** for projects
- **Learning streams** for topics you're studying  
- **AI conversation streams** for specific questions
- **Reference streams** for frequently used cards

## Stream Features

### Card Organization
- Add any card to any stream
- Reorder cards by dragging (future feature)
- Create nested hierarchies with indentation
- Same card can appear in multiple streams

### Context Management  
- Each card's state is per-stream
- Collapse cards you don't need to see
- Select cards for AI context independently
- Maintain different views for different purposes

## Stream Types

**Temporary Streams** (default)
- Auto-deleted after 30 days if unused
- Perfect for quick research or exploration
- Clean up automatically

**Favorited Streams** ⭐
- Permanent and protected from cleanup
- For important long-term references
- Your knowledge library

## This Welcome Stream

This stream demonstrates stream concepts:
- Sequential tutorial flow
- Nested card relationships  
- Mixed content types
- AI context selection ready

Next up: [[AI Context Selection]] - where streams become truly powerful.`,

  'AI Context Selection': `# AI Context Selection ✨

This is where Clarity becomes your AI-powered knowledge companion. The AI context system lets you select specific cards to include in AI conversations.

## How It Works

**The Magic Button**: Each card has a context toggle (✨ icon)
- Click to include/exclude cards from AI context
- Selected cards become available to AI models
- Context is maintained per-stream  

**Smart Context Building**
- Add relevant background cards
- Include recent research or notes
- Select supporting documentation
- Build context for specific questions

## Example Workflow

1. **Research Phase**: Import PDFs and articles as cards
2. **Stream Creation**: Add relevant cards to a research stream  
3. **Context Selection**: Toggle cards relevant to your question
4. **AI Conversation**: Ask questions with full context available
5. **Knowledge Building**: Save AI responses as new cards

## Context Management

**Token Awareness**
- Real-time token counter in footer
- Stay within model limits
- Optimize context for better responses

**Per-Stream Context**
- Different streams maintain separate AI contexts
- Same card can be in/out of context in different streams
- Flexible context building for different purposes

## AI-Generated Cards

When you generate new cards with AI:
- Cards are created with full content
- Automatically added to current stream
- Can reference context cards using [[card-title]] syntax
- Become part of your knowledge graph

Ready to put it all together? Check out [[Getting Started]] for your next steps.`,

  'Getting Started': `# Getting Started

You now understand the core concepts of Clarity. Here's how to begin building your knowledge system.

## Immediate Next Steps

### 1. Import Your First Content
- Drag and drop a PDF or EPUB file
- Upload text files or markdown documents  
- Try SSH import for bulk file operations
- Watch files automatically become cards

### 2. Create Your First Stream
- Click "New Stream" in the interface
- Add some imported cards
- Practice reordering and organizing
- Try different depth levels for hierarchy

### 3. Experiment with AI Context
- Toggle some cards into AI context (✨ button)
- Watch the token counter in the footer
- Generate a new card using the selected context
- See how AI uses your cards to provide better answers

## Advanced Features to Explore

### File System Integration
- SSH directly into your brain folders
- Edit files in your favorite IDE
- Watch changes sync automatically  
- Maintain file system workflows

### Cross-Brain Connections
- Reference cards from other brains: [[other-brain/card-title]]
- Build connections across projects
- Maintain specialized brain hierarchies

### Stream Management
- Create focused streams for different projects
- Favorite important streams to prevent auto-cleanup
- Use temporary streams for exploration
- Build reusable reference streams

## Building Your Knowledge System

**Start Small**: Begin with one topic or project
**Stay Consistent**: Regular imports and organization
**Connect Ideas**: Use [[card-title]] links liberally  
**Leverage AI**: Use context selection for better responses
**Iterate**: Refine your streams and connections over time

## Getting Help

- Check documentation for advanced features
- Use CLI commands for power user workflows
- Explore file system integration options
- Join the community for tips and best practices

Welcome to your knowledge journey with Clarity! 

---

*This completes your welcome stream. Feel free to favorite this stream (⭐) to keep it as a reference, or let it auto-cleanup in 30 days as you build your own streams.*`
};

/**
 * Create all welcome cards for a new brain
 * @param {string} brainId - Brain ID
 * @param {string} streamId - Welcome stream ID  
 * @returns {Promise<Array>} - Array of created cards
 */
async function createWelcomeCards(brainId, streamId) {
  const brain = await Brain.findById(brainId);
  if (!brain) {
    throw new Error('Brain not found');
  }

  const createdCards = [];
  let position = 0;

  // Create cards in order and add to welcome stream
  for (const [title, content] of Object.entries(WELCOME_CARDS)) {
    try {
      // Create the card with content (this will create the file)
      const card = await Card.create(brainId, title, {
        content: content.trim(),
        fileSize: Buffer.byteLength(content.trim(), 'utf8')
      });

      // Add card to welcome stream with proper position
      await StreamCard.addCardToStream(streamId, card.id, position, 0, {
        isInAIContext: false, // Don't include tutorial cards in AI context by default
        isCollapsed: position > 0 // Collapse all except the first card
      });

      createdCards.push({
        card: await card.toJSON(),
        position: position
      });

      position++;
      console.log(`✅ Created welcome card: ${title}`);

    } catch (error) {
      console.error(`❌ Failed to create welcome card '${title}':`, error.message);
      // Continue with other cards even if one fails
    }
  }

  console.log(`✅ Created ${createdCards.length} welcome cards for brain ${brainId}`);
  return createdCards;
}

/**
 * Recreate welcome stream and cards for an existing brain
 * @param {string} brainId - Brain ID
 * @returns {Promise<Object>} - Created stream and cards
 */
async function recreateWelcomeStream(brainId) {
  const brain = await Brain.findById(brainId);
  if (!brain) {
    throw new Error('Brain not found');
  }

  // Check if welcome stream already exists
  const Stream = require('../models/Stream');
  const existingStream = Stream.findByBrainAndName(brainId, 'Welcome to Your Brain');
  
  if (existingStream) {
    throw new Error('Welcome stream already exists. Delete it first if you want to recreate it.');
  }

  // Create new welcome stream with tutorial content
  const stream = await Stream.create(brainId, 'Welcome to Your Brain', true);
  
  return {
    stream: await stream.toJSON(true), // Include cards in response
    message: 'Welcome stream recreated successfully'
  };
}

/**
 * Get welcome content template for a specific card
 * @param {string} cardTitle - Card title
 * @returns {string|null} - Card content template or null if not found
 */
function getWelcomeCardTemplate(cardTitle) {
  return WELCOME_CARDS[cardTitle] || null;
}

/**
 * Check if a card is a welcome card
 * @param {string} cardTitle - Card title to check
 * @returns {boolean} - True if this is a welcome card
 */
function isWelcomeCard(cardTitle) {
  return Object.keys(WELCOME_CARDS).includes(cardTitle);
}

/**
 * Get list of all welcome card titles
 * @returns {Array<string>} - Array of welcome card titles
 */
function getWelcomeCardTitles() {
  return Object.keys(WELCOME_CARDS);
}

/**
 * Create a sample demonstration stream for existing users
 * @param {string} brainId - Brain ID
 * @returns {Promise<Object>} - Created demo stream and cards
 */
async function createDemoStream(brainId) {
  const brain = await Brain.findById(brainId);
  if (!brain) {
    throw new Error('Brain not found');
  }

  const Stream = require('../models/Stream');
  
  // Create demo stream
  const demoStream = await Stream.create(brainId, 'Stream Demo', false);
  
  // Create a few demo cards to show stream functionality  
  const demoCards = {
    'Stream Demo Overview': `# Stream Demo

This is a demonstration of stream functionality for existing Clarity users.

This stream contains several cards to show you:
- How cards can be organized in streams
- How nested hierarchies work with depth
- How AI context selection works
- How the same card can appear in multiple streams

Explore the cards below to see streams in action!`,

    'Nested Card Example': `# Nested Card Example

This card demonstrates how depth works in streams:

- This is a top-level card (depth 0)
- Child cards can be nested under it (depth 1)  
- And even deeper nesting is possible (depth 2+)

Use depth to:
- Create hierarchical organization
- Show relationships between concepts
- Build structured arguments or explanations
- Group related cards together`,

    'AI Context Demo': `# AI Context Demo  

This card shows how AI context selection works:

1. **Toggle Context**: Click the ✨ button to add cards to AI context
2. **Token Counting**: Watch the footer for token count updates
3. **Generate Cards**: Create new cards with context awareness
4. **Cross-Reference**: AI can reference selected cards in responses

Try selecting this card and others for AI context, then generate a new card asking about streams!`
  };

  const createdCards = [];
  let position = 0;

  for (const [title, content] of Object.entries(demoCards)) {
    const card = await Card.create(brainId, title, {
      content: content.trim(),
      fileSize: Buffer.byteLength(content.trim(), 'utf8')
    });

    // Add with different depths to demonstrate hierarchy
    const depth = position === 0 ? 0 : (position === 1 ? 1 : 0);
    
    await StreamCard.addCardToStream(demoStream.id, card.id, position, depth, {
      isInAIContext: position === 2, // Only the AI demo card in context initially
      isCollapsed: false 
    });

    createdCards.push(await card.toJSON());
    position++;
  }

  return {
    stream: await demoStream.toJSON(true),
    createdCards,
    message: 'Demo stream created successfully'
  };
}

module.exports = {
  createWelcomeCards,
  recreateWelcomeStream,
  createDemoStream,
  getWelcomeCardTemplate,
  isWelcomeCard,
  getWelcomeCardTitles
};