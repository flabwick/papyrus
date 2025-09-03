-- Simple fix for title constraint using postgres superuser
\c brain6;

-- Remove NOT NULL constraint from title column
ALTER TABLE cards ALTER COLUMN title DROP NOT NULL;

-- Verify the change
\d cards;