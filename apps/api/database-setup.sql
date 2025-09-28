-- =====================================================
-- Generated Timelines Table Setup for ActivityWatch
-- =====================================================

-- Create the generated_timelines table
CREATE TABLE IF NOT EXISTS generated_timelines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    time_range VARCHAR(20) NOT NULL DEFAULT 'day', -- 'hour', 'day', 'week'
    timeline_data JSONB NOT NULL, -- Array of {time: string, description: string}
    total_activities INTEGER NOT NULL DEFAULT 0,
    processed_entries INTEGER NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_generated_timelines_user_id ON generated_timelines(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_timelines_created_at ON generated_timelines(created_at);
CREATE INDEX IF NOT EXISTS idx_generated_timelines_time_range ON generated_timelines(time_range);
CREATE INDEX IF NOT EXISTS idx_generated_timelines_generated_at ON generated_timelines(generated_at);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_generated_timelines_user_time_range ON generated_timelines(user_id, time_range, created_at DESC);

-- Add Row Level Security (RLS)
ALTER TABLE generated_timelines ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access only their own timelines
CREATE POLICY "Users can view own timelines" ON generated_timelines
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own timelines" ON generated_timelines
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own timelines" ON generated_timelines
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own timelines" ON generated_timelines
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- Processed Tasks Table Enhancement for Task Linking
-- =====================================================

-- Add task_id column to processed_tasks table for linking to tasks table
-- This allows processed tasks (from activity analysis) to be linked to user-defined tasks
ALTER TABLE processed_tasks 
ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Create index for better performance on task_id lookups
CREATE INDEX IF NOT EXISTS idx_processed_tasks_task_id ON processed_tasks(task_id);

-- Create composite index for user + task_id queries
CREATE INDEX IF NOT EXISTS idx_processed_tasks_user_task ON processed_tasks(user_id, task_id);

-- Add helpful comment for the new column
COMMENT ON COLUMN processed_tasks.task_id IS 'Links processed task to a user-defined task from tasks table';

-- =====================================================
-- Time Tracking Sessions Table
-- =====================================================

-- Create the time_tracking_sessions table
CREATE TABLE IF NOT EXISTS time_tracking_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_time_tracking_user_id ON time_tracking_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_time_tracking_start_time ON time_tracking_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_time_tracking_created_at ON time_tracking_sessions(created_at);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_time_tracking_user_time ON time_tracking_sessions(user_id, start_time DESC);

-- Add Row Level Security (RLS) if auth is enabled
ALTER TABLE time_tracking_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for time tracking sessions (if using Supabase auth)
CREATE POLICY "Users can view own sessions" ON time_tracking_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON time_tracking_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON time_tracking_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON time_tracking_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Add helpful comments
COMMENT ON TABLE time_tracking_sessions IS 'Stores manual time tracking sessions for users';
COMMENT ON COLUMN time_tracking_sessions.duration_seconds IS 'Calculated duration in seconds, updated when end_time is set';

-- Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_generated_timelines_updated_at
    BEFORE UPDATE ON generated_timelines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Sample Data (Optional - for testing)
-- =====================================================

-- Insert sample timeline data (replace with actual user_id)
-- INSERT INTO generated_timelines (
--     user_id, 
--     time_range, 
--     timeline_data, 
--     total_activities, 
--     processed_entries, 
--     generated_at
-- ) VALUES (
--     'your-user-id-here'::UUID,
--     'day',
--     '[
--         {
--             "time": "9:15 AM",
--             "description": "Started coding in Visual Studio Code on tracker project"
--         },
--         {
--             "time": "10:30 AM", 
--             "description": "Continuing development work (active for several minutes)"
--         }
--     ]'::JSONB,
--     150,
--     12,
--     NOW()
-- );

-- =====================================================
-- Useful Queries
-- =====================================================

-- Get all timelines for a user
-- SELECT * FROM generated_timelines 
-- WHERE user_id = 'your-user-id' 
-- ORDER BY created_at DESC;

-- Get timeline statistics by time range
-- SELECT 
--     time_range,
--     COUNT(*) as timeline_count,
--     AVG(total_activities) as avg_activities,
--     AVG(processed_entries) as avg_entries
-- FROM generated_timelines 
-- WHERE user_id = 'your-user-id'
-- GROUP BY time_range;

-- Clean up old timelines (older than 30 days)
-- DELETE FROM generated_timelines 
-- WHERE created_at < NOW() - INTERVAL '30 days';

-- Get timeline data as JSON
-- SELECT 
--     id,
--     time_range,
--     timeline_data,
--     created_at
-- FROM generated_timelines 
-- WHERE user_id = 'your-user-id'
-- AND time_range = 'day'
-- ORDER BY created_at DESC
-- LIMIT 10; 