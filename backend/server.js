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
  console.log('  GET  /api/brains        - List user brains');
  console.log('  POST /api/brains        - Create new brain');
  console.log('  GET  /api/brains/:id    - Get specific brain');
  console.log('  GET  /api/brains/:id/cards - Get brain cards');
  console.log('  DELETE /api/brains/:id  - Delete brain');
  console.log('  POST /api/brains/:id/sync - Sync brain files');
  console.log('  GET  /api/cards          - List cards');
  console.log('  POST /api/cards          - Create card');
  console.log('  GET  /api/cards/:id      - Get card');
  console.log('  PUT  /api/cards/:id      - Update card');
  console.log('  DELETE /api/cards/:id    - Delete card');
  console.log('  GET  /api/streams        - List user streams');
  console.log('  POST /api/streams        - Create new stream');
  console.log('  GET  /api/streams/:id    - Get specific stream');
  console.log('  PUT  /api/streams/:id    - Update stream');
  console.log('  DELETE /api/streams/:id  - Delete stream');
  console.log('  GET  /api/streams/:id/cards - Get stream cards');
  console.log('  POST /api/streams/:id/cards - Add card to stream');
  console.log('  PUT  /api/streams/:id/cards/:cardId - Update card in stream');
  console.log('  DELETE /api/streams/:id/cards/:cardId - Remove card from stream');
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