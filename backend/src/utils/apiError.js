/**
 * Custom error classes for standardized API error handling
 */

class ApiError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // This is a known error, not a system failure
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      },
      timestamp: new Date().toISOString()
    };
  }
}

class ValidationError extends ApiError {
  constructor(message = 'Validation failed', fieldErrors = {}) {
    super(message, 400, 'VALIDATION_ERROR', fieldErrors);
    this.fieldErrors = fieldErrors;
  }
}

class NotFoundError extends ApiError {
  constructor(resource = 'Resource', resourceId = null) {
    const message = resourceId 
      ? `${resource} with ID '${resourceId}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', { resource, resourceId });
  }
}

class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends ApiError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends ApiError {
  constructor(message = 'Resource conflict', conflictDetails = null) {
    super(message, 409, 'CONFLICT', conflictDetails);
  }
}

class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 429, 'TOO_MANY_REQUESTS', { retryAfter });
  }
}

class FileTooLargeError extends ApiError {
  constructor(maxSize, actualSize = null) {
    const message = actualSize 
      ? `File size ${actualSize} exceeds maximum allowed size of ${maxSize}`
      : `File exceeds maximum allowed size of ${maxSize}`;
    super(message, 413, 'FILE_TOO_LARGE', { maxSize, actualSize });
  }
}

class UnsupportedFileTypeError extends ApiError {
  constructor(fileType, supportedTypes = []) {
    const message = `File type '${fileType}' is not supported. Supported types: ${supportedTypes.join(', ')}`;
    super(message, 400, 'UNSUPPORTED_FILE_TYPE', { fileType, supportedTypes });
  }
}

class StorageQuotaExceededError extends ApiError {
  constructor(quotaSize, currentUsage) {
    const message = `Storage quota of ${quotaSize} exceeded. Current usage: ${currentUsage}`;
    super(message, 413, 'STORAGE_QUOTA_EXCEEDED', { quotaSize, currentUsage });
  }
}

class ProcessingError extends ApiError {
  constructor(message = 'File processing failed', processingDetails = null) {
    super(message, 422, 'PROCESSING_ERROR', processingDetails);
  }
}

// Utility functions for error handling
const isOperationalError = (error) => {
  return error instanceof ApiError && error.isOperational;
};

const createValidationError = (fieldErrors) => {
  const errorMessages = Object.entries(fieldErrors)
    .map(([field, message]) => `${field}: ${message}`)
    .join(', ');
  
  return new ValidationError(`Validation failed: ${errorMessages}`, fieldErrors);
};

module.exports = {
  ApiError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TooManyRequestsError,
  FileTooLargeError,
  UnsupportedFileTypeError,
  StorageQuotaExceededError,
  ProcessingError,
  isOperationalError,
  createValidationError
};