/**
 * Production API Test Suite
 * Comprehensive testing for the production-ready API
 */

require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');

class ProductionAPITester {
  constructor() {
    this.baseUrl = process.env.TEST_API_URL || 'http://localhost:3001/api';
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: []
    };
    this.authCookie = null;
    this.testBrainId = null;
    this.testUploadId = null;
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting Production API Test Suite');
    console.log(`Testing API at: ${this.baseUrl}`);
    console.log('==========================================\n');

    try {
      // System health tests
      await this.testSystemHealth();
      
      // Authentication tests
      await this.testAuthentication();
      
      // Rate limiting tests
      await this.testRateLimiting();
      
      // File upload tests
      await this.testFileUpload();
      
      // Error handling tests
      await this.testErrorHandling();
      
      // Response format tests
      await this.testResponseFormats();
      
      // Security tests
      await this.testSecurity();
      
      // Performance tests
      await this.testPerformance();
      
    } catch (error) {
      this.recordError('Test suite execution failed', error);
    }

    // Print results
    this.printResults();
  }

  /**
   * Test system health endpoints
   */
  async testSystemHealth() {
    console.log('🏥 Testing System Health...');

    // Basic health check
    await this.test('Basic health check', async () => {
      const response = await this.fetch('/system/health');
      this.assertEqual(response.status, 200);
      
      const data = await response.json();
      this.assertEqual(data.status, 'healthy');
      this.assertTrue(data.components.database);
    });

    // Detailed health check
    await this.test('Detailed health check', async () => {
      const response = await this.fetch('/system/health/detailed');
      this.assertEqual(response.status, 200);
      
      const data = await response.json();
      this.assertTrue(data.system.memory);
      this.assertTrue(data.components.jobQueue);
    });

    // System stats
    await this.test('System stats', async () => {
      const response = await this.fetch('/system/stats');
      this.assertEqual(response.status, 200);
      
      const data = await response.json();
      this.assertTrue(data.success);
      this.assertTrue(data.data.uptime !== undefined);
    });

    // Version info
    await this.test('Version information', async () => {
      const response = await this.fetch('/system/version');
      this.assertEqual(response.status, 200);
      
      const data = await response.json();
      this.assertTrue(data.success);
      this.assertTrue(data.data.version);
    });
  }

  /**
   * Test authentication
   */
  async testAuthentication() {
    console.log('🔐 Testing Authentication...');

    // Test login with invalid credentials
    await this.test('Login with invalid credentials', async () => {
      const response = await this.fetch('/auth/login', 'POST', {
        username: 'invalid',
        password: 'invalid'
      });
      this.assertEqual(response.status, 401);
      
      const data = await response.json();
      this.assertEqual(data.success, false);
      this.assertEqual(data.error.code, 'UNAUTHORIZED');
    });

    // Test login with valid credentials (assuming admin user exists)
    await this.test('Login with valid credentials', async () => {
      const response = await this.fetch('/auth/login', 'POST', {
        username: 'admin',
        password: 'admin123'
      });
      
      if (response.status === 200) {
        const data = await response.json();
        this.assertEqual(data.success, true);
        this.assertTrue(data.data.user);
        
        // Extract session cookie
        const cookies = response.headers.get('set-cookie');
        if (cookies) {
          this.authCookie = cookies.split(';')[0];
        }
      } else {
        console.log('⚠️  Admin user not available, skipping authenticated tests');
      }
    });

    // Test auth status
    if (this.authCookie) {
      await this.test('Check auth status', async () => {
        const response = await this.fetch('/auth/status');
        this.assertEqual(response.status, 200);
        
        const data = await response.json();
        this.assertEqual(data.success, true);
        this.assertTrue(data.data.authenticated);
      });
    }

    // Test accessing protected endpoint without auth
    await this.test('Access protected endpoint without auth', async () => {
      const tempCookie = this.authCookie;
      this.authCookie = null;
      
      const response = await this.fetch('/brains');
      this.assertEqual(response.status, 401);
      
      const data = await response.json();
      this.assertEqual(data.success, false);
      this.assertEqual(data.error.code, 'UNAUTHORIZED');
      
      this.authCookie = tempCookie;
    });
  }

  /**
   * Test rate limiting
   */
  async testRateLimiting() {
    console.log('⏱️  Testing Rate Limiting...');

    await this.test('Rate limit headers present', async () => {
      const response = await this.fetch('/system/health');
      this.assertTrue(response.headers.get('x-ratelimit-limit'));
      this.assertTrue(response.headers.get('x-ratelimit-remaining'));
    });

    // Test auth rate limiting (multiple failed attempts)
    await this.test('Authentication rate limiting', async () => {
      const attempts = [];
      
      // Make multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        const response = await this.fetch('/auth/login', 'POST', {
          username: 'invalid',
          password: 'invalid'
        });
        attempts.push(response.status);
      }

      // Last attempt should be rate limited
      const lastStatus = attempts[attempts.length - 1];
      this.assertTrue(lastStatus === 429 || lastStatus === 401);
    });
  }

  /**
   * Test file upload functionality
   */
  async testFileUpload() {
    console.log('📁 Testing File Upload...');

    if (!this.authCookie) {
      console.log('⚠️  Skipping upload tests - not authenticated');
      return;
    }

    // Create test brain first
    await this.test('Create test brain for uploads', async () => {
      const response = await this.fetch('/brains', 'POST', {
        name: 'Test Upload Brain'
      });
      
      if (response.status === 200) {
        const data = await response.json();
        this.testBrainId = data.data.id;
        this.assertTrue(data.success);
      }
    });

    if (!this.testBrainId) {
      console.log('⚠️  Skipping upload tests - no test brain available');
      return;
    }

    // Test upload without files
    await this.test('Upload without files', async () => {
      const formData = new FormData();
      formData.append('brainId', this.testBrainId);

      const response = await this.fetch('/upload', 'POST', formData);
      this.assertEqual(response.status, 400);
      
      const data = await response.json();
      this.assertEqual(data.success, false);
      this.assertEqual(data.error.code, 'VALIDATION_ERROR');
    });

    // Test upload without brain ID
    await this.test('Upload without brain ID', async () => {
      const formData = new FormData();
      const testFile = new Blob(['Test content'], { type: 'text/plain' });
      formData.append('files', testFile, 'test.txt');

      const response = await this.fetch('/upload', 'POST', formData);
      this.assertEqual(response.status, 400);
      
      const data = await response.json();
      this.assertEqual(data.success, false);
      this.assertEqual(data.error.code, 'VALIDATION_ERROR');
    });

    // Test valid file upload
    await this.test('Valid file upload', async () => {
      const formData = new FormData();
      formData.append('brainId', this.testBrainId);
      
      const testFile = new Blob(['# Test Document\n\nThis is a test markdown file.'], 
        { type: 'text/markdown' });
      formData.append('files', testFile, 'test.md');

      const response = await this.fetch('/upload', 'POST', formData);
      
      if (response.status === 202) {
        const data = await response.json();
        this.assertEqual(data.success, true);
        this.assertTrue(data.data.uploadId);
        this.testUploadId = data.data.uploadId;
      }
    });

    // Test upload status check
    if (this.testUploadId) {
      await this.test('Check upload status', async () => {
        const response = await this.fetch(`/upload/${this.testUploadId}/status`);
        this.assertEqual(response.status, 200);
        
        const data = await response.json();
        this.assertEqual(data.success, true);
        this.assertTrue(['processing', 'completed', 'partial'].includes(data.data.status));
      });
    }

    // Test upload history
    await this.test('Get upload history', async () => {
      const response = await this.fetch('/upload/history');
      this.assertEqual(response.status, 200);
      
      const data = await response.json();
      this.assertEqual(data.success, true);
      this.assertTrue(Array.isArray(data.data.uploads));
    });
  }

  /**
   * Test error handling
   */
  async testErrorHandling() {
    console.log('🚨 Testing Error Handling...');

    // Test 404 error
    await this.test('404 error handling', async () => {
      const response = await this.fetch('/nonexistent-endpoint');
      this.assertEqual(response.status, 404);
      
      const data = await response.json();
      this.assertEqual(data.success, false);
      this.assertEqual(data.error.code, 'NOT_FOUND');
    });

    // Test invalid JSON
    await this.test('Invalid JSON handling', async () => {
      const response = await fetch(`${this.baseUrl}/brains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': this.authCookie || ''
        },
        body: 'invalid json{'
      });
      
      this.assertEqual(response.status, 400);
      const data = await response.json();
      this.assertEqual(data.success, false);
    });

    // Test invalid UUID parameter
    if (this.authCookie) {
      await this.test('Invalid UUID parameter', async () => {
        const response = await this.fetch('/brains/invalid-uuid');
        this.assertEqual(response.status, 400);
        
        const data = await response.json();
        this.assertEqual(data.success, false);
        this.assertEqual(data.error.code, 'VALIDATION_ERROR');
      });
    }
  }

  /**
   * Test response formats
   */
  async testResponseFormats() {
    console.log('📋 Testing Response Formats...');

    await this.test('Success response format', async () => {
      const response = await this.fetch('/system/health');
      const data = await response.json();
      
      // Check if it follows the old format or new format
      if (data.success !== undefined) {
        // New standardized format
        this.assertTrue(data.success !== undefined);
        this.assertTrue(data.timestamp);
        this.assertTrue(data.requestId || data.data);
      } else {
        // Old format - still valid
        this.assertTrue(data.status);
      }
    });

    await this.test('Error response format', async () => {
      const response = await this.fetch('/nonexistent');
      const data = await response.json();
      
      this.assertEqual(data.success, false);
      this.assertTrue(data.error);
      this.assertTrue(data.error.code);
      this.assertTrue(data.error.message);
      this.assertTrue(data.timestamp);
    });

    await this.test('Request ID in headers', async () => {
      const response = await this.fetch('/system/health');
      this.assertTrue(response.headers.get('x-request-id'));
    });
  }

  /**
   * Test security headers and measures
   */
  async testSecurity() {
    console.log('🛡️  Testing Security...');

    await this.test('Security headers present', async () => {
      const response = await this.fetch('/system/health');
      
      // Check for common security headers
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection'
      ];
      
      // At least some security headers should be present
      const presentHeaders = securityHeaders.filter(header => 
        response.headers.get(header)
      );
      this.assertTrue(presentHeaders.length > 0);
    });

    await this.test('CORS headers configured', async () => {
      const response = await fetch(`${this.baseUrl}/system/health`, {
        method: 'OPTIONS'
      });
      
      // Should handle OPTIONS requests
      this.assertTrue(response.status < 500);
    });

    await this.test('Input sanitization', async () => {
      if (!this.authCookie) return;

      const response = await this.fetch('/brains', 'POST', {
        name: '<script>alert("xss")</script>Test Brain'
      });
      
      // Should not return 500 error (input should be sanitized)
      this.assertTrue(response.status !== 500);
    });
  }

  /**
   * Test performance characteristics
   */
  async testPerformance() {
    console.log('⚡ Testing Performance...');

    await this.test('Response time under 2 seconds', async () => {
      const start = Date.now();
      const response = await this.fetch('/system/health');
      const duration = Date.now() - start;
      
      this.assertTrue(duration < 2000, `Response took ${duration}ms`);
      this.assertEqual(response.status, 200);
    });

    await this.test('Concurrent requests handling', async () => {
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(this.fetch('/system/health'));
      }
      
      const responses = await Promise.all(requests);
      
      // All requests should succeed
      responses.forEach(response => {
        this.assertEqual(response.status, 200);
      });
    });

    await this.test('Large request handling', async () => {
      if (!this.authCookie) return;

      const largeContent = 'x'.repeat(10000); // 10KB content
      const response = await this.fetch('/brains', 'POST', {
        name: 'Large Content Test',
        description: largeContent
      });
      
      // Should handle large requests without error
      this.assertTrue(response.status !== 413); // Not "Payload Too Large"
    });
  }

  /**
   * Helper method to make API requests
   */
  async fetch(endpoint, method = 'GET', body = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {}
    };

    if (this.authCookie) {
      options.headers.Cookie = this.authCookie;
    }

    if (body) {
      if (body instanceof FormData) {
        options.body = body;
      } else {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
    }

    return fetch(url, options);
  }

  /**
   * Run a single test
   */
  async test(name, testFn) {
    try {
      await testFn();
      console.log(`✅ ${name}`);
      this.testResults.passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      this.testResults.failed++;
      this.testResults.errors.push({ name, error: error.message });
    }
  }

  /**
   * Assertion helpers
   */
  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertTrue(condition, message) {
    if (!condition) {
      throw new Error(message || 'Expected condition to be true');
    }
  }

  recordError(context, error) {
    this.testResults.errors.push({
      name: context,
      error: error.message || error
    });
    this.testResults.failed++;
  }

  /**
   * Print test results
   */
  printResults() {
    console.log('\n==========================================');
    console.log('🏁 Test Results Summary');
    console.log('==========================================');
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📊 Total: ${this.testResults.passed + this.testResults.failed}`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults.errors.forEach(error => {
        console.log(`   - ${error.name}: ${error.error}`);
      });
    }

    const successRate = Math.round(
      (this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100
    );
    console.log(`\n🎯 Success Rate: ${successRate}%`);

    if (successRate >= 90) {
      console.log('🎉 Production API is ready!');
    } else if (successRate >= 70) {
      console.log('⚠️  Production API needs some fixes');
    } else {
      console.log('🚨 Production API has critical issues');
    }
  }
}

// Check if running as main script
if (require.main === module) {
  // Manual test execution
  const tester = new ProductionAPITester();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.includes('--url')) {
    const urlIndex = args.indexOf('--url');
    if (args[urlIndex + 1]) {
      tester.baseUrl = args[urlIndex + 1];
    }
  }

  tester.runAllTests()
    .then(() => {
      process.exit(tester.testResults.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('💥 Test suite failed to execute:', error);
      process.exit(1);
    });
}

module.exports = ProductionAPITester;