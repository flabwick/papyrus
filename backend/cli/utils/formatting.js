/**
 * CLI Formatting Utilities
 */

const chalk = require('chalk');

// Color functions (will work even if chalk is not available)
const colorize = {
  success: (text) => process.stdout.isTTY && !process.env.NO_COLOR ? chalk.green(text) : text,
  error: (text) => process.stdout.isTTY && !process.env.NO_COLOR ? chalk.red(text) : text,
  warning: (text) => process.stdout.isTTY && !process.env.NO_COLOR ? chalk.yellow(text) : text,
  info: (text) => process.stdout.isTTY && !process.env.NO_COLOR ? chalk.blue(text) : text,
  dim: (text) => process.stdout.isTTY && !process.env.NO_COLOR ? chalk.dim(text) : text,
  bold: (text) => process.stdout.isTTY && !process.env.NO_COLOR ? chalk.bold(text) : text
};

/**
 * Format data as a simple table
 */
function formatTable(data, options = {}) {
  if (!data || data.length === 0) {
    return 'No data to display';
  }

  const headers = Object.keys(data[0]);
  const maxWidths = {};
  
  // Calculate maximum width for each column
  headers.forEach(header => {
    maxWidths[header] = Math.max(
      header.length,
      ...data.map(row => String(row[header] || '').length)
    );
  });

  // Create separator line
  const separator = headers.map(header => '-'.repeat(maxWidths[header])).join('-+-');
  
  // Format header row
  const headerRow = headers.map(header => 
    header.padEnd(maxWidths[header])
  ).join(' | ');
  
  // Format data rows
  const dataRows = data.map(row => 
    headers.map(header => 
      String(row[header] || '').padEnd(maxWidths[header])
    ).join(' | ')
  );

  // Combine all rows
  return [
    colorize.bold(headerRow),
    separator,
    ...dataRows
  ].join('\n');
}

/**
 * Format JSON output with proper indentation
 */
function formatJson(data, indent = 2) {
  return JSON.stringify(data, null, indent);
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human readable
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Format a progress bar
 */
function formatProgressBar(current, total, width = 40) {
  const percentage = Math.floor((current / total) * 100);
  const filled = Math.floor((current / total) * width);
  const empty = width - filled;
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage}% (${current}/${total})`;
}

/**
 * Create a simple spinner
 */
class Spinner {
  constructor(text = 'Loading...') {
    this.text = text;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.interval = null;
    this.current = 0;
  }

  start() {
    if (this.interval) return;
    
    this.interval = setInterval(() => {
      process.stdout.write(`\r${this.frames[this.current]} ${this.text}`);
      this.current = (this.current + 1) % this.frames.length;
    }, 80);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write('\r');
    }
  }

  succeed(text) {
    this.stop();
    console.log(colorize.success(`✅ ${text || this.text}`));
  }

  fail(text) {
    this.stop();
    console.log(colorize.error(`❌ ${text || this.text}`));
  }

  warn(text) {
    this.stop();
    console.log(colorize.warning(`⚠️  ${text || this.text}`));
  }

  info(text) {
    this.stop();
    console.log(colorize.info(`ℹ️  ${text || this.text}`));
  }
}

module.exports = {
  colorize,
  formatTable,
  formatJson,
  formatBytes,
  formatDuration,
  formatProgressBar,
  Spinner
};