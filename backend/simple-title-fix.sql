-- Simple fix for title constraint using postgres superuser
\c papyrus;

-- Remove NOT NULL constraint from title column
ALTER TABLE cards ALTER COLUMN title DROP NOT NULL;

-- Verify the change
\d cards;