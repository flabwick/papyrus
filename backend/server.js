require('dotenv').config(); // Load environment variables first

const app = require('./src/app-working');
const { healthCheck, closePool } = require('./src/models/database');
const fileWatcher = require('./src/services/fileWatcher');

const PORT = process.env.PORT || 3001; // Use port 3001 for API server

// Start server and file watcher
const server = app.listen(PORT, async () => {
  console.log(`🚀 Clarity API Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Check database connection
  const isHealthy = await healthCheck();
  if (isHealthy) {
    console.log('✅ Database connection established');
  } else {
    console.log('❌ Database connection failed');
  }
  
  // Start file watcher if not in test mode
  if (process.env.NODE_ENV !== 'test') {
    fileWatcher.start();
  }
  
  console.log('📚 Available endpoints:');
  console.log('  GET  /api/health         - Health check');
  console.log('  GET  /api/test          - Test endpoint');
  console.log('  POST /api/auth/login    - User login');
  console.log('  GET  /api/auth/user     - Get current user');
  console.log('  POST /api/auth/logout   - User logout');
  console.log('  GET  /api/auth/status   - Auth status');
  console.log('  GET  /api/libraries        - List user libraries');
  console.log('  POST /api/libraries        - Create new library');
  console.log('  GET  /api/libraries/:id    - Get specific library');
  console.log('  GET  /api/libraries/:id/cards - Get library cards');
  console.log('  DELETE /api/libraries/:id  - Delete library');
  console.log('  POST /api/libraries/:id/sync - Sync library files');
  console.log('  GET  /api/pages          - List pages');
  console.log('  POST /api/pages          - Create page');
  console.log('  GET  /api/pages/:id      - Get page');
  console.log('  PUT  /api/pages/:id      - Update page');
  console.log('  DELETE /api/pages/:id    - Delete page');
  console.log('  GET  /api/workspaces     - List user workspaces');
  console.log('  POST /api/workspaces     - Create new workspace');
  console.log('  GET  /api/workspaces/:id - Get specific workspace');
  console.log('  PUT  /api/workspaces/:id - Update workspace');
  console.log('  DELETE /api/workspaces/:id - Delete workspace');
  console.log('  GET  /api/workspaces/:id/cards - Get workspace pages');
  console.log('  POST /api/workspaces/:id/cards - Add page to workspace');
  console.log('  PUT  /api/workspaces/:id/cards/:cardId - Update page in workspace');
  console.log('  DELETE /api/workspaces/:id/cards/:cardId - Remove page from workspace');
});

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Stop accepting new connections
    server.close(async () => {
      console.log('📡 HTTP server closed');
      
      // Stop file watcher
      await fileWatcher.stop();
      
      // Close database pool
      await closePool();
      
      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.log('⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});