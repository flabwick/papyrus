# Clarity API Documentation

## Overview

The Clarity API is a production-ready knowledge management system that provides file upload, processing, and organization capabilities. This document describes all available endpoints, authentication methods, and usage patterns.

**Base URL**: `http://localhost:3001/api` (development)  
**Version**: 1.0.0  
**Authentication**: Session-based authentication with HTTP-only cookies

## Table of Contents

1. [Authentication](#authentication)
2. [Error Handling](#error-handling)
3. [Rate Limiting](#rate-limiting)
4. [File Upload System](#file-upload-system)
5. [API Endpoints](#api-endpoints)
6. [System Monitoring](#system-monitoring)
7. [Development Tools](#development-tools)

## Authentication

All API endpoints (except health checks) require authentication via session cookies.

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your-username",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "your-username",
      "storageUsed": 1024000,
      "storageQuota": 1073741824
    }
  },
  "message": "Login successful",
  "timestamp": "2025-01-01T12:00:00Z",
  "requestId": "uuid"
}
```

### Get Current User
```http
GET /api/auth/user
```

### Logout
```http
POST /api/auth/logout
```

### Check Auth Status
```http
GET /api/auth/status
```

## Error Handling

All API responses follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message",
  "timestamp": "2025-01-01T12:00:00Z",
  "requestId": "uuid"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  },
  "timestamp": "2025-01-01T12:00:00Z",
  "requestId": "uuid"
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Request validation failed
- `NOT_FOUND`: Requested resource not found
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Access denied
- `CONFLICT`: Resource conflict
- `TOO_MANY_REQUESTS`: Rate limit exceeded
- `FILE_TOO_LARGE`: Uploaded file exceeds size limit
- `UNSUPPORTED_FILE_TYPE`: File type not supported
- `STORAGE_QUOTA_EXCEEDED`: User storage limit exceeded
- `PROCESSING_ERROR`: File processing failed
- `INTERNAL_ERROR`: Server error

## Rate Limiting

The API implements rate limiting with the following limits:

- **General**: 100 requests per hour per IP
- **Authentication**: 5 failed attempts per IP per 15 minutes
- **File Upload**: 10 uploads per hour per user
- **Authenticated Users**: 1000 requests per hour per user

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Time when limit resets
- `Retry-After`: Seconds to wait when limit exceeded

## File Upload System

The unified file upload system supports multiple file types with background processing.

### Supported File Types

- **Text**: `.md`, `.txt`
- **Documents**: `.pdf`, `.epub`, `.docx`
- **Maximum file size**: 100MB per file
- **Maximum files per upload**: 10 files

### Upload Files
```http
POST /api/upload
Content-Type: multipart/form-data

brainId: uuid (required)
files: [file1, file2, ...] (required)
createSeparateCards: boolean (optional, default: true)
overwriteExisting: boolean (optional, default: false)
processingPriority: "normal"|"high"|"low" (optional, default: "normal")
forceBackground: boolean (optional, default: false)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uploadId": "unique-upload-id",
    "files": [
      {
        "fileId": "uuid",
        "filename": "document.pdf",
        "status": "queued|processing|completed|failed",
        "size": 1024000,
        "jobId": "uuid",
        "estimatedProcessingTime": "30 seconds"
      }
    ],
    "jobIds": ["uuid1", "uuid2"],
    "summary": {
      "total": 2,
      "queued": 1,
      "failed": 0
    }
  },
  "message": "Files uploaded successfully, processing started"
}
```

### Check Upload Status
```http
GET /api/upload/{uploadId}/status
```

### Check Job Status
```http
GET /api/upload/jobs/{jobId}/status
```

### Get Upload History
```http
GET /api/upload/history?limit=20&offset=0
```

### Retry Failed Jobs
```http
POST /api/upload/retry-failed
Content-Type: application/json

{
  "jobIds": ["uuid1", "uuid2"]
}
```

### Cancel Upload
```http
DELETE /api/upload/{uploadId}
```

## API Endpoints

### Brains

#### List User Brains
```http
GET /api/brains
```

#### Create Brain
```http
POST /api/brains
Content-Type: application/json

{
  "name": "My Brain"
}
```

#### Get Brain Details
```http
GET /api/brains/{brainId}
```

#### Get Brain Cards
```http
GET /api/brains/{brainId}/cards?page=1&limit=20&sort=created_at&order=desc
```

#### Delete Brain
```http
DELETE /api/brains/{brainId}
```

#### Sync Brain Files
```http
POST /api/brains/{brainId}/sync
```

### Cards

#### List Cards
```http
GET /api/cards?brainId=uuid&page=1&limit=20&sort=created_at&order=desc
```

#### Create Card
```http
POST /api/cards
Content-Type: application/json

{
  "brainId": "uuid",
  "title": "Card Title",
  "content": "# Card Content\n\nMarkdown content here..."
}
```

#### Get Card
```http
GET /api/cards/{cardId}
```

#### Update Card
```http
PUT /api/cards/{cardId}
Content-Type: application/json

{
  "title": "Updated Title",
  "content": "Updated content..."
}
```

#### Delete Card
```http
DELETE /api/cards/{cardId}
```

### Streams

#### List User Streams
```http
GET /api/streams?brainId=uuid
```

#### Create Stream
```http
POST /api/streams
Content-Type: application/json

{
  "brainId": "uuid",
  "name": "My Stream"
}
```

#### Get Stream
```http
GET /api/streams/{streamId}
```

#### Update Stream
```http
PUT /api/streams/{streamId}
Content-Type: application/json

{
  "name": "Updated Stream Name",
  "isFavorited": true
}
```

#### Delete Stream
```http
DELETE /api/streams/{streamId}
```

#### Add Card to Stream
```http
POST /api/streams/{streamId}/cards
Content-Type: application/json

{
  "cardId": "uuid",
  "position": 0
}
```

#### Remove Card from Stream
```http
DELETE /api/streams/{streamId}/cards/{cardId}
```

## System Monitoring

### Health Check
```http
GET /api/system/health
```

**Response:**
```json
{
  "status": "healthy|unhealthy",
  "timestamp": "2025-01-01T12:00:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "development",
  "components": {
    "database": true,
    "filesystem": true,
    "middleware": { ... }
  }
}
```

### Detailed Health Check
```http
GET /api/system/health/detailed
```

### System Statistics
```http
GET /api/system/stats
```

### Version Information
```http
GET /api/system/version
```

## Development Tools

The following endpoints are only available in development mode:

### Queue Statistics
```http
GET /api/upload/queue/stats
```

### Debug Job Queue
```http
GET /api/debug/jobs
```

### Recent Errors
```http
GET /api/debug/errors
```

### Test Upload
```http
POST /api/upload/test
Content-Type: multipart/form-data

files: [test files]
```

### Manual Cleanup
```http
POST /api/debug/cleanup
```

## Usage Examples

### Upload and Process Files

1. **Upload files**:
```javascript
const formData = new FormData();
formData.append('brainId', 'your-brain-uuid');
formData.append('files', file1);
formData.append('files', file2);
formData.append('createSeparateCards', 'true');

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
  credentials: 'include'
});

const result = await response.json();
const uploadId = result.data.uploadId;
```

2. **Check processing status**:
```javascript
const checkStatus = async () => {
  const response = await fetch(`/api/upload/${uploadId}/status`, {
    credentials: 'include'
  });
  const status = await response.json();
  
  if (status.data.status === 'completed') {
    console.log('All files processed!');
  } else if (status.data.status === 'processing') {
    console.log(`Progress: ${status.data.completedFiles}/${status.data.totalFiles}`);
    setTimeout(checkStatus, 5000); // Check again in 5 seconds
  }
};

checkStatus();
```

### Error Handling Example

```javascript
try {
  const response = await fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      brainId: 'uuid',
      title: 'Test Card',
      content: 'Test content'
    })
  });

  const result = await response.json();
  
  if (!result.success) {
    if (result.error.code === 'VALIDATION_ERROR') {
      console.error('Validation errors:', result.error.details);
    } else if (result.error.code === 'UNAUTHORIZED') {
      // Redirect to login
      window.location.href = '/login';
    } else {
      console.error('API Error:', result.error.message);
    }
  } else {
    console.log('Card created:', result.data);
  }
} catch (error) {
  console.error('Network error:', error);
}
```

## Best Practices

1. **Always check response.success** before accessing data
2. **Handle rate limiting** by respecting Retry-After headers
3. **Use upload status polling** for large file uploads
4. **Implement proper error handling** for all error codes
5. **Include credentials: 'include'** for authenticated requests
6. **Use appropriate HTTP methods** (GET, POST, PUT, DELETE)
7. **Validate data client-side** before sending to API
8. **Monitor system health** using health check endpoints

## Environment Variables

Configure the API using these environment variables:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5433
DB_NAME=brain6
DB_USER=brain6_user
DB_PASSWORD=your-password

# File Upload Configuration
MAX_FILE_SIZE_MB=100
MAX_FILES_PER_UPLOAD=10
UPLOAD_TIMEOUT_MINUTES=5

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_HOUR=100
RATE_LIMIT_UPLOADS_PER_HOUR=10

# Logging
LOG_LEVEL=info
LOG_TO_FILES=true
LOG_DIRECTORY=./logs

# Security
SESSION_SECRET=your-session-secret
FRONTEND_URL=http://localhost:3000
```

## Support

For issues and questions:
- Check system health: `GET /api/system/health`
- View error logs: `GET /api/debug/errors` (development only)
- Monitor queue status: `GET /api/upload/queue/stats`

---

*Generated automatically from Clarity API v1.0.0*