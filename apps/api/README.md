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