-- Clean up duplicate files from previous uploads
-- This script identifies and removes duplicate files based on similar names

-- First, let's see what duplicates exist
SELECT 
    brain_id,
    REGEXP_REPLACE(file_name, '_\d+\.', '.') as base_name,
    COUNT(*) as duplicate_count,
    STRING_AGG(file_name, ', ' ORDER BY uploaded_at) as all_names,
    MIN(uploaded_at) as first_upload,
    MAX(uploaded_at) as last_upload
FROM files 
GROUP BY brain_id, REGEXP_REPLACE(file_name, '_\d+\.', '.')
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Remove duplicates, keeping only the most recent version
-- This will create a temporary table of files to delete
CREATE TEMP TABLE files_to_delete AS
WITH ranked_files AS (
    SELECT 
        id,
        file_name,
        brain_id,
        file_path,
        uploaded_at,
        REGEXP_REPLACE(file_name, '_\d+\.', '.') as base_name,
        ROW_NUMBER() OVER (
            PARTITION BY brain_id, REGEXP_REPLACE(file_name, '_\d+\.', '.') 
            ORDER BY uploaded_at DESC
        ) as rn
    FROM files
)
SELECT id, file_name, file_path
FROM ranked_files 
WHERE rn > 1;

-- Show what will be deleted (for review)
SELECT 
    COUNT(*) as files_to_delete,
    STRING_AGG(file_name, ', ') as file_names
FROM files_to_delete;

-- Uncomment the following lines to actually perform the deletion:
-- DELETE FROM stream_files WHERE file_id IN (SELECT id FROM files_to_delete);
-- DELETE FROM files WHERE id IN (SELECT id FROM files_to_delete);

-- Clean up temp table
DROP TABLE files_to_delete;