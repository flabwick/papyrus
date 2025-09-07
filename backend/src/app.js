const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./models/database');

const app = express();

// Middleware setup (order is important)
app.use(express.json({ limit: '50mb' }));

// Environment-aware CORS configuration
const getCorsOrigins = () => {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (isDevelopment) {
    return [
      'http://localhost:3001',
      'http://localhost:4201',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:4201'
    ];
  } else {
    return [
      'https://dev.jimboslice.xyz',
      'https://api-dev.jimboslice.xyz'
    ];
  }
};

app.use(cors({
  origin: getCorsOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow embedding for development
}));

// Request logging
app.use(morgan('combined'));

// Session configuration
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'web_sessions',
    createTableIfMissing: false // Table should already exist
  }),
  secret: process.env.SESSION_SECRET || 'papyrus-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true, // Prevent XSS attacks
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax' // CSRF protection
  },
  name: 'papyrus.sid' // Custom session cookie name
}));

// Production API Response Helpers
app.use((req, res, next) => {
  const crypto = require('crypto');
  req.requestId = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-ID', req.requestId);
  
  // Success response helper
  res.apiSuccess = (data, message = null) => {
    return res.json({
      success: true,
      data: data,
      message: message,
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  };
  
  // Error response helper
  res.apiError = (statusCode, code, message, details = null) => {
    return res.status(statusCode).json({
      success: false,
      error: {
        code: code,
        message: message,
        details: details
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  };
  
  next();
});

// Production API endpoints FIRST (before other routes)
app.get('/api/test', (req, res) => {
  res.apiSuccess({
    message: 'Papyrus API is running!',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    session: req.session ? {
      id: req.sessionID,
      userId: req.session.userId || null
    } : null
  });
});

app.get('/api/system/health', async (req, res) => {
  try {
    const { healthCheck } = require('./models/database');
    const isHealthy = await healthCheck();
    
    res.apiSuccess({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      components: {
        database: isHealthy,
        server: true
      }
    });
  } catch (error) {
    res.apiError(503, 'HEALTH_CHECK_FAILED', 'Health check failed', error.message);
  }
});

app.get('/api/system/stats', (req, res) => {
  const memUsage = process.memoryUsage();
  res.apiSuccess({
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB'
    },
    platform: process.platform,
    nodeVersion: process.version
  });
});

app.get('/api/system/version', (req, res) => {
  res.apiSuccess({
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    node: process.version,
    platform: process.platform
  });
});

// Application routes AFTER system endpoints
try {
  console.log('📚 Loading application routes...');
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth routes loaded');
  app.use('/api/libraries', require('./routes/libraries'));
  console.log('✅ Library routes loaded');
  app.use('/api/pages', require('./routes/pages'));
  console.log('✅ Page routes loaded');
  app.use('/api/workspaces', require('./routes/workspaces'));
  console.log('✅ Workspace routes loaded');
  app.use('/api/forms', require('./routes/forms'));
  console.log('✅ Form routes loaded');
  app.use('/api/ai', require('./routes/ai'));
  console.log('✅ AI routes loaded');
} catch (error) {
  console.error('❌ Error loading routes:', error);
  throw error;
}

// Keep existing test endpoint for backward compatibility
app.get('/api/health', async (req, res) => {
  try {
    const { healthCheck } = require('./models/database');
    const isHealthy = await healthCheck();
    
    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: isHealthy
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      message: error.message
    });
  }
});

// 404 handler for API routes
app.use('/api', (req, res, next) => {
  if (!res.headersSent) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `The endpoint ${req.method} ${req.path} does not exist`
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  
  if (res.headersSent) {
    return next(error);
  }
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId || 'unknown'
  });
});

module.exports = app;
