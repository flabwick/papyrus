#!/usr/bin/env node

/**
 * Comprehensive API Test Suite for Clarity Web API
 * 
 * This script tests all API endpoints with detailed error reporting
 * Run with: node test-api.js
 * 
 * Requirements:
 * - Server running on port 3001 (or set API_BASE_URL env var)
 * - Test user created via CLI: clarity admin create-user testapi password123
 * - Admin user exists: admin / admin123
 */

const fetch = require('node-fetch');
const chalk = require('chalk');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_USER = {
  username: 'testapi',
  password: 'password123'
};
const ADMIN_USER = {
  username: 'admin', 
  password: 'admin123'
};

// Global state for session management
let sessionCookie = null;
let currentUser = null;
let testBrainId = null;

// Utility Functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: chalk.blue,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    header: chalk.cyan.bold
  };
  console.log(`[${timestamp}] ${colors[type](message)}`);
}

function logResponse(response, data) {
  console.log(chalk.gray(`  Status: ${response.status} ${response.statusText}`));
  if (response.headers.get('set-cookie')) {
    console.log(chalk.gray(`  Set-Cookie: ${response.headers.get('set-cookie')}`));
  }
  if (data) {
    console.log(chalk.gray(`  Response: ${JSON.stringify(data, null, 2)}`));
  }
}

async function makeRequest(method, endpoint, body = null, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const requestOptions = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie || '',
      ...options.headers
    },
    ...options
  };

  if (body && method !== 'GET') {
    requestOptions.body = JSON.stringify(body);
  }

  log(`${method} ${endpoint}${body ? ` with ${JSON.stringify(body)}` : ''}`, 'info');
  
  try {
    const response = await fetch(url, requestOptions);
    
    // Capture session cookie for subsequent requests
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      sessionCookie = setCookie.split(';')[0]; // Take just the session part
    }
    
    let data = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      if (text) data = { message: text };
    }
    
    logResponse(response, data);
    
    return { response, data };
  } catch (error) {
    log(`Request failed: ${error.message}`, 'error');
    throw error;
  }
}

async function test(description, testFunction) {
  log(`\n=== ${description} ===`, 'header');
  try {
    await testFunction();
    log(`✅ ${description} - PASSED`, 'success');
  } catch (error) {
    log(`❌ ${description} - FAILED: ${error.message}`, 'error');
    if (error.response) {
      logResponse(error.response, error.data);
    }
    throw error;
  }
}

// Authentication Tests
async function testHealthCheck() {
  const { response, data } = await makeRequest('GET', '/api/test');
  
  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }
  
  if (!data || !data.message) {
    throw new Error('Response missing expected message field');
  }
}

async function testLoginSuccess() {
  const { response, data } = await makeRequest('POST', '/api/auth/login', TEST_USER);
  
  if (response.status !== 200) {
    throw new Error(`Login failed: ${response.status} - ${JSON.stringify(data)}`);
  }
  
  if (!data.user || !data.user.username) {
    throw new Error('Login response missing user data');
  }
  
  if (data.user.username !== TEST_USER.username) {
    throw new Error(`Expected username ${TEST_USER.username}, got ${data.user.username}`);
  }
  
  currentUser = data.user;
  log(`Logged in as: ${currentUser.username} (ID: ${currentUser.id})`, 'success');
}

async function testLoginFailure() {
  // Clear session for this test
  const originalCookie = sessionCookie;
  sessionCookie = null;
  
  const { response, data } = await makeRequest('POST', '/api/auth/login', {
    username: 'nonexistent',
    password: 'wrongpassword'
  });
  
  if (response.status !== 401) {
    throw new Error(`Expected 401 for bad credentials, got ${response.status}`);
  }
  
  if (!data.error) {
    throw new Error('Error response should include error message');
  }
  
  // Restore session
  sessionCookie = originalCookie;
}

async function testGetCurrentUser() {
  const { response, data } = await makeRequest('GET', '/api/auth/user');
  
  if (response.status !== 200) {
    throw new Error(`Failed to get current user: ${response.status}`);
  }
  
  if (!data.user || data.user.id !== currentUser.id) {
    throw new Error('Current user data mismatch');
  }
}

async function testUnauthorizedAccess() {
  // Clear session for this test
  const originalCookie = sessionCookie;
  sessionCookie = null;
  
  const { response, data } = await makeRequest('GET', '/api/brains');
  
  if (response.status !== 401) {
    throw new Error(`Expected 401 for unauthorized access, got ${response.status}`);
  }
  
  // Restore session
  sessionCookie = originalCookie;
}

// Brain Management Tests
async function testListBrains() {
  const { response, data } = await makeRequest('GET', '/api/brains');
  
  if (response.status !== 200) {
    throw new Error(`Failed to list brains: ${response.status}`);
  }
  
  if (!Array.isArray(data.brains)) {
    throw new Error('Brains response should be an array');
  }
  
  log(`Found ${data.brains.length} existing brains`, 'info');
}

async function testCreateBrain() {
  const brainData = {
    name: 'Test API Brain'
  };
  
  const { response, data } = await makeRequest('POST', '/api/brains', brainData);
  
  if (response.status !== 201) {
    throw new Error(`Failed to create brain: ${response.status} - ${JSON.stringify(data)}`);
  }
  
  if (!data.brain || !data.brain.id) {
    throw new Error('Create brain response missing brain data');
  }
  
  if (data.brain.name !== brainData.name) {
    throw new Error(`Brain name mismatch: expected "${brainData.name}", got "${data.brain.name}"`);
  }
  
  testBrainId = data.brain.id;
  log(`Created brain: ${data.brain.name} (ID: ${testBrainId})`, 'success');
}

async function testCreateDuplicateBrain() {
  const { response, data } = await makeRequest('POST', '/api/brains', {
    name: 'Test API Brain' // Same name as previous test
  });
  
  if (response.status !== 400) {
    throw new Error(`Expected 400 for duplicate brain name, got ${response.status}`);
  }
  
  if (!data.error || !data.error.includes('already exists')) {
    throw new Error('Error message should mention brain already exists');
  }
}

async function testGetBrainCards() {
  if (!testBrainId) {
    throw new Error('Test brain ID not available - create brain test may have failed');
  }
  
  const { response, data } = await makeRequest('GET', `/api/brains/${testBrainId}/cards`);
  
  if (response.status !== 200) {
    throw new Error(`Failed to get brain cards: ${response.status}`);
  }
  
  if (!Array.isArray(data.cards)) {
    throw new Error('Cards response should be an array');
  }
  
  log(`Brain has ${data.cards.length} cards`, 'info');
}

async function testGetNonexistentBrain() {
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { response, data } = await makeRequest('GET', `/api/brains/${fakeId}/cards`);
  
  if (response.status !== 404) {
    throw new Error(`Expected 404 for nonexistent brain, got ${response.status}`);
  }
  
  if (!data.error) {
    throw new Error('Error response should include error message');
  }
}

async function testDeleteBrain() {
  if (!testBrainId) {
    throw new Error('Test brain ID not available');
  }
  
  const { response, data } = await makeRequest('DELETE', `/api/brains/${testBrainId}`);
  
  if (response.status !== 200) {
    throw new Error(`Failed to delete brain: ${response.status} - ${JSON.stringify(data)}`);
  }
  
  if (!data.message || !data.message.includes('deleted')) {
    throw new Error('Delete response should confirm deletion');
  }
  
  log(`Deleted brain ID: ${testBrainId}`, 'success');
}

async function testLogout() {
  const { response, data } = await makeRequest('POST', '/api/auth/logout');
  
  if (response.status !== 200) {
    throw new Error(`Logout failed: ${response.status}`);
  }
  
  if (!data.message) {
    throw new Error('Logout response should include message');
  }
  
  // Clear local session
  sessionCookie = null;
  currentUser = null;
  
  log('Successfully logged out', 'success');
}

// Validation Tests
async function testInputValidation() {
  // Test empty brain name
  const { response: emptyResponse, data: emptyData } = await makeRequest('POST', '/api/brains', {
    name: ''
  });
  
  if (emptyResponse.status !== 400) {
    throw new Error(`Expected 400 for empty brain name, got ${emptyResponse.status}`);
  }
  
  // Test invalid brain name characters
  const { response: invalidResponse, data: invalidData } = await makeRequest('POST', '/api/brains', {
    name: 'Invalid/Brain*Name'
  });
  
  if (invalidResponse.status !== 400) {
    throw new Error(`Expected 400 for invalid brain name, got ${invalidResponse.status}`);
  }
}

// Main Test Runner
async function runAllTests() {
  log('Starting Clarity API Test Suite', 'header');
  log(`Testing against: ${API_BASE_URL}`, 'info');
  
  const tests = [
    // Basic connectivity
    ['Health Check', testHealthCheck],
    
    // Authentication flow
    ['Login with Valid Credentials', testLoginSuccess],
    ['Login with Invalid Credentials', testLoginFailure], 
    ['Get Current User', testGetCurrentUser],
    ['Unauthorized Access Protection', testUnauthorizedAccess],
    
    // Brain management
    ['List User Brains', testListBrains],
    ['Create New Brain', testCreateBrain],
    ['Create Duplicate Brain (Should Fail)', testCreateDuplicateBrain],
    ['Get Brain Cards', testGetBrainCards],
    ['Get Nonexistent Brain (Should Fail)', testGetNonexistentBrain],
    ['Input Validation', testInputValidation],
    ['Delete Brain', testDeleteBrain],
    
    // Cleanup
    ['Logout', testLogout]
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const [description, testFunction] of tests) {
    try {
      await test(description, testFunction);
      passed++;
    } catch (error) {
      failed++;
      log(`Continuing with remaining tests...`, 'warning');
    }
  }
  
  log(`\n=== TEST SUMMARY ===`, 'header');
  log(`Passed: ${passed}`, 'success');
  log(`Failed: ${failed}`, failed > 0 ? 'error' : 'info');
  log(`Total:  ${passed + failed}`, 'info');
  
  if (failed > 0) {
    log('\n⚠️  Some tests failed. Check the logs above for details.', 'warning');
    process.exit(1);
  } else {
    log('\n🎉 All tests passed!', 'success');
    process.exit(0);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  log(`Unhandled error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(error => {
    log(`Test suite failed: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  makeRequest,
  API_BASE_URL
};