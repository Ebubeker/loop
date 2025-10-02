# 🏗️ Major Tasks Feature

## Overview

**Major Tasks** represent the highest level of work organization in your activity tracking system. They group related subtasks into significant projects, initiatives, or work streams, providing a bird's-eye view of your major accomplishments.

## Complete Hierarchy

```
Raw Activities (from client)
    ↓ (buffer 20 at a time)
Personalized Tasks (AI-classified clusters)
    ↓ (group after 4 tasks)
Subtasks (work streams)
    ↓ (group on creation or 10 updates)
Major Tasks (projects/initiatives)
```

### Example Flow:

```
Activity: "VS Code - auth.ts"
    ↓
Personalized Task: "Backend authentication implementation"
    ↓
Subtask: "User authentication system development and testing"
    ↓
Major Task: "Comprehensive Backend API Development with Authentication, Security, and Performance Optimization"
```

---

## Triggering Conditions

Major task classification runs **rarely** under **two specific conditions**:

### 1. **When New Subtasks Are Created**
```
Subtask 1 created → Wait
Subtask 2 created → 🏗️ TRIGGER Major Task Classification
```

### 2. **When a Subtask Reaches 10 Updates**
```
Subtask 1: update_count = 0
Subtask 1: update_count = 1 (new task added)
Subtask 1: update_count = 2
...
Subtask 1: update_count = 10 → 🏗️ TRIGGER Major Task Classification
                              → Reset update_count to 0
```

**Note:** Each subtask update happens when a new personalized task is added to it, so **10 updates = ~5 new personalized tasks added** (since classification typically updates multiple subtasks).

---

## Database Schema

### Table: `major_tasks`

```sql
CREATE TABLE major_tasks (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    major_task_title TEXT NOT NULL,          -- Long descriptive title
    major_task_summary TEXT[] NOT NULL,       -- Array of bullet points
    subtask_ids INTEGER[] NOT NULL,           -- Array of subtask IDs
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
```

### Updated: `subtasks` table

```sql
ALTER TABLE subtasks 
ADD COLUMN update_count INTEGER NOT NULL DEFAULT 0;
```

**Fields:**
- `major_task_title`: Long descriptive title (15-25 words)
  - Example: *"Comprehensive Backend API Development with Authentication, Security, and Performance Optimization"*
- `major_task_summary`: Array of 3-5 bullet points
  - Example: `["Implemented JWT authentication with refresh tokens", "Added automated unit and integration tests", "Optimized database queries for 40% performance improvement"]`
- `subtask_ids`: Array of subtask IDs in this major task

---

## API Endpoints

### Get User's Major Tasks
```bash
GET /api/activity/major-tasks/:userId?todayOnly=true
```

**Query Parameters:**
- `todayOnly`: boolean (default: `true`) - Filter to today's major tasks only

**Response:**
```json
{
  "success": true,
  "userId": "user-uuid",
  "majorTasks": [
    {
      "id": 1,
      "user_id": "user-uuid",
      "major_task_title": "Comprehensive Backend API Development with Authentication, Security, and Performance Optimization",
      "major_task_summary": [
        "Implemented JWT authentication with refresh tokens and secure session management",
        "Created comprehensive automated testing suite with 90% code coverage",
        "Optimized database queries and added caching layer for improved performance",
        "Added security middleware and input validation across all endpoints"
      ],
      "subtask_ids": [1, 2, 3],
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T15:30:00Z"
    }
  ],
  "count": 1,
  "todayOnly": true
}
```

### Force Major Task Classification
```bash
POST /api/activity/major-tasks/classify/:userId
```

Manually trigger major task classification (useful for testing or forcing reclassification).

**Response:**
```json
{
  "success": true,
  "message": "Classified 5 subtasks into 2 major tasks",
  "majorTasksCreated": 1,
  "majorTasksUpdated": 1
}
```

---

## Complete Workflow Example

### Morning Work Session

**09:00-09:20** (20 activities)
```
→ 2 Personalized Tasks created
   - "Backend authentication code review"
   - "Quick Slack check"
```

**09:20-09:40** (20 activities)
```
→ 1 Personalized Task created
   - "API endpoint development"
```

**09:40-10:00** (20 activities)
```
→ 1 Personalized Task created
   - "Unit test creation"

🎯 4 Tasks reached → Subtask classification triggered
```

**Subtasks Created:**
```json
{
  "subtasks": [
    {
      "id": 1,
      "name": "User authentication system development",
      "task_ids": [1, 3, 4],
      "update_count": 0
    },
    {
      "id": 2,
      "name": "Team communication",
      "task_ids": [2],
      "update_count": 0
    }
  ]
}
```

**🏗️ New subtasks detected → Major Task Classification triggered!**

**Major Task Created:**
```json
{
  "major_tasks": [
    {
      "id": 1,
      "title": "Comprehensive Backend API Development with Authentication and Security Features",
      "summary_bullets": [
        "Implemented user authentication system with code review and testing",
        "Developed secure API endpoints with validation"
      ],
      "subtask_ids": [1]
    },
    {
      "id": 2,
      "title": "Team Collaboration and Communication Management",
      "summary_bullets": [
        "Maintained team communication through Slack channels"
      ],
      "subtask_ids": [2]
    }
  ]
}
```

### Throughout the Day (Multiple Updates)

**10:00, 10:20, 10:40...** (more activities)
```
→ New tasks added to Subtask 1
   Update count: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
```

**🎯 Subtask 1 reached 10 updates → Major Task reclassification triggered!**

**Major Task Updated:**
```json
{
  "major_tasks": [
    {
      "id": 1,
      "title": "Comprehensive Backend API Development with Authentication, Security, and Performance Optimization",
      "summary_bullets": [
        "Implemented JWT authentication with refresh tokens and session management",
        "Created comprehensive testing suite with 90% coverage",
        "Optimized database queries and added caching for performance",
        "Added security middleware across all endpoints"
      ],
      "subtask_ids": [1, 3, 4]  // May have absorbed other subtasks
    }
  ]
}
```

---

## AI Classification Logic

### Initial Classification (First Subtasks)
```
Input: All subtasks for today
Process: Group by high-level project/initiative
Output: Major tasks with descriptive titles and bullet summaries
```

### Update Classification (Threshold Reached or New Subtask)
```
Input: Existing major tasks + all current subtasks
Process: 
  1. Try to fit subtasks into existing major tasks
  2. Create new major task if subtask represents new direction
  3. Update summaries to reflect all work
Output: Updated major tasks
```

---

## Classification Rules

1. **High-Level Grouping**: Major tasks represent significant projects, not individual features
2. **Descriptive Titles**: 15-25 words capturing full scope
3. **Bullet Summaries**: 3-5 points describing key accomplishments
4. **Meaningful Categories**: Projects, initiatives, systems, or major components
5. **Conservative Creation**: Don't create new major tasks for minor variations

### Good Major Task Titles

✅ "Comprehensive Backend API Development with Authentication, Security, and Performance Optimization"  
✅ "Frontend User Interface Redesign with Improved UX, Accessibility Features, and Mobile Responsiveness"  
✅ "Database Migration and Schema Optimization for Scalability, Performance, and Data Integrity"

### Bad Major Task Titles

❌ "Coding"  
❌ "Backend Work"  
❌ "API Updates"

---

## Benefits

✅ **Strategic Overview**: See major projects at a glance  
✅ **Automatic Organization**: No manual categorization needed  
✅ **Rare Triggers**: Only runs when truly needed (new subtasks or 10 updates)  
✅ **Comprehensive Summaries**: Bullet-point format for easy scanning  
✅ **Dynamic Evolution**: Major tasks grow and adapt as work progresses  

---

## Database Setup

Run the migration:
```bash
psql -f apps/api/database-major-tasks-setup.sql
```

This will:
1. Create `major_tasks` table
2. Add `update_count` column to `subtasks` table
3. Create necessary indexes
4. Set up RLS policies
5. Add auto-update triggers

---

## Testing

```bash
# 1. Generate enough subtasks (send many activities)
# Each 20 activities → personalized tasks
# Each 4 tasks → subtasks
# New subtasks → major tasks!

# 2. Check major tasks
curl http://localhost:3001/api/activity/major-tasks/user-uuid

# 3. Keep adding activities to trigger update threshold
# Watch console for:
# "🎯 Subtask X reached 10 updates - triggering major task classification"

# 4. Force reclassification (optional)
curl -X POST http://localhost:3001/api/activity/major-tasks/classify/user-uuid
```

---

## Console Output

### When New Subtasks Trigger Classification:
```
✅ Created subtask: "User authentication system development" (3 tasks)
🏗️ New subtasks created - triggering major task classification...
🏗️ Classifying 2 subtasks into major tasks...
📊 Existing major tasks: 0
🎯 Trigger reason: new_subtask
✅ Created major task: "Comprehensive Backend API Development..." (1 subtasks)
```

### When Update Threshold Triggers Classification:
```
✅ Updated subtask: "User auth..." (8 tasks, 10 updates)
🎯 Subtask 1 reached 10 updates - will trigger major task classification
🏗️ Subtask threshold reached - triggering major task classification...
🏗️ Classifying 3 subtasks into major tasks...
📊 Existing major tasks: 1
🎯 Trigger reason: threshold_reached
✅ Updated major task: "Comprehensive Backend API Development..." (2 subtasks)
```

---

## Integration with Existing System

Major tasks are **fully automatic** and integrated into the existing flow:

```
POST /api/activity/add (from your client)
    ↓
Buffer (20 activities)
    ↓
Personalized Tasks Classification
    ↓
Subtasks Classification (if 4+ tasks)
    ↓
🏗️ Major Tasks Classification (if new subtasks or 10 updates)
```

No changes needed to your client - everything happens server-side!

---

## Notes

- Major tasks reset daily (only today's subtasks are grouped)
- Update count tracks subtask modifications
- After major task classification triggered by threshold, update_count resets to 0
- Gemini AI decides grouping based on high-level project similarity
- Major task summaries are regenerated each time for accuracy
- Rare trigger conditions mean less AI API usage and cost 