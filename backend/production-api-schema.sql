-- Production API Schema Extensions
-- Additional tables for file upload pipeline and job processing

-- Files table - track uploaded files and their processing status
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- file extension without dot
    file_size BIGINT NOT NULL,
    file_path VARCHAR(800) NOT NULL, -- full path to file in filesystem
    file_hash VARCHAR(64), -- SHA-256 hash for integrity checking
    upload_method VARCHAR(20) DEFAULT 'web_upload', -- 'web_upload', 'ssh_import', 'ide_upload'
    processing_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    processing_error TEXT, -- error message if processing failed
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Processing Jobs table - background job queue and status
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    brain_id UUID REFERENCES brains(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL, -- 'FILE_PROCESSING', 'LINK_RESOLUTION', 'STORAGE_CALCULATION'
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
    input_data JSONB, -- job input parameters
    output_data JSONB, -- job results
    error_message TEXT, -- error details if failed
    retry_count INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0, -- higher numbers = higher priority
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Upload Sessions table - track multi-file upload operations
CREATE TABLE IF NOT EXISTS upload_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
    upload_id VARCHAR(50) UNIQUE NOT NULL, -- client-friendly upload identifier
    total_files INTEGER NOT NULL DEFAULT 0,
    completed_files INTEGER DEFAULT 0,
    failed_files INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'processing', -- 'processing', 'completed', 'failed', 'partial'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Card Versions table - version history for cards (if not exists)
CREATE TABLE IF NOT EXISTS card_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL, -- full markdown content
    is_active BOOLEAN DEFAULT false, -- only one version should be active
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(card_id, version_number)
);

-- API Request Logs table - for rate limiting and monitoring (optional)
CREATE TABLE IF NOT EXISTS api_request_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    method VARCHAR(10) NOT NULL,
    endpoint VARCHAR(200) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size BIGINT,
    response_size BIGINT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance

-- Files table indexes
CREATE INDEX IF NOT EXISTS idx_files_brain_id ON files(brain_id);
CREATE INDEX IF NOT EXISTS idx_files_processing_status ON files(processing_status);
CREATE INDEX IF NOT EXISTS idx_files_upload_method ON files(upload_method);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_files_file_path ON files(file_path);
CREATE INDEX IF NOT EXISTS idx_files_file_hash ON files(file_hash);

-- Processing Jobs table indexes
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_brain_id ON processing_jobs(brain_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_type ON processing_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_priority ON processing_jobs(priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON processing_jobs(created_at);

-- Upload Sessions table indexes
CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_id ON upload_sessions(upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id ON upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_brain_id ON upload_sessions(brain_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_created_at ON upload_sessions(created_at);

-- Card Versions table indexes
CREATE INDEX IF NOT EXISTS idx_card_versions_card_id ON card_versions(card_id);
CREATE INDEX IF NOT EXISTS idx_card_versions_active ON card_versions(card_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_card_versions_created_at ON card_versions(created_at);

-- API Request Logs table indexes (for rate limiting and monitoring)
CREATE INDEX IF NOT EXISTS idx_api_request_logs_user_id ON api_request_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_ip_address ON api_request_logs(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_endpoint ON api_request_logs(endpoint, created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs(created_at);

-- Update timestamp triggers for new tables
CREATE TRIGGER IF NOT EXISTS update_files_updated_at 
    BEFORE UPDATE ON files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_processing_jobs_updated_at 
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_upload_sessions_updated_at 
    BEFORE UPDATE ON upload_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add constraints and checks

-- Ensure job status transitions are valid
ALTER TABLE processing_jobs 
ADD CONSTRAINT IF NOT EXISTS check_job_status 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- Ensure upload session status is valid
ALTER TABLE upload_sessions 
ADD CONSTRAINT IF NOT EXISTS check_upload_status 
CHECK (status IN ('processing', 'completed', 'failed', 'partial'));

-- Ensure file processing status is valid
ALTER TABLE files 
ADD CONSTRAINT IF NOT EXISTS check_processing_status 
CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'));

-- Ensure upload method is valid
ALTER TABLE files 
ADD CONSTRAINT IF NOT EXISTS check_upload_method 
CHECK (upload_method IN ('web_upload', 'ssh_import', 'ide_upload'));

-- Ensure only one active version per card
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_versions_one_active 
ON card_versions(card_id) WHERE is_active = true;

-- Ensure file sizes are positive
ALTER TABLE files 
ADD CONSTRAINT IF NOT EXISTS check_file_size_positive 
CHECK (file_size >= 0);

-- Ensure retry count is non-negative
ALTER TABLE processing_jobs 
ADD CONSTRAINT IF NOT EXISTS check_retry_count_non_negative 
CHECK (retry_count >= 0);

-- Ensure file counts are non-negative
ALTER TABLE upload_sessions 
ADD CONSTRAINT IF NOT EXISTS check_file_counts_non_negative 
CHECK (total_files >= 0 AND completed_files >= 0 AND failed_files >= 0);

-- Comments for documentation
COMMENT ON TABLE files IS 'Tracks all uploaded files and their processing status';
COMMENT ON TABLE processing_jobs IS 'Background job queue for file processing and other async operations';
COMMENT ON TABLE upload_sessions IS 'Tracks multi-file upload operations and their progress';
COMMENT ON TABLE card_versions IS 'Version history for card content changes';
COMMENT ON TABLE api_request_logs IS 'API request logs for monitoring and rate limiting';

COMMENT ON COLUMN files.file_hash IS 'SHA-256 hash for file integrity verification';
COMMENT ON COLUMN files.upload_method IS 'How the file was uploaded: web_upload, ssh_import, or ide_upload';
COMMENT ON COLUMN processing_jobs.priority IS 'Job priority (higher numbers processed first)';
COMMENT ON COLUMN processing_jobs.input_data IS 'JSON data required for job execution';
COMMENT ON COLUMN processing_jobs.output_data IS 'JSON results from job execution';
COMMENT ON COLUMN upload_sessions.upload_id IS 'Client-friendly identifier for tracking upload progress';
COMMENT ON COLUMN card_versions.is_active IS 'Only one version per card should be active';

-- Insert initial data if needed
-- This ensures the admin user has proper storage settings
UPDATE users 
SET storage_quota = COALESCE(storage_quota, 1073741824), -- 1GB default
    storage_used = COALESCE(storage_used, 0)
WHERE storage_quota IS NULL OR storage_used IS NULL;

-- Create a function to automatically update upload session progress
CREATE OR REPLACE FUNCTION update_upload_session_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Update upload session when a job completes
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE upload_sessions 
        SET completed_files = completed_files + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE upload_id = (NEW.input_data->>'uploadId')::text;
    ELSIF NEW.status = 'failed' AND OLD.status != 'failed' THEN
        UPDATE upload_sessions 
        SET failed_files = failed_files + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE upload_id = (NEW.input_data->>'uploadId')::text;
    END IF;
    
    -- Update overall session status
    UPDATE upload_sessions 
    SET status = CASE 
        WHEN completed_files + failed_files >= total_files THEN 
            CASE WHEN failed_files = 0 THEN 'completed' ELSE 'partial' END
        ELSE 'processing'
    END,
    completed_at = CASE 
        WHEN completed_files + failed_files >= total_files THEN CURRENT_TIMESTAMP
        ELSE completed_at
    END
    WHERE upload_id = (NEW.input_data->>'uploadId')::text;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update upload session progress
DROP TRIGGER IF EXISTS update_upload_progress_trigger ON processing_jobs;
CREATE TRIGGER update_upload_progress_trigger
    AFTER UPDATE ON processing_jobs
    FOR EACH ROW
    WHEN (NEW.input_data ? 'uploadId' AND (OLD.status != NEW.status))
    EXECUTE FUNCTION update_upload_session_progress();