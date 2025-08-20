-- Initialize database schema for Clip Live
-- This file will be executed when PostgreSQL starts for the first time

-- Create the main database if it doesn't exist
-- (this is handled by POSTGRES_DB environment variable)

-- Extensions that might be useful
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- The actual schema will be created by Drizzle migrations
-- This file is just for any initial setup that might be needed
