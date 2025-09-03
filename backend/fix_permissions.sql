-- Fix permissions for stream_files table and related objects
-- This grants the necessary permissions to papyrus_user

-- Grant permissions on the stream_files table
GRANT SELECT, INSERT, UPDATE, DELETE ON stream_files TO papyrus_user;

-- Grant permissions on the sequence (for auto-incrementing IDs if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO papyrus_user;

-- Grant permissions on the view we created
GRANT SELECT ON stream_items_view TO papyrus_user;

-- Verify current permissions
\dp stream_files
\dp stream_items_view