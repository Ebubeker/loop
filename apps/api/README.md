# Employee Tracker API - Modular Structure

This API has been refactored from a monolithic structure to a modular architecture using the MVC (Model-View-Controller) pattern.

## Project Structure

```
src/
├── controllers/          # HTTP request handlers
│   ├── activityController.ts
│   ├── authController.ts
│   ├── healthController.ts
│   ├── monitoringController.ts
│   └── taskController.ts
├── routes/              # Express route definitions
│   ├── activityRoutes.ts
│   ├── authRoutes.ts
│   ├── healthRoutes.ts
│   ├── index.ts         # Main routes aggregator
│   ├── monitoringRoutes.ts
│   └── taskRoutes.ts
├── services/            # Business logic and external API calls
│   ├── activityService.ts
│   ├── activityWatchService.ts
│   ├── authService.ts
│   ├── database.ts
│   ├── geminiService.ts
│   ├── monitoringService.ts
│   └── taskService.ts
├── middleware/          # Custom middleware (for future use)
└── index.ts            # Main application entry point
```

## Architecture Overview

### Services Layer
- **Database Service** (`database.ts`): Handles Supabase client initialization
- **ActivityWatch Service** (`activityWatchService.ts`): Manages ActivityWatch server interactions
- **Monitoring Service** (`monitoringService.ts`): Handles activity monitoring state and intervals
- **Activity Service** (`activityService.ts`): Processes and consolidates activity data
- **Task Service** (`taskService.ts`): Manages task CRUD operations
- **Auth Service** (`authService.ts`): Handles user authentication and profiles
- **Gemini Service** (`geminiService.ts`): AI-powered activity classification using Google's Gemini LLM

### Controllers Layer
- **Health Controller**: Basic health check endpoints
- **Auth Controller**: User authentication endpoints
- **Monitoring Controller**: Activity monitoring start/stop endpoints
- **Activity Controller**: Activity data retrieval endpoints
- **Task Controller**: Task management endpoints

### Routes Layer
- Each controller has its corresponding route file
- Routes are aggregated in `routes/index.ts`
- Clean separation of HTTP routing from business logic

## Benefits of This Structure

1. **Separation of Concerns**: Each layer has a specific responsibility
2. **Maintainability**: Code is organized and easy to locate
3. **Testability**: Services can be easily unit tested
4. **Scalability**: New features can be added without affecting existing code
5. **Reusability**: Services can be reused across different controllers

## API Endpoints

### Health
- `GET /` - Root endpoint
- `GET /api/health` - Health check

### Authentication
- `POST /api/auth/create-account` - Create user profile

### Monitoring
- `POST /api/start` - Start activity monitoring
- `POST /api/stop` - Stop activity monitoring

### Activity - Basic
- `GET /api/activity` - Get current activity
- `GET /api/activity/consolidated` - Get consolidated activities
- `GET /api/activity/raw` - Get raw activity logs

### Activity - Enhanced Data Extraction 🆕
- `GET /api/activity/detailed?timeRange=3600` - Get detailed activity from all bucket types
- `GET /api/activity/buckets` - Get all available bucket types and their metadata
- `GET /api/activity/web?timeRange=3600` - Get web browsing activity (URLs, titles, etc.)
- `GET /api/apps/categories` - Get app categories
- `GET /api/events/recent` - Get recent events

### AI Timeline Generation 🤖
- `GET /api/activity/timeline?timeRange=day&limit=100` - Generate human-readable timeline (temporary)
- `POST /api/activity/timeline/save` - 💾 **Generate and save timeline to database**
- `GET /api/activity/timeline/saved/:userId` - Get saved timelines for user
- `GET /api/activity/timeline/:timelineId` - Get specific saved timeline by ID
- `GET /api/activity/timeline/stats/:userId` - Get timeline statistics for user
- `DELETE /api/activity/timeline/cleanup` - Clean up old saved timelines

### Latest Gemini Activities 🆕
- `GET /api/activity/timeline/latest/:userId` - **Get latest AI-generated timelines**
- `GET /api/activity/timeline/entries/:userId` - Get latest timeline entries with full data
- `POST /api/activity/timeline/process-unprocessed/:userId` - **Force process unprocessed activities**

### Tasks
- `POST /api/tasks` - Create a task
- `GET /api/tasks/today/:userId` - Get today's tasks
- `GET /api/tasks/:userId/:date` - Get tasks by date
- `DELETE /api/tasks/:taskId` - Delete a task

### Analysis (AI-Powered)
- `GET /api/analysis/work/:userId` - Get comprehensive work analysis using Gemini AI

## Enhanced ActivityWatch Data Extraction 🚀

### What Data is Available Beyond Basic Window Tracking

**Current Basic Data:**
- App name and window title
- Timestamps and durations
- AFK status and idle time

**Enhanced Data Available:**
- **Web browsing data**: URLs, page titles, incognito mode, audio status
- **Multiple bucket types**: currentwindow, afkstatus, web.tab.current, editor activity, etc.
- **Application-specific data**: Process names, executables, window classes
- **Custom watcher data**: Steam games, Teams meetings, media consumption

### Browser Activity Tracking Setup

To get web browsing data with URLs:

**Chrome:**
1. Install: [ActivityWatch Web Extension](https://chromewebstore.google.com/detail/web-activity/mkfkfgmiapinbcllnflnmnfmfaacboke)

**Firefox:**
1. Install: [ActivityWatch - Open Source Time Tracker](https://addons.mozilla.org/en-US/firefox/addon/aw-watcher-web/)

After installation, the `/api/activity/web` endpoint will return detailed web activity:

```json
{
  "webActivity": [
    {
      "timestamp": "2025-09-21T10:37:30.632Z",
      "duration": 45.5,
      "url": "https://github.com/user/repo",
      "title": "GitHub - Repository Name",
      "incognito": false,
      "audible": true
    }
  ],
  "totalEvents": 150,
  "webBucketsFound": 2
}
```

### Available Bucket Types

Use `/api/activity/buckets` to discover all available data sources:

```json
{
  "currentwindow": [
    {
      "id": "aw-watcher-window_DESKTOP-D379K4U",
      "client": "aw-watcher-window",
      "hostname": "DESKTOP-D379K4U"
    }
  ],
  "afkstatus": [
    {
      "id": "aw-watcher-afk_DESKTOP-D379K4U", 
      "client": "aw-watcher-afk",
      "hostname": "DESKTOP-D379K4U"
    }
  ],
  "web.tab.current": [
    {
      "id": "aw-watcher-web-chrome",
      "client": "aw-watcher-web",
      "hostname": "DESKTOP-D379K4U"
    }
  ]
}
```

### Detailed Activity Extraction

Use `/api/activity/detailed?timeRange=7200` to get comprehensive data from all watchers:

```json
{
  "currentwindow": {
    "bucket": {
      "id": "aw-watcher-window_DESKTOP-D379K4U",
      "type": "currentwindow",
      "client": "aw-watcher-window"
    },
    "events": [...],
    "eventCount": 45,
    "dataFields": ["app", "title", "executable", "window_class"],
    "sampleEvent": {...}
  },
  "web.tab.current": {
    "bucket": {
      "id": "aw-watcher-web-chrome",
      "type": "web.tab.current", 
      "client": "aw-watcher-web"
    },
    "events": [...],
    "eventCount": 120,
    "dataFields": ["url", "title", "incognito", "audible"],
    "sampleEvent": {...}
  }
}
```

### Custom Watchers

You can add custom watchers for specific applications:

**Steam Gaming Activity:**
- Repository: [aw-watcher-steam](https://github.com/Edwardsoen/aw-watcher-steam)
- Tracks: Game names, play time, Steam activity

**Microsoft Teams:**
- Repository: [aw-teams-history-plugin](https://github.com/davidfraser/aw-teams-history-plugin)
- Tracks: Calls, meetings, calendar events

**Editor/IDE Activity:**
- Built-in editor watchers for VS Code, Vim, etc.
- Tracks: Files being edited, programming languages, projects

### Query Parameters

Most endpoints accept a `timeRange` parameter (in seconds):
- `timeRange=3600` - Last 1 hour (default)
- `timeRange=86400` - Last 24 hours  
- `timeRange=604800` - Last 7 days

Example: `GET /api/activity/web?timeRange=86400`

## 🤖 AI-Powered Timeline Generation 

### NEW: Human-Readable Activity Timeline

Transform raw activity logs into polished, human-readable timelines using AI.

**Endpoint:** `GET /api/activity/timeline`

**Parameters:**
- `timeRange`: "hour", "day", or "week" (default: "day")
- `limit`: Number of activities to process (default: 100)

**Example Request:**
```bash
GET /api/activity/timeline?timeRange=day&limit=50
```

**Response Format:**
```json
{
  "success": true,
  "timeline": [
    {
      "time": "9:15 AM",
      "description": "Started coding in Visual Studio Code on tracker project"
    },
    {
      "time": "9:45 AM", 
      "description": "Continuing development work on ActivityWatch integration (active for several minutes)"
    },
    {
      "time": "10:20 AM",
      "description": "Switched to browsing GitHub documentation for research"
    },
    {
      "time": "11:00 AM",
      "description": "Resumed coding work in Cursor IDE, working on service enhancements"
    }
  ],
  "totalActivities": 150,
  "processedEntries": 12,
  "timeRange": "day",
  "generatedAt": "2025-09-21T21:55:00.000Z"
}
```

### AI Processing Features

**Smart Interpretation:**
- Converts technical titles like "activityWatchService.ts - tracker - Cursor" into "Working on ActivityWatch service in Cursor IDE"
- Groups continuous activities: Instead of 5 separate entries, creates "Continuing work (active for several minutes)"
- Contextual descriptions: Recognizes patterns and adds meaningful explanations

**Activity Consolidation:**
- Detects continuous work sessions
- Uses contextual phrases like "still working on", "switched back to", "spent several minutes on"
- Avoids robotic repetition with intelligent summarization

**Browser & App Recognition:**
- Identifies coding sessions, web browsing, document editing
- Extracts meaningful project names from window titles
- Recognizes application switches and workflow patterns

### Setup Requirements

**1. Configure Gemini AI:**
```bash
# Get API key from: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_api_key_here
```

**2. Test the feature:**
```bash
cd apps/api
npx ts-node src/test-timeline.ts
```

### Integration Examples

**Frontend Integration:**
```javascript
// Fetch timeline for dashboard
const response = await fetch('/api/activity/timeline?timeRange=day');
const { timeline } = await response.json();

timeline.forEach(entry => {
  console.log(`${entry.time} - ${entry.description}`);
});
```

**Different Time Ranges:**
```bash
# Last hour - for real-time updates
GET /api/activity/timeline?timeRange=hour&limit=20

# Last day - for daily summaries  
GET /api/activity/timeline?timeRange=day&limit=100

# Last week - for weekly reports
GET /api/activity/timeline?timeRange=week&limit=500
```

## 💾 Saved Timeline Database Storage

### Overview

Generated AI timelines are now saved to a separate `generated_timelines` table, providing:
- **Fast retrieval** without regenerating with AI
- **Historical timeline preservation**
- **User-specific storage** with Row Level Security
- **Timeline statistics and analytics**

### Database Setup

**1. Create the table:** Run the SQL commands in `database-setup.sql`:
```bash
# In Supabase SQL Editor or your PostgreSQL client
psql -f apps/api/database-setup.sql
```

**2. Table Structure:**
```sql
CREATE TABLE generated_timelines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    time_range VARCHAR(20) NOT NULL DEFAULT 'day',
    timeline_data JSONB NOT NULL, -- [{"time":"10:37 AM","description":"..."}]
    total_activities INTEGER NOT NULL DEFAULT 0,
    processed_entries INTEGER NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Saved Timeline API Endpoints

**Generate and Save Timeline:**
```bash
POST /api/activity/timeline/save
Content-Type: application/json

{
  "userId": "user-uuid-here"
}

# Query parameters: ?timeRange=day&limit=100
```

**Response:**
```json
{
  "success": true,
  "saved": true,
  "savedId": "timeline-uuid",
  "timeline": [
    {
      "time": "9:15 AM",
      "description": "Started coding in Visual Studio Code on tracker project"
    }
  ],
  "totalActivities": 150,
  "processedEntries": 12,
  "timeRange": "day",
  "generatedAt": "2025-09-21T21:55:00.000Z"
}
```

**Get User's Saved Timelines:**
```bash
GET /api/activity/timeline/saved/:userId?limit=10
```

**Get Specific Timeline:**
```bash
GET /api/activity/timeline/:timelineId?userId=optional
```

**Timeline Statistics:**
```bash
GET /api/activity/timeline/stats/:userId
```

**Response:**
```json
{
  "success": true,
  "statistics": {
    "totalTimelines": 25,
    "timeRangeBreakdown": {
      "day": 15,
      "hour": 8,
      "week": 2
    },
    "averageActivitiesProcessed": 127,
    "averageEntriesGenerated": 18,
    "oldestTimeline": "2025-09-15T10:00:00.000Z",
    "newestTimeline": "2025-09-21T21:55:00.000Z"
  }
}
```

**Cleanup Old Timelines:**
```bash
DELETE /api/activity/timeline/cleanup?daysOld=30
```

### Integration Benefits

**Frontend Integration:**
```javascript
// Save timeline for user
const saveResponse = await fetch('/api/activity/timeline/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user-id' }),
  params: new URLSearchParams({ timeRange: 'day', limit: '100' })
});

// Get saved timelines (fast, no AI needed)
const savedTimelines = await fetch('/api/activity/timeline/saved/user-id');
const { timelines } = await savedTimelines.json();

timelines.forEach(timeline => {
  timeline.timeline_data.forEach(entry => {
    displayTimelineEntry(entry.time, entry.description);
  });
});
```

**Performance Benefits:**
- ⚡ **Fast retrieval** - No AI processing needed
- 💾 **Persistent storage** - Timelines saved across sessions
- 📊 **Analytics ready** - Statistics and usage tracking
- 🔒 **Secure** - Row Level Security per user
- 🧹 **Self-cleaning** - Automatic old timeline cleanup

### Testing

**Test the complete functionality:**
```bash
cd apps/api
npx ts-node src/test-timeline.ts
```

This will test:
- Timeline generation
- Database saving
- Retrieval operations
- Statistics
- Cleanup functionality

## 🚀 Background Timeline Worker Microservice

### Overview

The **Timeline Worker** is a background microservice that automatically monitors user activity and generates AI-powered timelines when users accumulate **5+ minutes of recorded activity**. This eliminates the need for on-demand AI processing and keeps timelines always fresh for instant frontend retrieval.

### 🎯 How It Works

1. **Continuous Monitoring**: Worker checks `activity_logs` table every 30 seconds
2. **Activity Tracking**: Accumulates activity minutes per user since last timeline  
3. **Unprocessed Detection**: 🆕 Checks for raw activities not yet processed by AI (every minute)
4. **Automatic Triggering**: When user reaches 5+ minutes OR has 10+ unprocessed activities → auto-generates AI timeline
5. **Database Storage**: Saves timeline to `generated_timelines` table
6. **Frontend Ready**: Pre-generated timelines ready for instant retrieval

### 🔍 Unprocessed Activities Detection

The worker automatically detects when raw activity items haven't been processed into AI timelines:

- **Smart Comparison**: Compares `activity_logs` timestamps with `generated_timelines.generated_at`
- **Automatic Processing**: Triggers AI generation when 10+ unprocessed activities accumulate
- **No Data Loss**: Ensures all raw activities eventually get processed into readable timelines
- **Flexible Thresholds**: Processes both time-based (5+ minutes) and count-based (10+ activities) triggers

### 🚀 Running the Worker

**Option 1: Standalone Microservice (Recommended)**
```bash
# Development with auto-restart
npm run dev:worker

# Production
npm run worker
```

**Option 2: With Main API Server**
```bash
# Add to your .env file:
AUTO_START_TIMELINE_WORKER=true

# Run normally
npm run dev
```

**Option 3: Manual API Control**
```bash
# Start via API
POST http://localhost:3001/api/worker/start

# Stop via API  
POST http://localhost:3001/api/worker/stop
```

### 📊 Worker Management API

```bash
# Get worker status
GET /api/worker/status

# Get detailed statistics
GET /api/worker/statistics

# Health check
GET /api/worker/health

# Force timeline generation for user
POST /api/worker/generate/:userId

# Force timeline generation for unprocessed activities
POST /api/worker/generate/unprocessed/:userId
```

### 🎛️ Configuration

**Environment Variables:**
```env
# Required
GEMINI_API_KEY=your_google_ai_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key

# Optional
AUTO_START_TIMELINE_WORKER=true
```

**Worker Settings** (in `TimelineWorkerService.ts`):
```typescript
ACTIVITY_THRESHOLD_MINUTES = 5;      // Generate timeline after 5 minutes
CHECK_INTERVAL_MS = 30000;           // Check every 30 seconds
MIN_ACTIVITIES_FOR_TIMELINE = 10;    // Minimum activities needed
```

### 📈 Worker Statistics

**Status Response Example:**
```json
{
  "success": true,
  "statistics": {
    "isRunning": true,
    "totalUsers": 12,
    "usersOverThreshold": 3,
    "usersNearThreshold": 2,
    "averageActivityMinutes": 3.5,
    "configuration": {
      "activityThreshold": 5,
      "checkInterval": 30000,
      "minimumActivities": 10
    },
    "userActivity": [
      {
        "userId": "b3d0ff5f...",
        "activityMinutes": 7.2,
        "status": "ready"
      }
    ]
  }
}
```

### 💾 Frontend Integration

**Benefits:**
- ⚡ **Instant timeline retrieval** - no AI processing wait
- 🔄 **Always up-to-date** - auto-generated every 5 minutes
- 📊 **Scalable** - handles multiple users simultaneously
- 🔒 **Secure** - user-specific timelines with RLS

**Frontend Code:**
```javascript
// Method 1: Get latest timeline entries (recommended)
const response = await fetch(`/api/activity/timeline/entries/${userId}?entriesLimit=20`);
const { latestTimeline } = await response.json();

if (latestTimeline) {
  latestTimeline.entries.forEach(entry => {
    showTimelineEntry(entry.time, entry.description);
  });
}

// Method 2: Get multiple recent timelines with metadata
const multipleResponse = await fetch(`/api/activity/timeline/latest/${userId}?limit=5`);
const { latestGeminiActivities } = await multipleResponse.json();

latestGeminiActivities.forEach(timeline => {
  console.log(`Timeline from ${timeline.generatedAt}: ${timeline.processedEntries} entries`);
  timeline.timelineEntries.forEach(entry => {
    showTimelineEntry(entry.time, entry.description);
  });
});

// Method 3: Process any unprocessed activities manually
const processResponse = await fetch(`/api/activity/timeline/process-unprocessed/${userId}`, {
  method: 'POST'
});
const { processed, unprocessedActivitiesFound } = await processResponse.json();
console.log(`Found ${unprocessedActivitiesFound} unprocessed activities`);

// No AI processing needed for retrieval - instant display!
```

### 🧪 Testing the Worker

**Test script:**
```bash
npx ts-node src/test-background-worker.ts
```

**What it tests:**
- Worker startup and status
- Activity monitoring
- Statistics reporting  
- Manual timeline generation
- Health checks
- Saved timeline retrieval

### 🚨 Production Deployment

**Process Manager (PM2):**
```json
{
  "name": "timeline-worker",
  "script": "dist/workers/timelineWorker.js",
  "instances": 1,
  "autorestart": true,
  "watch": false,
  "env": {
    "NODE_ENV": "production"
  }
}
```

**Docker:**
```dockerfile
# Run as separate container
CMD ["node", "dist/workers/timelineWorker.js"]
```

**Health Monitoring:**
- Endpoint: `GET /api/worker/health`
- Logs: Comprehensive worker activity logging
- Metrics: User activity statistics and thresholds

### 🔍 Troubleshooting

**Worker not generating timelines?**
1. Check Gemini API key is configured
2. Verify users have 5+ minutes of activity
3. Ensure minimum activity count met (10+ activities)
4. Check worker logs for errors

**Performance optimization:**
- Adjust `CHECK_INTERVAL_MS` for your workload
- Modify `ACTIVITY_THRESHOLD_MINUTES` per requirements  
- Scale workers horizontally for large user bases

## Getting Started

The application entry point is `src/index.ts`. The modular structure automatically:
- Initializes ActivityWatch on startup
- Sets up all routes through the routes aggregator
- Provides clean error handling through controllers

## Gemini AI Integration

The API now includes AI-powered activity classification using Google's Gemini LLM:

### Setup
1. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add `GEMINI_API_KEY=your_api_key_here` to your `.env` file
3. The service will automatically use your tasks and consolidated activities for analysis

### Usage as a Function (Not Endpoint)
```typescript
import { GeminiService } from './services/geminiService';

// Basic usage with default prompt
const classification = await GeminiService.classifyActivities(userId);

// Usage with custom prompt
const customPrompt = "Your custom analysis prompt here...";
const classification = await GeminiService.classifyActivities(userId, customPrompt);

// Check configuration
const isConfigured = GeminiService.isConfigured();

// Test connection
const connectionTest = await GeminiService.testConnection();
```

### Response Structure
The service returns a comprehensive JSON analysis including:
- Productivity score (0-100)
- Task completion rate
- Time alignment (productive/neutral/distracting time)
- Activity classifications with categories
- Personalized recommendations
- Detailed insights and patterns

### Testing
Run the included test file to verify your setup:
```bash
cd apps/api
npx ts-node src/test-gemini.ts
```

## Future Enhancements

- Add middleware for authentication, logging, and validation
- Implement proper error handling middleware
- Add API documentation with Swagger/OpenAPI
- Add unit and integration tests
- Implement rate limiting and security middleware
- Extend Gemini service with more AI features (trend analysis, goal setting, etc.) 

## 🔗 Task Integration System

The Task Integration System automatically links processed activity logs to user-defined tasks using AI-powered matching. This creates a connection between automatically detected activities and manually created tasks.

### Overview

**Two Types of Tasks:**
- **User-defined tasks** (`tasks` table): Manually created tasks with name, description, category
- **Processed tasks** (`processed_tasks` table): Auto-generated from activity processing with AI summaries

**Integration Flow:**
1. Activity processing creates processed tasks automatically
2. AI analyzes processed tasks to find matching user-defined tasks  
3. When a match is found, the `task_id` links the processed task to the user-defined task
4. This provides context about which user goals the activities contribute to

### Database Schema

**Tasks Table Enhancement:**
```sql
-- User-defined tasks remain unchanged
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    status VARCHAR(50),
    duration INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**Processed Tasks Table Enhancement:**
```sql
-- Enhanced with task_id for linking
ALTER TABLE processed_tasks 
ADD COLUMN task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Performance indexes
CREATE INDEX idx_processed_tasks_task_id ON processed_tasks(task_id);
CREATE INDEX idx_processed_tasks_user_task ON processed_tasks(user_id, task_id);
```

### AI-Powered Task Matching

**Matching Algorithm:**
- Uses Gemini AI to semantically compare activity summaries with existing tasks
- Considers project context, technology stack, and work patterns
- Only creates links when confidence is above 70%
- Conservative approach - prefers creating standalone tasks over incorrect matches

**Matching Examples:**
```
✅ HIGH MATCH
Activity: "Debugging React component rendering"
Task: "Fix user interface bugs"
→ Linked (high semantic similarity)

✅ MEDIUM MATCH  
Activity: "Writing API documentation"
Task: "Complete project documentation"
→ Linked (related work context)

❌ NO MATCH
Activity: "Checking email"
Task: "Implement authentication system"
→ Standalone (unrelated activities)
```

### API Endpoints

**Enhanced Processed Tasks:**
```bash
# Get processed tasks with linked task information
GET /api/activity/processed-tasks/:userId?limit=50

# Response includes linked task details
{
  "success": true,
  "tasks": [
    {
      "id": "processed-task-uuid",
      "task_title": "Debugging React components",
      "task_description": "Fixed rendering issues in user dashboard",
      "duration_minutes": 25,
      "task_id": "user-defined-task-uuid",      // Link to user task
      "has_linked_task": true,
      "linked_task_name": "Fix UI bugs",
      "linked_task_category": "Development",
      "linked_task_status": "in_progress"
    }
  ],
  "linked_count": 8,      // Tasks linked to user-defined tasks
  "standalone_count": 3   // Unlinked processed tasks
}
```

**Manual Task Creation with Linking:**
```bash
# Create processed task with optional link
POST /api/activity/processed-tasks
{
  "userId": "user-uuid",
  "taskName": "Code review session",
  "taskDescription": "Reviewed pull requests for authentication module",
  "taskStatus": "completed",
  "taskTimestamp": "2025-09-27T14:30:00Z",
  "linkedTaskId": "user-defined-task-uuid"  // Optional linking
}
```

### Processing Workflow Integration

**Automatic Linking During Processing:**
1. **Activity Collection** → Raw activities gathered every minute
2. **AI Summarization** → Activities converted to readable summaries  
3. **Task Matching** → AI finds best matching user-defined task
4. **Link Creation** → `task_id` stored if confident match found
5. **Task Continuation** → Related activities continue the same processed task

**Benefits:**
- **Context Awareness**: See which user goals your activities contribute to
- **Progress Tracking**: Monitor time spent on specific user-defined objectives
- **Work Patterns**: Understand how daily activities align with planned tasks
- **Productivity Insights**: Identify gaps between planned work and actual activities

### Configuration

**AI Matching Settings:**
```typescript
// Task matching configuration
const MATCHING_CONFIG = {
  confidenceThreshold: 0.7,    // Minimum confidence for linking
  maxTasksToConsider: 20,      // Limit tasks evaluated per match
  enableConservativeMode: true  // Prefer standalone over incorrect links
};
```

**Processing Integration:**
- Task matching runs during normal activity processing
- No additional API calls needed for automatic linking
- Fallback: Creates standalone processed tasks if no matches found
- Error handling: Continues processing even if AI matching fails

### Automatic Task Completion

**Intelligent Task Lifecycle Management:**
The system automatically manages task completion based on work patterns:

- **Auto-completion Trigger**: Tasks are marked as "completed" when no work has been done on them for 2+ hours
- **Activity-based Detection**: Uses processed logs to determine when work was last performed on each task
- **Smart Status Management**: Only affects active tasks - already completed tasks are ignored
- **Background Processing**: Runs automatically every time a new processed log is created

**How It Works:**
1. **New Processed Log Created** → Triggers inactive task check
2. **Task Activity Analysis** → Checks last processed log timestamp for each user task
3. **Inactivity Detection** → Identifies tasks without work for 2+ hours  
4. **Automatic Completion** → Updates task status to "completed"
5. **Comprehensive Logging** → Reports what was auto-completed and why

**Status Categories:**
- **Active**: Tasks worked on within the last 2 hours
- **Auto-completed**: Tasks inactive for 2+ hours (automatically marked as completed)
- **Never worked**: Tasks with no processed logs yet (remain active)
- **Already completed**: Tasks manually completed (ignored by auto-completion)

**API Endpoints:**
```bash
# Manual inactive task check (triggers auto-completion)
POST /api/activity/check-inactive/:userId

# Response
{
  "success": true,
  "message": "Inactive task check completed for user user-123",
  "userId": "user-123",
  "timestamp": "2025-09-27T16:30:00Z"
}
```

**Console Output Example:**
```
🕒 Checking for inactive tasks to auto-complete for user user-123
⏰ Task "Fix login bugs" hasn't been worked on for 2.3 hours - marking for completion
⚡ Task "Update documentation" was worked on 0.5 hours ago - still active
📝 Task "New feature research" has no processed logs yet - keeping active
✅ Auto-completed task "Fix login bugs" (inactive for 2.3 hours)
📊 Task activity summary for user user-123: 2 active, 1 auto-completed
```

### Usage Examples

**Frontend Task Dashboard:**
```javascript
// Get processed tasks with links
const response = await fetch('/api/activity/processed-tasks/user-123');
const data = await response.json();

// Group by linked tasks
const linkedTasks = data.tasks.filter(t => t.has_linked_task);
const standaloneTasks = data.tasks.filter(t => !t.has_linked_task);

// Show time spent on specific user goals
linkedTasks.forEach(task => {
  console.log(`Spent ${task.duration_minutes}min on "${task.linked_task_name}"`);
});

// Manual inactive task check
const checkResult = await fetch('/api/activity/check-inactive/user-123', {
  method: 'POST'
});
```

**Task Progress Analysis:**
```sql
-- Time spent per user-defined task today
SELECT 
  t.name as task_name,
  t.category,
  t.status,
  COUNT(pt.id) as activity_sessions,
  SUM(pt.duration_minutes) as total_minutes,
  MAX(pt.end_time) as last_worked_on
FROM tasks t
LEFT JOIN processed_tasks pt ON t.id = pt.task_id
WHERE t.user_id = 'user-uuid' 
  AND pt.created_at >= CURRENT_DATE
GROUP BY t.id, t.name, t.category, t.status
ORDER BY last_worked_on DESC;
```

**Task Activity Monitoring:**
```javascript
// Check task activity status
const tasks = await fetch('/api/tasks?user_id=user-123');
const processedTasks = await fetch('/api/activity/tasks/user-123');

// Combine to show activity patterns
tasks.forEach(task => {
  const recentWork = processedTasks.tasks.filter(pt => 
    pt.task_id === task.id && 
    pt.has_linked_task
  );
  
  console.log(`Task "${task.name}": ${recentWork.length} work sessions today`);
});
```

### Migration

**Database Setup:**
```bash
# Run the enhanced database setup
psql -f apps/api/database-setup.sql

# This adds:
# - task_id column to processed_tasks
# - Foreign key constraint to tasks table  
# - Performance indexes for task linking
# - Proper CASCADE behavior for deletions
```

**Backward Compatibility:**
The system is fully backward compatible:
- Existing processed tasks without `task_id` continue to work as standalone tasks
- Auto-completion only affects tasks that have processed logs linked to them
- Manual task management continues to work independently

## ⏰ Manual Time Tracking System

The Manual Time Tracking System provides precise time tracking capabilities with session management, allowing users to manually start and stop work sessions with accurate time recording.

### Overview

**Two Complementary Systems:**
- **Automated Activity Processing**: Continuous AI-powered activity detection and task linking
- **Manual Time Tracking**: User-controlled session timing with precise start/stop functionality

**Key Features:**
- **Session Management**: Create and complete time tracking sessions
- **Duration Calculation**: Automatic or manual duration computation
- **Daily/Weekly Stats**: Aggregated time summaries
- **Session History**: Complete tracking record with search capabilities
- **Active Session Monitoring**: Track incomplete sessions to prevent overlaps

### Database Schema

**Time Tracking Sessions Table:**
```sql
CREATE TABLE time_tracking_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,                    -- NULL for active sessions
    duration_seconds INTEGER,                -- Calculated when session ends
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_time_tracking_user_id ON time_tracking_sessions(user_id);
CREATE INDEX idx_time_tracking_start_time ON time_tracking_sessions(start_time);
CREATE INDEX idx_time_tracking_user_time ON time_tracking_sessions(user_id, start_time DESC);
```

### API Endpoints

#### 1. Create Time Tracking Session
```bash
POST /api/time-tracking/session

# Request
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "start_time": "2024-01-01T10:00:00.000Z"
}

# Response (201 Created)
{
  "session_id": 123,
  "message": "Session created successfully"
}

# Error Response (400 Bad Request)
{
  "error": "user_id and start_time are required"
}
```

#### 2. Update Session with End Time
```bash
PUT /api/time-tracking/session/:sessionId

# Request
{
  "end_time": "2024-01-01T11:30:00.000Z",
  "duration_seconds": 5400  # Optional - calculated if not provided
}

# Response (200 OK)
{
  "message": "Session updated successfully"
}

# Error Response (400 Bad Request)
{
  "error": "Session already completed"
}
```

#### 3. Get Daily and Weekly Statistics
```bash
GET /api/time-tracking/stats/:userId

# Response (200 OK)
{
  "today_seconds": 14400,      # 4 hours today
  "week_seconds": 86400,       # 24 hours this week
  "sessions_today": 3,         # Number of completed sessions today
  "sessions_week": 12          # Number of completed sessions this week
}
```

#### 4. Get Session History
```bash
GET /api/time-tracking/history/:userId?limit=10

# Response (200 OK)
{
  "sessions": [
    {
      "id": 123,
      "start_time": "2024-01-01T10:00:00.000Z",
      "end_time": "2024-01-01T11:30:00.000Z",
      "duration_seconds": 5400,
      "created_at": "2024-01-01T10:00:00.000Z"
    }
  ],
  "count": 10,
  "limit": 10
}
```

#### 5. Get Active Sessions
```bash
GET /api/time-tracking/active/:userId

# Response (200 OK)
{
  "active_sessions": [
    {
      "id": 124,
      "start_time": "2024-01-01T14:00:00.000Z",
      "created_at": "2024-01-01T14:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Usage Examples

**Starting a Work Session:**
```javascript
// Start timing
const startSession = async (userId) => {
  const response = await fetch('/api/time-tracking/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      start_time: new Date().toISOString()
    })
  });
  
  const data = await response.json();
  console.log('Session started:', data.session_id);
  return data.session_id;
};

// End timing
const endSession = async (sessionId) => {
  const response = await fetch(`/api/time-tracking/session/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      end_time: new Date().toISOString()
    })
  });
  
  const data = await response.json();
  console.log('Session completed:', data.message);
};
```

**Dashboard Integration:**
```javascript
// Get comprehensive time stats
const getTimeTrackingDashboard = async (userId) => {
  const [stats, history, active] = await Promise.all([
    fetch(`/api/time-tracking/stats/${userId}`),
    fetch(`/api/time-tracking/history/${userId}?limit=5`),
    fetch(`/api/time-tracking/active/${userId}`)
  ]);

  return {
    stats: await stats.json(),
    recentSessions: await history.json(),
    activeSessions: await active.json()
  };
};

// Format time for display
const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};
```

**Timer Component Example:**
```javascript
class TimeTracker {
  constructor(userId) {
    this.userId = userId;
    this.activeSessionId = null;
    this.startTime = null;
  }

  async start() {
    if (this.activeSessionId) {
      throw new Error('Session already active');
    }

    const response = await fetch('/api/time-tracking/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: this.userId,
        start_time: new Date().toISOString()
      })
    });

    const data = await response.json();
    this.activeSessionId = data.session_id;
    this.startTime = new Date();
    
    console.log(`⏰ Started session ${data.session_id}`);
  }

  async stop() {
    if (!this.activeSessionId) {
      throw new Error('No active session');
    }

    const response = await fetch(`/api/time-tracking/session/${this.activeSessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        end_time: new Date().toISOString()
      })
    });

    const data = await response.json();
    const duration = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    
    console.log(`⏰ Stopped session ${this.activeSessionId} (${duration}s)`);
    
    this.activeSessionId = null;
    this.startTime = null;
  }

  getCurrentDuration() {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }
}
```

### Smart Features

**Automatic Duration Calculation:**
```javascript
// Duration calculated automatically
{
  "end_time": "2024-01-01T11:30:00.000Z"
  // duration_seconds calculated from start_time to end_time
}

// Or provide explicit duration
{
  "end_time": "2024-01-01T11:30:00.000Z",
  "duration_seconds": 5400  // 90 minutes
}
```

**Session Validation:**
- **Start Time Validation**: Ensures proper ISO 8601 format
- **End Time Logic**: Prevents end time before start time
- **Duplicate Prevention**: Warns about multiple active sessions
- **Session State**: Prevents updating already completed sessions

**Statistics Aggregation:**
- **Today**: All completed sessions starting from 12:00 AM today
- **Week**: All completed sessions from start of current week (Sunday)
- **Only Completed**: Ignores active sessions in statistics
- **Real-time Updates**: Stats reflect immediately after session completion

### Integration Benefits

**Complementary Systems:**
- **Activity Processing**: Automatic background tracking of what you work on
- **Manual Time Tracking**: Precise control over when you're "on the clock"
- **Task Linking**: Connect time sessions to specific user-defined goals
- **Comprehensive Analytics**: Both automatic activity insights and manual time summaries

**Productivity Insights:**
- Compare estimated vs. actual time spent on tasks
- Track focus sessions vs. general work periods
- Identify peak productivity hours through manual session patterns
- Combine with automatic activity data for complete work picture

### Migration and Setup

**Database Migration:**
```bash
# Run the enhanced database setup
psql -f apps/api/database-setup.sql

# This adds:
# - time_tracking_sessions table
# - Performance indexes for queries
# - Row Level Security policies
# - Proper data validation constraints
```

**Frontend Integration:**
```javascript
// Initialize time tracker
const tracker = new TimeTracker('user-123');

// Start work session
await tracker.start();

// Stop work session
await tracker.stop();

// Get daily summary
const stats = await fetch('/api/time-tracking/stats/user-123');
const { today_seconds, week_seconds } = await stats.json();
```

The manual time tracking system provides precise session control while working seamlessly with the existing automated activity processing system!