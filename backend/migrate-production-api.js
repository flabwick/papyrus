require('dotenv').config();
const { pool } = require('./src/models/database');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting production API schema migration...');
    
    // Files table
    console.log('Creating files table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size BIGINT NOT NULL,
        file_path VARCHAR(800) NOT NULL,
        file_hash VARCHAR(64),
        upload_method VARCHAR(20) DEFAULT 'web_upload',
        processing_status VARCHAR(20) DEFAULT 'pending',
        processing_error TEXT,
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Processing Jobs table
    console.log('Creating processing_jobs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS processing_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        brain_id UUID REFERENCES brains(id) ON DELETE CASCADE,
        job_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        input_data JSONB,
        output_data JSONB,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Upload Sessions table
    console.log('Creating upload_sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
        upload_id VARCHAR(50) UNIQUE NOT NULL,
        total_files INTEGER NOT NULL DEFAULT 0,
        completed_files INTEGER DEFAULT 0,
        failed_files INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'processing',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Card Versions table
    console.log('Creating card_versions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS card_versions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        content TEXT NOT NULL,
        is_active BOOLEAN DEFAULT false,
        created_by_user_id UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(card_id, version_number)
      );
    `);

    // Create indexes
    console.log('Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_files_brain_id ON files(brain_id);',
      'CREATE INDEX IF NOT EXISTS idx_files_processing_status ON files(processing_status);',
      'CREATE INDEX IF NOT EXISTS idx_files_upload_method ON files(upload_method);',
      'CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files(uploaded_at);',
      'CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status, created_at);',
      'CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON processing_jobs(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_processing_jobs_brain_id ON processing_jobs(brain_id);',
      'CREATE INDEX IF NOT EXISTS idx_processing_jobs_type ON processing_jobs(job_type);',
      'CREATE INDEX IF NOT EXISTS idx_processing_jobs_priority ON processing_jobs(priority DESC, created_at);',
      'CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_id ON upload_sessions(upload_id);',
      'CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id ON upload_sessions(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_upload_sessions_brain_id ON upload_sessions(brain_id);',
      'CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);',
      'CREATE INDEX IF NOT EXISTS idx_card_versions_card_id ON card_versions(card_id);',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_card_versions_one_active ON card_versions(card_id) WHERE is_active = true;'
    ];

    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }

    // Create update triggers
    console.log('Creating update triggers...');
    await client.query(`
      DROP TRIGGER IF EXISTS update_files_updated_at ON files;
      CREATE TRIGGER update_files_updated_at 
        BEFORE UPDATE ON files
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_processing_jobs_updated_at ON processing_jobs;
      CREATE TRIGGER update_processing_jobs_updated_at 
        BEFORE UPDATE ON processing_jobs
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_upload_sessions_updated_at ON upload_sessions;
      CREATE TRIGGER update_upload_sessions_updated_at 
        BEFORE UPDATE ON upload_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    // Create upload progress update function
    console.log('Creating upload progress update function...');
    await client.query(`
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
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_upload_progress_trigger ON processing_jobs;
      CREATE TRIGGER update_upload_progress_trigger
        AFTER UPDATE ON processing_jobs
        FOR EACH ROW
        WHEN (NEW.input_data ? 'uploadId' AND (OLD.status != NEW.status))
        EXECUTE FUNCTION update_upload_session_progress();
    `);

    console.log('✅ Production API schema migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration error:', error);
    process.exit(1);
  });