# Database Migrations

This directory contains SQL migration scripts for the database schema.

## Migration Files

### 001_create_idle_sessions_table.sql
Creates the `idle_sessions` table to track continuous idle time for users.

**Purpose:**
- Prevents forgotten timers by tracking continuous idle time
- Automatically ends timers after 7 minutes of continuous idle time
- Stores idle session data that would otherwise be lost after activity processing

**Table Structure:**
- `id`: Primary key (UUID)
- `user_id`: Reference to user_profiles table
- `start_time`: When the idle session started
- `end_time`: When the idle session ended (NULL if ongoing)
- `duration_seconds`: Total duration of idle session
- `max_continuous_idle_seconds`: Maximum continuous idle time in this session
- `processed_task_id`: Link to processed_tasks table (created after idle session)
- `created_at`: Record creation timestamp
- `updated_at`: Record update timestamp

**Features:**
- Automatic timestamp updates via triggers
- Proper foreign key constraints with CASCADE/SET NULL
- Indexes for optimal query performance
- Comprehensive documentation via comments

## Running Migrations

To apply these migrations to your Supabase database:

1. Connect to your Supabase project dashboard
2. Go to the SQL Editor
3. Copy and paste the migration SQL
4. Execute the script

Or use the Supabase CLI:
```bash
supabase db reset
supabase db push
```

## Idle Tracking Logic

The idle tracking system works as follows:

1. **Continuous Monitoring**: Every activity update includes idle time tracking
2. **7-Minute Threshold**: If a user is continuously idle for 7 minutes, the timer is automatically ended
3. **Data Preservation**: Idle session data is saved to the database after each processed log creation
4. **State Management**: User idle states are maintained in memory for real-time tracking

This prevents the loss of idle time information that would occur when raw activity data is deleted after processing.
