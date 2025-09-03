/**
 * Comprehensive logging system with file rotation and structured logging
 */

const fs = require('fs-extra');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    this.currentLevel = this.levels[process.env.LOG_LEVEL?.toUpperCase()] || this.levels.INFO;
    this.logToFiles = process.env.LOG_TO_FILES !== 'false';
    
    // Ensure log directory exists
    this.initializeLogDirectory();
    
    // Set up log file rotation (daily)
    this.setupLogRotation();
  }

  async initializeLogDirectory() {
    try {
      await fs.ensureDir(this.logDir);
    } catch (error) {
      console.error('Failed to create logs directory:', error);
    }
  }

  setupLogRotation() {
    // Clean up old log files daily
    setInterval(() => {
      this.rotateLogFiles();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  async rotateLogFiles() {
    try {
      const files = await fs.readdir(this.logDir);
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.remove(filePath);
          console.log(`Rotated old log file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error during log rotation:', error);
    }
  }

  formatLogEntry(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    
    // Base log entry
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };

    // Add process information in development
    if (process.env.NODE_ENV === 'development') {
      logEntry.pid = process.pid;
    }

    return logEntry;
  }

  getLogFileName(type) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `${type}-${date}.log`);
  }

  async writeToFile(filename, entry) {
    if (!this.logToFiles) return;

    try {
      const logLine = JSON.stringify(entry) + '\n';
      await fs.appendFile(filename, logLine);
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('Failed to write to log file:', error);
      console.log('Log entry:', entry);
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.currentLevel;
  }

  async log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const entry = this.formatLogEntry(level, message, meta);
    
    // Always log to console with color coding
    this.logToConsole(level, entry);
    
    // Write to files
    if (this.logToFiles) {
      // Write to combined log
      await this.writeToFile(this.getLogFileName('combined'), entry);
      
      // Write to level-specific log for errors and warnings
      if (level === 'ERROR') {
        await this.writeToFile(this.getLogFileName('error'), entry);
      }
    }
  }

  logToConsole(level, entry) {
    const colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow
      INFO: '\x1b[36m',  // Cyan
      DEBUG: '\x1b[35m'  // Magenta
    };
    const reset = '\x1b[0m';
    
    const color = colors[level] || '';
    const prefix = `${color}[${entry.timestamp}] ${level}:${reset}`;
    
    console.log(`${prefix} ${entry.message}`);
    
    // Log additional metadata if present
    if (Object.keys(entry).length > 3) { // More than timestamp, level, message
      const metadata = { ...entry };
      delete metadata.timestamp;
      delete metadata.level;
      delete metadata.message;
      delete metadata.pid;
      
      if (Object.keys(metadata).length > 0) {
        console.log(`${color}    Metadata:${reset}`, JSON.stringify(metadata, null, 2));
      }
    }
  }

  // Convenience methods
  error(message, meta = {}) {
    return this.log('ERROR', message, meta);
  }

  warn(message, meta = {}) {
    return this.log('WARN', message, meta);
  }

  info(message, meta = {}) {
    return this.log('INFO', message, meta);
  }

  debug(message, meta = {}) {
    return this.log('DEBUG', message, meta);
  }

  // HTTP request logging
  async logRequest(req, res, responseTime) {
    const entry = {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      requestId: req.requestId,
      userId: req.session?.userId || null
    };

    // Log request headers in development
    if (process.env.NODE_ENV === 'development') {
      entry.headers = req.headers;
    }

    const level = res.statusCode >= 400 ? 'WARN' : 'INFO';
    await this.log(level, `${req.method} ${req.url} - ${res.statusCode}`, entry);

    // Write to access log
    if (this.logToFiles) {
      await this.writeToFile(this.getLogFileName('access'), entry);
    }
  }

  // Error logging with stack trace
  async logError(error, context = {}) {
    const entry = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      ...context
    };

    await this.log('ERROR', error.message, entry);
  }

  // Database operation logging
  async logDatabase(operation, tableName, duration, error = null) {
    const entry = {
      operation,
      table: tableName,
      duration: `${duration}ms`,
      success: !error
    };

    if (error) {
      entry.error = {
        message: error.message,
        code: error.code
      };
    }

    const level = error ? 'ERROR' : 'DEBUG';
    await this.log(level, `Database ${operation} on ${tableName}`, entry);
  }

  // File operation logging
  async logFileOperation(operation, filePath, success = true, error = null) {
    const entry = {
      operation,
      filePath,
      success
    };

    if (error) {
      entry.error = {
        message: error.message,
        code: error.code
      };
    }

    const level = error ? 'ERROR' : 'DEBUG';
    await this.log(level, `File ${operation}: ${filePath}`, entry);
  }

  // Job processing logging
  async logJob(jobId, jobType, status, duration = null, error = null) {
    const entry = {
      jobId,
      jobType,
      status,
      duration: duration ? `${duration}ms` : null
    };

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack
      };
    }

    const level = status === 'failed' ? 'ERROR' : 'INFO';
    await this.log(level, `Job ${jobId} (${jobType}): ${status}`, entry);
  }

  // System metrics logging
  async logMetrics() {
    const memUsage = process.memoryUsage();
    const entry = {
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      },
      uptime: `${Math.round(process.uptime())}s`
    };

    await this.log('INFO', 'System metrics', entry);
  }
}

// Create singleton instance
const logger = new Logger();

// Express middleware for request logging
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    logger.logRequest(req, res, responseTime);
    originalEnd.apply(this, args);
  };
  
  next();
};

module.exports = {
  logger,
  requestLogger
};