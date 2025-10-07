-- Create idle_sessions table to track continuous idle time
-- This table stores idle session data to prevent forgotten timers

CREATE TABLE IF NOT EXISTS idle_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    max_continuous_idle_seconds INTEGER NOT NULL DEFAULT 0,
    processed_task_id UUID REFERENCES processed_tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_idle_sessions_user_id ON idle_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_idle_sessions_start_time ON idle_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_idle_sessions_processed_task_id ON idle_sessions(processed_task_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_idle_sessions_updated_at 
    BEFORE UPDATE ON idle_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE idle_sessions IS 'Tracks continuous idle time sessions to prevent forgotten timers';
COMMENT ON COLUMN idle_sessions.user_id IS 'Reference to the user who had the idle session';
COMMENT ON COLUMN idle_sessions.start_time IS 'When the idle session started';
COMMENT ON COLUMN idle_sessions.end_time IS 'When the idle session ended (NULL if still ongoing)';
COMMENT ON COLUMN idle_sessions.duration_seconds IS 'Total duration of the idle session in seconds';
COMMENT ON COLUMN idle_sessions.max_continuous_idle_seconds IS 'Maximum continuous idle time in this session';
COMMENT ON COLUMN idle_sessions.processed_task_id IS 'Link to the processed task that was created after this idle session';
