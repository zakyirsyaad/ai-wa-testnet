-- Add personalized training columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS personalized_model_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fine_tune_job_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_training_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_data_size INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_training BOOLEAN DEFAULT FALSE;

-- Create training_sessions table to track training history
CREATE TABLE IF NOT EXISTS training_sessions (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    job_id TEXT NOT NULL,
    model_id TEXT,
    training_data_size INTEGER,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- Create user_preferences table for personalization settings
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) UNIQUE,
    ai_type TEXT DEFAULT 'copywriter',
    ai_name TEXT,
    ai_description TEXT,
    focus_areas TEXT[], -- Array of focus areas based on AI type
    communication_style TEXT DEFAULT 'formal',
    preferred_language TEXT DEFAULT 'id',
    training_frequency TEXT DEFAULT 'weekly', -- weekly, monthly, manual
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create training_metrics table
CREATE TABLE IF NOT EXISTS training_metrics (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    session_id INTEGER REFERENCES training_sessions(id),
    metric_type TEXT, -- 'accuracy', 'response_time', 'user_satisfaction'
    metric_value FLOAT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
); 