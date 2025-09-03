/**
 * Response formatter middleware that standardizes all API responses
 * Adds helper methods to the Express response object
 */

const { v4: uuidv4 } = require('crypto');
const { ApiError } = require('../utils/apiError');

/**
 * Middleware that adds standardized response methods to Express res object
 */
const responseFormatter = (req, res, next) => {
  // Generate unique request ID for tracking
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  
  // Set request ID header for client
  res.setHeader('X-Request-ID', requestId);

  /**
   * Send success response with standardized format
   * @param {*} data - Response data
   * @param {string} message - Optional success message
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  res.apiSuccess = function(data, message = null, statusCode = 200) {
    const response = {
      success: true,
      data: data,
      timestamp: new Date().toISOString(),
      requestId: requestId
    };

    if (message) {
      response.message = message;
    }

    return this.status(statusCode).json(response);
  };

  /**
   * Send error response with standardized format
   * @param {Error|ApiError|string} error - Error object or message
   * @param {number} statusCode - HTTP status code (default: 500)
   */
  res.apiError = function(error, statusCode = 500) {
    let errorResponse;

    if (error instanceof ApiError) {
      statusCode = error.statusCode;
      errorResponse = error.toJSON();
    } else if (error instanceof Error) {
      errorResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
          details: process.env.NODE_ENV === 'development' ? {
            stack: error.stack
          } : null
        },
        timestamp: new Date().toISOString()
      };
    } else if (typeof error === 'string') {
      errorResponse = {
        success: false,
        error: {
          code: 'GENERIC_ERROR',
          message: error
        },
        timestamp: new Date().toISOString()
      };
    } else {
      errorResponse = {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unknown error occurred'
        },
        timestamp: new Date().toISOString()
      };
    }

    // Add request ID to error response
    errorResponse.requestId = requestId;

    return this.status(statusCode).json(errorResponse);
  };

  /**
   * Send not found error response
   * @param {string} resource - Name of the resource that wasn't found
   * @param {string} resourceId - ID of the resource (optional)
   */
  res.apiNotFound = function(resource = 'Resource', resourceId = null) {
    const message = resourceId 
      ? `${resource} with ID '${resourceId}' not found`
      : `${resource} not found`;

    const response = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: message,
        details: { resource, resourceId }
      },
      timestamp: new Date().toISOString(),
      requestId: requestId
    };

    return this.status(404).json(response);
  };

  next();
};

module.exports = responseFormatter;