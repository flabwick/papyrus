#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');

// Test the complete card management system
async function testCardSystem() {
  console.log('🧪 Testing Card Management System\n');
  
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
    console.log('📊 Testing Database Models...');
    
    // Test Card model
    try {
      const Card = require('./src/models/Card');
      logTest('Card model import', true);
      
      // Test static methods exist
      const staticMethods = ['create', 'findById', 'findByBrainId', 'findByBrainAndTitle'];
      for (const method of staticMethods) {
        logTest(`Card.${method} static method exists`, typeof Card[method] === 'function');
      }
      
      // Test instance methods (create a dummy instance to test)
      const dummyCard = new Card({ id: 'test', brain_id: 'test', title: 'test' });
      const instanceMethods = ['updateContent', 'delete'];
      for (const method of instanceMethods) {
        logTest(`Card.${method} instance method exists`, typeof dummyCard[method] === 'function');
      }
    } catch (error) {
      logTest('Card model import', false, error.message);
    }
    
    // Test Brain model
    try {
      const Brain = require('./src/models/Brain');
      logTest('Brain model import', true);
    } catch (error) {
      logTest('Brain model import', false, error.message);
    }
    
    // Test 2: File Processors
    console.log('\n📄 Testing File Processors...');
    
    const processors = [
      'markdownProcessor',
      'textProcessor', 
      'pdfProcessor',
      'epubProcessor'
    ];
    
    for (const processor of processors) {
      try {
        const proc = require(`./src/utils/fileProcessors/${processor}`);
        logTest(`${processor} import`, true);
        
        // Check if it has process function
        const hasProcess = typeof proc.processMarkdownFile === 'function' || 
                          typeof proc.processTextFile === 'function' ||
                          typeof proc.processPdfFile === 'function' ||
                          typeof proc.processEpubFile === 'function';
        logTest(`${processor} has process function`, hasProcess);
      } catch (error) {
        logTest(`${processor} import`, false, error.message);
      }
    }
    
    // Test 3: Services
    console.log('\n🔧 Testing Services...');
    
    try {
      const cardProcessor = require('./src/services/cardProcessor');
      logTest('cardProcessor service import', true);
      
      const serviceMethods = ['processFile', 'processFiles', 'createCardFromContent', 'canProcess'];
      for (const method of serviceMethods) {
        logTest(`cardProcessor.${method} exists`, typeof cardProcessor[method] === 'function');
      }
    } catch (error) {
      logTest('cardProcessor service import', false, error.message);
    }
    
    try {
      const linkParser = require('./src/services/linkParser');
      logTest('linkParser service import', true);
      
      const linkMethods = ['extractLinks', 'processCardLinks', 'resolveLinks'];
      for (const method of linkMethods) {
        logTest(`linkParser.${method} exists`, typeof linkParser[method] === 'function');
      }
    } catch (error) {
      logTest('linkParser service import', false, error.message);
    }
    
    try {
      const fileWatcher = require('./src/services/fileWatcher');
      logTest('fileWatcher service import', true);
      
      const watcherMethods = ['start', 'stop', 'getStatus'];
      for (const method of watcherMethods) {
        logTest(`fileWatcher.${method} exists`, typeof fileWatcher[method] === 'function');
      }
    } catch (error) {
      logTest('fileWatcher service import', false, error.message);
    }
    
    // Test 4: REST API Routes
    console.log('\n🌐 Testing REST API Routes...');
    
    try {
      const cardsRouter = require('./src/routes/cards');
      logTest('cards router import', true);
      logTest('cards router is function', typeof cardsRouter === 'function');
    } catch (error) {
      logTest('cards router import', false, error.message);
    }
    
    // Test 5: CLI Commands
    console.log('\n💻 Testing CLI Commands...');
    
    try {
      const cardCommands = require('./cli/commands/cards');
      logTest('card CLI commands import', true);
    } catch (error) {
      logTest('card CLI commands import', false, error.message);
    }
    
    // Test 6: Database Connection
    console.log('\n🗄️  Testing Database...');
    
    try {
      const { healthCheck, checkTables } = require('./src/models/database');
      
      const isHealthy = await healthCheck();
      logTest('Database health check', isHealthy);
      
      const tableStatus = await checkTables();
      logTest('Required tables exist', tableStatus.allExist, 
              !tableStatus.allExist ? `Missing: ${tableStatus.missing.join(', ')}` : '');
    } catch (error) {
      logTest('Database connection test', false, error.message);
    }
    
    // Test 7: File System Integration
    console.log('\n📁 Testing File System Integration...');
    
    try {
      const { STORAGE_BASE } = require('./src/utils/fileSystem');
      const storageExists = await fs.pathExists(STORAGE_BASE);
      logTest('Storage directory exists', storageExists, STORAGE_BASE);
      
      if (storageExists) {
        const testUserDir = path.join(STORAGE_BASE, 'test-user');
        const testBrainDir = path.join(testUserDir, 'brains', 'test-brain');
        const testCardsDir = path.join(testBrainDir, 'cards');
        
        // Create test directory structure
        await fs.ensureDir(testCardsDir);
        logTest('Can create directory structure', true);
        
        // Test file operations
        const testFile = path.join(testCardsDir, 'test-card.md');
        await fs.writeFile(testFile, '# Test Card\n\nThis is a test card with [[link]] syntax.');
        const fileExists = await fs.pathExists(testFile);
        logTest('Can write test file', fileExists);
        
        // Cleanup
        await fs.remove(testUserDir);
        logTest('Can cleanup test files', true);
      }
    } catch (error) {
      logTest('File system integration', false, error.message);
    }
    
    // Test 8: Link Parsing
    console.log('\n🔗 Testing Link Parsing...');
    
    try {
      const linkParser = require('./src/services/linkParser');
      
      const testContent = `# Test Card
      
This card links to [[another-card]] and [[yet-another-card]].
It also has a [[complex-link-name]] in the middle of text.
      `;
      
      const links = linkParser.extractLinks(testContent);
      logTest('Link extraction works', Array.isArray(links));
      logTest('Extracts correct number of links', links.length === 3);
      
      const expectedLinks = ['another-card', 'yet-another-card', 'complex-link-name'];
      const extractedTitles = links.map(link => link.cardTitle); // Fix: use cardTitle property
      const hasAllLinks = expectedLinks.every(title => extractedTitles.includes(title));
      logTest('Extracts correct link titles', hasAllLinks);
    } catch (error) {
      logTest('Link parsing test', false, error.message);
    }
    
    // Test 9: File Processing Logic
    console.log('\n⚙️  Testing File Processing Logic...');
    
    try {
      const cardProcessor = require('./src/services/cardProcessor');
      
      // Test file type detection (fix: cardProcessor is a singleton, use getProcessor for sync check)
      const mdSupported = !!cardProcessor.getProcessor('test.md');
      const txtSupported = !!cardProcessor.getProcessor('test.txt');
      const pdfSupported = !!cardProcessor.getProcessor('test.pdf');
      const epubSupported = !!cardProcessor.getProcessor('test.epub');
      const unsupported = !!cardProcessor.getProcessor('test.exe');
      
      logTest('Supports markdown files', mdSupported);
      logTest('Supports text files', txtSupported);
      logTest('Supports PDF files', pdfSupported);
      logTest('Supports EPUB files', epubSupported);
      logTest('Rejects unsupported files', !unsupported);
    } catch (error) {
      logTest('File processing logic test', false, error.message);
    }
    
    // Test 10: API Endpoints
    console.log('\n🌍 Testing API Endpoints...');
    
    try {
      // Test basic health endpoint
      const response = await fetch('http://localhost:3001/api/health');
      if (response.ok) {
        const data = await response.json();
        logTest('Health endpoint responds', true);
        logTest('Health endpoint returns JSON', typeof data === 'object');
      } else {
        logTest('Health endpoint responds', false, `Status: ${response.status}`);
      }
    } catch (error) {
      logTest('API endpoint test', false, error.message);
    }
    
  } catch (error) {
    console.error('❌ Test suite error:', error);
  }
  
  // Print results
  console.log(`\n📊 Test Results:`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.tests
      .filter(test => !test.success)
      .forEach(test => {
        console.log(`   • ${test.name}${test.message ? ': ' + test.message : ''}`);
      });
  }
  
  console.log('\n🎉 Card Management System Test Complete!');
  
  return testResults.failed === 0;
}

// Run tests if called directly
if (require.main === module) {
  testCardSystem()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testCardSystem };