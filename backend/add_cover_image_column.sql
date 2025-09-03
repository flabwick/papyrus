-- Add cover_image_path column to files table
ALTER TABLE files 
ADD COLUMN IF NOT EXISTS cover_image_path TEXT;

-- Grant permissions
GRANT SELECT, UPDATE ON files TO papyrus_user;