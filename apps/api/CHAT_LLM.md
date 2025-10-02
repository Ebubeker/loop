# 💬 Chat LLM Feature (RAG-based Q&A)

## Overview

The **Chat LLM** feature allows you to ask natural language questions about your work activity logs. It uses **Retrieval-Augmented Generation (RAG)** with vector embeddings to find relevant context and generate accurate, contextual answers.

## Architecture

```
User Question
    ↓
Generate Embedding (Gemini text-embedding-004)
    ↓
Vector Similarity Search (pgvector)
    ↓
Retrieve Top 10 Most Relevant Logs
    ↓
Feed to Gemini 2.5 Flash with Context
    ↓
Generate Contextual Answer
    ↓
Save to Chat History
```

## Technology Stack

- **Vector Database**: PostgreSQL with pgvector extension
- **Embeddings**: Google Gemini `text-embedding-004` (768 dimensions)
- **LLM**: Google Gemini 2.5 Flash
- **Similarity Search**: Cosine similarity with HNSW index

---

## Database Setup

### 1. Run the Migration

```bash
psql -f apps/api/database-embeddings-setup.sql
```

This creates:
- `activity_embeddings` table - stores vector embeddings
- `chat_history` table - stores Q&A history
- `search_activity_embeddings()` function - similarity search
- HNSW index for fast vector search

### 2. Enable pgvector Extension

The migration automatically enables pgvector, but you can verify:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Environment Variables

Add to your `apps/api/.env` (you should already have this):

```env
GEMINI_API_KEY=your-gemini-api-key-here
```

**Note:** No additional dependencies needed! We use Gemini for both embeddings and LLM responses.

---

## How It Works

### Step 1: Generate Embeddings

Before you can ask questions, you need to generate embeddings for your existing data:

```bash
POST /api/activity/chat/embeddings/generate/:userId
```

This will:
- Fetch all processed_tasks, subtasks, and major_tasks for the user
- Generate embeddings for each using Gemini
- Store embeddings in `activity_embeddings` table
- Takes ~50ms per item (rate limited)

**Response:**
```json
{
  "success": true,
  "processedTasks": 45,
  "subtasks": 8,
  "majorTasks": 2,
  "errors": 0
}
```

### Step 2: Ask Questions

```bash
POST /api/activity/chat/ask/:userId
Content-Type: application/json

{
  "question": "What did I work on today?",
  "limit": 10,
  "similarityThreshold": 0.5,
  "includeHistory": false
}
```

**How it works:**
1. Your question is converted to a vector embedding (Gemini)
2. Similarity search finds the 10 most relevant activity logs (pgvector)
3. Relevant logs + question are sent to Gemini AI
4. AI generates a contextual answer based only on your logs
5. Answer and context are saved to chat history

**Response:**
```json
{
  "success": true,
  "response": "Based on your activity logs, you worked on several things today:\n\n[1] You spent 45 minutes on Backend API development with authentication implementation...\n\n[3] You also spent 20 minutes reviewing code...",
  "context": [
    {
      "id": "processed_task_123",
      "source_type": "processed_task",
      "source_id": 123,
      "content": "Task: Backend authentication implementation...",
      "similarity": 0.89,
      "rank": 1
    }
  ]
}
```

---

## API Endpoints

### Ask a Question
```bash
POST /api/activity/chat/ask/:userId
```

**Body:**
```json
{
  "question": "What did I work on today?",
  "limit": 10,              // Max results to retrieve (default: 10)
  "similarityThreshold": 0.5, // Min similarity score (default: 0.5)
  "includeHistory": false    // Include recent chat context (default: false)
}
```

### Get Chat History
```bash
GET /api/activity/chat/history/:userId?limit=20
```

**Response:**
```json
{
  "success": true,
  "history": [
    {
      "id": 1,
      "question": "What did I work on today?",
      "response": "You worked on...",
      "context_sources": [...],
      "created_at": "2024-01-01T10:00:00Z"
    }
  ],
  "count": 1
}
```

### Clear Chat History
```bash
DELETE /api/activity/chat/history/:userId
```

### Get Suggested Questions
```bash
GET /api/activity/chat/suggestions/:userId
```

**Response:**
```json
{
  "success": true,
  "suggestions": [
    "What did I work on today?",
    "How much time did I spend on coding tasks?",
    "What were my most productive hours today?",
    "What are my main work streams this week?",
    "Summarize my major projects"
  ]
}
```

### Generate Embeddings
```bash
POST /api/activity/chat/embeddings/generate/:userId
```

Generates embeddings for all existing activity data. Run this once initially, or when you want to refresh embeddings.

---

## Example Questions

### Time and Duration
- "How much time did I spend on coding today?"
- "What was my longest task this week?"
- "When did I work on the authentication system?"

### Task Analysis
- "What did I work on today?"
- "Summarize my work this week"
- "What are my main projects?"
- "Show me all tasks related to backend API"

### Productivity Insights
- "What were my most productive hours?"
- "Which project took the most time?"
- "How much time did I spend in meetings?"

### Specific Searches
- "Find all activities with VS Code"
- "What tasks involved testing?"
- "Show me work related to database optimization"

---

## Embedding Content Format

Each activity type is embedded with rich context:

### Processed Task
```
Task: Backend authentication implementation
Description: Implemented JWT login with refresh tokens...
Duration: 45 minutes
Status: completed
Time: 1/1/2024, 10:00:00 AM
Apps/Activities: VS Code, Chrome, Postman
```

### Subtask
```
Subtask: User authentication system development and testing
Summary: Implemented login, JWT validation, and testing
Number of tasks: 5
Last updated: 1/1/2024, 3:00:00 PM
```

### Major Task
```
Major Task: Comprehensive Backend API Development with Authentication...
Summary:
• Implemented JWT authentication with refresh tokens
• Created comprehensive testing suite
• Optimized database queries
Number of subtasks: 3
Last updated: 1/1/2024, 5:00:00 PM
```

---

## How Embeddings Work

### What are Embeddings?
Embeddings convert text into 768-dimensional vectors that capture semantic meaning. Similar concepts have similar vectors.

Example:
```
"authentication system" → [0.23, -0.45, 0.67, ...]
"login implementation"  → [0.25, -0.43, 0.65, ...] ← Similar!
"database optimization" → [-0.45, 0.23, -0.12, ...] ← Different
```

### Similarity Search
When you ask "What did I work on authentication?":
1. Question → embedding vector
2. Find activity embeddings with highest cosine similarity
3. Return top matches (similarity > 0.5)

### Why pgvector?
- Native PostgreSQL extension
- Fast HNSW index for approximate nearest neighbor search
- No external service needed
- Works with existing Supabase database

---

## Performance

### Embedding Generation
- ~50ms per item (Gemini API)
- Rate limited to avoid API throttling
- One-time operation (or refresh as needed)
- Cost: **FREE** (included in Gemini API)

### Query Time
- Embedding generation: ~50ms
- Vector search: <50ms (with HNSW index)
- LLM response: 1-3 seconds
- **Total: ~1.5-3.5 seconds per question**

### Costs
- Gemini Embeddings: **FREE**
- Gemini 2.5 Flash: Free tier (15 RPM, 1M TPM, 1500 RPD)
- **Typical question: $0.00** (within free tier)

---

## Best Practices

### 1. Generate Embeddings Initially
```bash
# After setting up, generate embeddings for existing data
curl -X POST http://localhost:3001/api/activity/chat/embeddings/generate/user-uuid
```

### 2. Ask Specific Questions
✅ "How much time did I spend on backend API work this week?"  
❌ "Tell me about my work"

### 3. Use Similarity Threshold
- 0.5 = balanced (default)
- 0.7 = more strict, fewer but more relevant results
- 0.3 = more lenient, more results but less relevant

### 4. Include History for Context
Set `includeHistory: true` for follow-up questions:
```
Q: "What did I work on today?"
A: "You worked on authentication and testing..."
Q: "How long did that take?" ← AI knows "that" = authentication
```

---

## Troubleshooting

### No Results Found
- Check if embeddings exist: `SELECT COUNT(*) FROM activity_embeddings WHERE user_id = 'your-id';`
- Generate embeddings: `POST /api/activity/chat/embeddings/generate/:userId`
- Lower similarity threshold: `similarityThreshold: 0.3`

### Slow Queries
- Ensure HNSW index is created: `\d+ activity_embeddings`
- Check index exists: `idx_activity_embeddings_vector`
- Rebuild index if needed

### Gemini API Errors
- Verify API key: `echo $GEMINI_API_KEY`
- Check rate limits (15 requests/minute on free tier)
- Ensure network connectivity to Google AI services

---

## Future Enhancements

Potential improvements:
- [ ] Auto-embed new tasks/subtasks/major tasks on creation
- [ ] Support for date/time filters ("last week", "today")
- [ ] Multi-turn conversations with full context
- [ ] Export chat history as markdown
- [ ] Voice input/output
- [ ] Custom similarity thresholds per user

---

## Example Workflow

```bash
# 1. Setup (one-time)
psql -f apps/api/database-embeddings-setup.sql

# 2. Generate embeddings for existing data
curl -X POST http://localhost:3001/api/activity/chat/embeddings/generate/user-123

# 3. Get suggested questions
curl http://localhost:3001/api/activity/chat/suggestions/user-123

# 4. Ask a question
curl -X POST http://localhost:3001/api/activity/chat/ask/user-123 \
  -H "Content-Type: application/json" \
  -d '{"question": "What did I work on today?"}'

# 5. View chat history
curl http://localhost:3001/api/activity/chat/history/user-123
```

---

## Integration Notes

### Automatic Embedding Generation
To automatically generate embeddings when new data is created, add this to your services:

```typescript
// After saving a processed task
await EmbeddingService.embedProcessedTask(taskId, userId);

// After saving a subtask
await EmbeddingService.embedSubtask(subtaskId, userId);

// After saving a major task
await EmbeddingService.embedMajorTask(majorTaskId, userId);
```

This ensures new data is immediately searchable.

---

## Security

- RLS (Row Level Security) enabled on all tables
- Users can only access their own embeddings and chat history
- API keys stored securely in environment variables
- No PII in embeddings (only work activity data)

---

## Summary

The Chat LLM feature brings powerful natural language querying to your activity tracking system:

✅ Ask questions in plain English  
✅ Get accurate, contextual answers  
✅ Fast semantic search with pgvector  
✅ Automatic context retrieval  
✅ Chat history preserved  
✅ Suggested questions for discovery  

Start chatting with your work logs today! 🚀 