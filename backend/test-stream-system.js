#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');

// Test the complete stream management system
async function testStreamSystem() {
  console.log('🧪 Testing Stream Management System\n');
  
  const testResults = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  function logTest(name, success, message = '') {
    const status = success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${name}${message ? ': ' + message : ''}`);
    testResults.tests.push({ name, success, message });
    if (success) testResults.passed++;
    else testResults.failed++;
  }
  
  try {
    // Test 1: Database Models
    console.log('📊 Testing Stream Models...');
    
    // Test Stream model
    try {
      const Stream = require('./src/models/Stream');
      logTest('Stream model import', true);
      
      // Test static methods exist
      const staticMethods = ['create', 'findById', 'findByBrainId', 'findByBrainAndName', 'cleanupExpired'];
      for (const method of staticMethods) {
        logTest(`Stream.${method} static method exists`, typeof Stream[method] === 'function');
      }
      
      // Test instance methods (create a dummy instance to test)
      const dummyStream = new Stream({ id: 'test', brain_id: 'test', name: 'test', is_favorited: false });
      const instanceMethods = ['updateLastAccessed', 'toggleFavorite', 'update', 'delete', 'getCards', 'duplicate'];
      for (const method of instanceMethods) {
        logTest(`Stream.${method} instance method exists`, typeof dummyStream[method] === 'function');
      }
    } catch (error) {
      logTest('Stream model import', false, error.message);
    }
    
    // Test StreamCard model
    try {
      const StreamCard = require('./src/models/StreamCard');
      logTest('StreamCard model import', true);
      
      // Test static methods exist
      const staticMethods = [
        'addCardToStream', 'removeCardFromStream', 'reorderCard', 
        'toggleAIContext', 'toggleCollapsed', 'updateCardState',
        'getStreamCards', 'getCardStreams', 'getAIContextCards',
        'normalizePositions', 'getPositionStats', 'bulkUpdatePositions'
      ];
      for (const method of staticMethods) {
        logTest(`StreamCard.${method} static method exists`, typeof StreamCard[method] === 'function');
      }
      
      // Test constructor
      const dummyStreamCard = new StreamCard({ 
        id: 'test', stream_id: 'test', card_id: 'test', 
        position: 0, depth: 0, is_in_ai_context: false, is_collapsed: false 
      });
      logTest('StreamCard constructor works', dummyStreamCard.id === 'test');
    } catch (error) {
      logTest('StreamCard model import', false, error.message);
    }
    
    // Test 2: Services
    console.log('\n🔧 Testing Stream Services...');
    
    // Test Stream Manager
    try {
      const StreamManager = require('./src/services/streamManager');
      logTest('StreamManager service import', true);
      
      const serviceMethods = [
        'createWelcomeStream', 'addCardToStream', 'moveCard', 'removeCardFromStream',
        'duplicateStream', 'getStreamWithCards', 'searchCardsForStream',
        'getStreamStats', 'batchReorderCards', 'getStreamAnalytics'
      ];
      for (const method of serviceMethods) {
        logTest(`StreamManager.${method} method exists`, typeof StreamManager[method] === 'function');
      }
    } catch (error) {
      logTest('StreamManager service import', false, error.message);
    }
    
    // Test Welcome Content service
    try {
      const welcomeContent = require('./src/services/welcomeContent');
      logTest('welcomeContent service import', true);
      
      const serviceMethods = [
        'createWelcomeCards', 'recreateWelcomeStream', 'createDemoStream',
        'getWelcomeCardTemplate', 'isWelcomeCard', 'getWelcomeCardTitles'
      ];
      for (const method of serviceMethods) {
        logTest(`welcomeContent.${method} method exists`, typeof welcomeContent[method] === 'function');
      }
      
      // Test welcome content data
      const welcomeCardTitles = welcomeContent.getWelcomeCardTitles();
      logTest('Welcome card titles returned', Array.isArray(welcomeCardTitles) && welcomeCardTitles.length > 0);
      logTest('Welcome cards include basic tutorial', welcomeCardTitles.includes('Welcome to Your Brain'));
      logTest('Welcome cards include streams tutorial', welcomeCardTitles.includes('Working with Streams'));
      logTest('Welcome cards include AI tutorial', welcomeCardTitles.includes('AI Context Selection'));
      
      // Test template retrieval
      const welcomeTemplate = welcomeContent.getWelcomeCardTemplate('Welcome to Your Brain');
      logTest('Welcome card template retrieved', typeof welcomeTemplate === 'string' && welcomeTemplate.length > 0);
      
      const invalidTemplate = welcomeContent.getWelcomeCardTemplate('Nonexistent Card');
      logTest('Invalid template returns null', invalidTemplate === null);
      
      // Test welcome card identification
      logTest('Identifies welcome cards correctly', welcomeContent.isWelcomeCard('Welcome to Your Brain'));
      logTest('Identifies non-welcome cards correctly', !welcomeContent.isWelcomeCard('Random Card'));
    } catch (error) {
      logTest('welcomeContent service import', false, error.message);
    }
    
    // Test 3: Route Integration
    console.log('\n🛣️  Testing Route Integration...');
    
    // Test stream routes
    try {
      const streamRoutes = require('./src/routes/streams');
      logTest('Stream routes import', true);
      
      // Check that it's an Express router
      logTest('Stream routes is Express router', typeof streamRoutes === 'function' && streamRoutes.stack);
    } catch (error) {
      logTest('Stream routes import', false, error.message);
    }
    
    // Test app integration
    try {
      const app = require('./src/app');
      logTest('App with stream routes import', true);
      
      // Check that app is an express application
      logTest('App is Express application', typeof app === 'function');
    } catch (error) {
      logTest('App with stream routes import', false, error.message);
    }
    
    // Test 4: Database Schema Validation
    console.log('\n🗄️  Testing Database Schema...');
    
    try {
      const { query } = require('./src/models/database');
      
      // Test streams table structure
      const streamsTable = await query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'streams' 
        ORDER BY ordinal_position
      `);
      
      logTest('Streams table exists', streamsTable.rows.length > 0);
      
      const streamColumns = streamsTable.rows.map(row => row.column_name);
      const requiredStreamColumns = ['id', 'brain_id', 'name', 'is_favorited', 'created_at', 'last_accessed_at'];
      
      for (const column of requiredStreamColumns) {
        logTest(`Streams table has ${column} column`, streamColumns.includes(column));
      }
      
      // Test stream_cards table structure
      const streamCardsTable = await query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'stream_cards' 
        ORDER BY ordinal_position
      `);
      
      logTest('Stream_cards table exists', streamCardsTable.rows.length > 0);
      
      const streamCardColumns = streamCardsTable.rows.map(row => row.column_name);
      const requiredStreamCardColumns = [
        'id', 'stream_id', 'card_id', 'position', 'depth', 
        'is_in_ai_context', 'is_collapsed', 'added_at'
      ];
      
      for (const column of requiredStreamCardColumns) {
        logTest(`Stream_cards table has ${column} column`, streamCardColumns.includes(column));
      }
      
      // Test indexes exist
      const indexes = await query(`
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE tablename IN ('streams', 'stream_cards')
        ORDER BY tablename, indexname
      `);
      
      logTest('Stream indexes exist', indexes.rows.length > 0);
      
      const indexNames = indexes.rows.map(row => row.indexname);
      const requiredIndexes = [
        'idx_streams_brain_id', 'idx_streams_favorited', 'idx_streams_last_accessed',
        'idx_stream_cards_stream_id', 'idx_stream_cards_card_id', 'idx_stream_cards_position'
      ];
      
      for (const indexName of requiredIndexes) {
        logTest(`Index ${indexName} exists`, indexNames.includes(indexName));
      }
      
    } catch (error) {
      logTest('Database schema validation', false, error.message);
    }
    
    // Test 5: Integration with Brain Creation
    console.log('\n🧠 Testing Brain Integration...');
    
    try {
      const Brain = require('./src/models/Brain');
      
      // Check that Brain.create method includes stream manager
      const brainCreateSource = Brain.create.toString();
      logTest('Brain.create includes StreamManager', brainCreateSource.includes('StreamManager'));
      logTest('Brain.create includes welcome stream creation', brainCreateSource.includes('createWelcomeStream'));
    } catch (error) {
      logTest('Brain integration check', false, error.message);
    }
    
    // Test 6: Position Management Logic
    console.log('\n📊 Testing Position Management...');
    
    try {
      const StreamCard = require('./src/models/StreamCard');
      
      // Test position stats functionality
      logTest('Position stats method exists', typeof StreamCard.getPositionStats === 'function');
      logTest('Normalize positions method exists', typeof StreamCard.normalizePositions === 'function');
      logTest('Bulk update positions method exists', typeof StreamCard.bulkUpdatePositions === 'function');
      
      // Test AI context management
      logTest('Toggle AI context method exists', typeof StreamCard.toggleAIContext === 'function');
      logTest('Toggle collapsed method exists', typeof StreamCard.toggleCollapsed === 'function');
      logTest('Get AI context cards method exists', typeof StreamCard.getAIContextCards === 'function');
    } catch (error) {
      logTest('Position management logic', false, error.message);
    }
    
    // Test 7: Welcome Content Validation
    console.log('\n📚 Testing Welcome Content...');
    
    try {
      const welcomeContent = require('./src/services/welcomeContent');
      const welcomeCardTitles = welcomeContent.getWelcomeCardTitles();
      
      // Validate each welcome card has content
      for (const title of welcomeCardTitles) {
        const template = welcomeContent.getWelcomeCardTemplate(title);
        logTest(`Welcome card "${title}" has content`, typeof template === 'string' && template.length > 100);
        
        // Check that content includes markdown formatting
        logTest(`Welcome card "${title}" includes markdown`, template.includes('#') || template.includes('**'));
        
        // Check for card linking syntax (most cards should have [[links]])
        if (title !== 'Getting Started') { // Last card might not have forward links
          const hasLinks = template.includes('[[') && template.includes(']]');
          logTest(`Welcome card "${title}" includes card links`, hasLinks, 'Optional for some cards');
        }
      }
      
      // Test content structure
      const welcomeCard = welcomeContent.getWelcomeCardTemplate('Welcome to Your Brain');
      logTest('Welcome card mentions brains', welcomeCard.includes('brain'));
      logTest('Welcome card mentions cards', welcomeCard.includes('card'));
      logTest('Welcome card mentions streams', welcomeCard.includes('stream'));
      
      const aiCard = welcomeContent.getWelcomeCardTemplate('AI Context Selection');
      logTest('AI card mentions context', aiCard.includes('context'));
      logTest('AI card mentions tokens', aiCard.includes('token'));
    } catch (error) {
      logTest('Welcome content validation', false, error.message);
    }
    
    // Test 8: CLI Command Structure (if CLI exists)
    console.log('\n💻 Testing CLI Integration...');
    
    try {
      // Check if streams CLI exists
      const streamsCliPath = path.join(__dirname, 'cli', 'commands', 'streams.js');
      const streamsCliExists = await fs.pathExists(streamsCliPath);
      
      if (streamsCliExists) {
        const streamsCli = require('./cli/commands/streams');
        logTest('Streams CLI command file exists', true);
        logTest('Streams CLI exports function', typeof streamsCli === 'function' || typeof streamsCli === 'object');
      } else {
        logTest('Streams CLI command file', false, 'File not found - CLI commands not yet implemented');
      }
    } catch (error) {
      logTest('CLI integration check', false, error.message);
    }
    
    // Test 9: API Endpoint Coverage
    console.log('\n🌐 Testing API Coverage...');
    
    try {
      const streamRoutes = require('./src/routes/streams');
      const routeSource = streamRoutes.toString();
      
      // Check for key endpoint patterns
      const endpoints = [
        'GET.*/', 'POST.*/', 'PUT.*/:id', 'DELETE.*/:id',
        'GET.*/:id/cards', 'POST.*/:id/cards', 'PUT.*/:id/cards/:cardId',
        'POST.*/:id/duplicate', 'GET.*/search/cards'
      ];
      
      for (const endpoint of endpoints) {
        const regex = new RegExp(endpoint);
        logTest(`API endpoint pattern ${endpoint}`, regex.test(routeSource));
      }
      
      // Check for proper authentication
      logTest('Routes require authentication', routeSource.includes('requireAuth'));
      
      // Check for proper validation
      logTest('Routes include validation', routeSource.includes('validateUUID') && routeSource.includes('validateStreamInput'));
    } catch (error) {
      logTest('API coverage check', false, error.message);
    }
    
  } catch (error) {
    console.error('❌ Fatal error during testing:', error);
    testResults.failed++;
  }
  
  // Final Results
  console.log('\n' + '='.repeat(50));
  console.log('🏁 Stream System Test Results');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📊 Total: ${testResults.tests.length}`);
  console.log(`🎯 Success Rate: ${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.tests
      .filter(test => !test.success)
      .forEach(test => {
        console.log(`   • ${test.name}${test.message ? ': ' + test.message : ''}`);
      });
  }
  
  console.log('\n🎉 Stream Management System testing complete!');
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Handle async errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests if called directly
if (require.main === module) {
  testStreamSystem().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testStreamSystem };