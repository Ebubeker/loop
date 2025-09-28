-- =====================================================
-- Add No Focus Flag to Processed Tasks Table
-- =====================================================

-- Add no_focus column to processed_tasks table
ALTER TABLE processed_tasks 
ADD COLUMN IF NOT EXISTS no_focus BOOLEAN DEFAULT FALSE;

-- Create index for better performance on no_focus queries
CREATE INDEX IF NOT EXISTS idx_processed_tasks_no_focus ON processed_tasks(no_focus);

-- Create composite index for user + no_focus queries
CREATE INDEX IF NOT EXISTS idx_processed_tasks_user_no_focus ON processed_tasks(user_id, no_focus);

-- Add helpful comment for the new column
COMMENT ON COLUMN processed_tasks.no_focus IS 'Flags activities with no assigned task and duration >5 minutes as lacking focus';

-- Optional: Query to see current stats
-- SELECT 
--   COUNT(*) as total_tasks,
--   COUNT(*) FILTER (WHERE no_focus = true) as no_focus_tasks,
--   COUNT(*) FILTER (WHERE task_id IS NOT NULL) as linked_tasks,
--   COUNT(*) FILTER (WHERE task_id IS NULL) as unlinked_tasks
-- FROM processed_tasks; 