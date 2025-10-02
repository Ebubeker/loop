# 🧩 Subtasks Feature

## Overview

The **Subtasks** feature provides a hierarchical organization of your work by automatically grouping related personalized tasks into higher-level work streams or projects.

## Hierarchy

```
Raw Activities (from client)
    ↓ (buffered, 20 at a time)
Personalized Tasks (AI-classified clusters)
    ↓ (grouped by intent/topic)
Subtasks (higher-level work streams)
```

### Example:
```
Activity: "VS Code - auth.ts" → 
    Personalized Task: "Backend authentication implementation" →
        Subtask: "User authentication system development"

Activity: "Chrome - JWT documentation" → 
    Personalized Task: "JWT token research and implementation" →
        Subtask: "User authentication system development"

Activity: "Postman - Testing login endpoint" → 
    Personalized Task: "API endpoint testing for login flow" →
        Subtask: "User authentication system development"
```

---

## How It Works

### 1. Initial Condition
- System waits until **4 personalized tasks** have been created for today
- Once 4 tasks exist, Gemini AI groups them into initial subtasks

### 2. Continuous Classification
- Every time a new personalized task is created:
  - System automatically runs classification
  - Gemini receives current subtasks + all tasks
  - AI decides: add to existing subtask OR create new subtask
  - Subtask summaries are updated to reflect all contained tasks

### 3. Automatic Triggering
The subtask classification is triggered automatically:
- ✅ After 20 activities are classified into personalized tasks
- ✅ If 4+ tasks exist for today
- ✅ Every time a new personalized task is created (if subtasks already exist)

---

## Database Schema

### Table: `subtasks`

```sql
CREATE TABLE subtasks (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    subtask_name TEXT NOT NULL,              -- "Backend API development for user authentication"
    subtask_summary TEXT NOT NULL,            -- "Implemented login, JWT validation, and testing"
    personalized_task_ids INTEGER[] NOT NULL, -- [123, 124, 125]
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
```

**Fields:**
- `subtask_name`: Descriptive name (8-15 words)
- `subtask_summary`: Summary of all work done (15-30 words)
- `personalized_task_ids`: Array of `processed_tasks` IDs belonging to this subtask

---

## API Endpoints

### Get User's Subtasks
```bash
GET /api/activity/subtasks/:userId?todayOnly=true
```

**Query Parameters:**
- `todayOnly`: boolean (default: `true`) - Filter to today's subtasks only

**Response:**
```json
{
  "success": true,
  "userId": "user-uuid",
  "subtasks": [
    {
      "id": 1,
      "user_id": "user-uuid",
      "subtask_name": "Backend API development for user authentication system",
      "subtask_summary": "Built login endpoint, implemented JWT validation, and created unit tests",
      "personalized_task_ids": [123, 124, 125, 126],
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T11:30:00Z"
    }
  ],
  "count": 1,
  "todayOnly": true
}
```

### Force Subtask Classification
```bash
POST /api/activity/subtasks/classify/:userId
```

Manually trigger subtask classification (useful for testing or forcing reclassification).

**Response:**
```json
{
  "success": true,
  "message": "Classified 6 tasks into 2 subtasks",
  "subtasksCreated": 1,
  "subtasksUpdated": 1
}
```

---

## Workflow Example

### Day 1 Timeline

**09:00 - 09:20** (20 activities)
```
→ Classified into 2 personalized tasks:
  - Task 1: "Code review on authentication module"
  - Task 2: "Quick Slack communication check"
```
*No subtasks yet (need 4 tasks)*

**09:20 - 09:40** (20 activities)
```
→ Classified into 1 personalized task:
  - Task 3: "Backend API endpoint development"
```
*Still waiting (3/4 tasks)*

**09:40 - 10:00** (20 activities)
```
→ Classified into 1 personalized task:
  - Task 4: "Unit test creation for login flow"
```
*🎯 4 tasks reached! Initial subtask classification triggered*

**Initial Subtasks Created:**
```json
{
  "subtasks": [
    {
      "name": "User authentication system development and testing",
      "summary": "Code review, API development, and unit testing for login functionality",
      "task_ids": [1, 3, 4]
    },
    {
      "name": "Team communication and status updates via Slack",
      "summary": "Quick team check-in on design feedback channel",
      "task_ids": [2]
    }
  ]
}
```

**10:00 - 10:20** (20 activities)
```
→ Classified into 1 personalized task:
  - Task 5: "JWT token validation implementation"
```
*🔄 Subtask reclassification triggered automatically*

**Updated Subtasks:**
```json
{
  "subtasks": [
    {
      "id": 1,
      "name": "User authentication system development and testing",
      "summary": "Code review, API development, JWT implementation, and unit testing",
      "task_ids": [1, 3, 4, 5]  // Task 5 added!
    },
    {
      "id": 2,
      "name": "Team communication and status updates via Slack",
      "summary": "Quick team check-in on design feedback channel",
      "task_ids": [2]
    }
  ]
}
```

---

## AI Classification Prompts

### Initial Classification (First 4 Tasks)
When no subtasks exist, Gemini receives:
```
Tasks: [Task1, Task2, Task3, Task4]
Instructions: Group into logical subtasks
```

### Incremental Classification (After Initial)
When new task arrives:
```
Existing Subtasks: [{id: 1, name: "...", task_ids: [1,3,4]}, ...]
New Task: Task 5
Instructions: Add to existing subtask OR create new one
```

---

## Benefits

✅ **Automatic Organization**: No manual tagging required  
✅ **High-Level Overview**: See major work streams at a glance  
✅ **Dynamic Grouping**: Subtasks evolve as work progresses  
✅ **Context Preservation**: Related tasks stay together  
✅ **Time-Based**: Daily reset for fresh organization  

---

## Database Setup

Run the migration:
```bash
psql -f apps/api/database-subtasks-setup.sql
```

Or in Supabase SQL Editor, paste the contents of `database-subtasks-setup.sql`.

---

## Testing

```bash
# 1. Send 80 activities (4 batches of 20)
# This will create 4+ personalized tasks

# 2. Check subtasks
curl http://localhost:3001/api/activity/subtasks/user-uuid

# 3. Send more activities
# Watch subtasks automatically update

# 4. Force reclassification (optional)
curl -X POST http://localhost:3001/api/activity/subtasks/classify/user-uuid
```

---

## Console Output

When subtasks are created/updated:
```
🧩 Triggering subtask classification for user abc-123...
🧩 Classifying 4 tasks into subtasks for user abc-123...
📊 Existing subtasks: 0
✅ Created subtask: "Backend API development for user authentication" (3 tasks)
✅ Created subtask: "Team communication via Slack" (1 tasks)
```

---

## Notes

- Subtasks reset daily (only today's tasks are grouped)
- Minimum 4 personalized tasks required for initial classification
- After initial classification, every new task triggers reclassification
- Gemini AI decides whether to merge or create new subtasks
- Subtask summaries are regenerated each time to stay accurate 