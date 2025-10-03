import { supabase } from './database';
import { SubtaskService } from './subtaskService';

interface Activity {
  userId: string;
  app: string;
  title: string;
  timestamp: string;
  duration: string;
  afkStatus: string;
  idleTime: number;
  windowDetails?: any;
  processInfo?: any;
}

interface UserBuffer {
  activities: Activity[];
  lastClassified: string;
}

export class ActivityBufferService {
  private static buffers: Map<string, UserBuffer> = new Map();
  private static readonly BUFFER_SIZE = 20;

  /**
   * Add activity to user's buffer and classify if buffer is full
   */
  static async addActivity(activity: Activity): Promise<{ 
    success: boolean; 
    buffered: boolean;
    classified?: boolean;
    bufferSize?: number;
    message?: string;
  }> {
    const { userId } = activity;

    // Initialize buffer if doesn't exist
    if (!this.buffers.has(userId)) {
      this.buffers.set(userId, {
        activities: [],
        lastClassified: new Date().toISOString()
      });
    }

    const buffer = this.buffers.get(userId)!;
    
    // Add activity to buffer
    buffer.activities.push(activity);
    
    console.log(`📝 Activity buffered for user ${userId}: ${activity.app} - ${activity.title} (${buffer.activities.length}/${this.BUFFER_SIZE})`);

    // Check if buffer has exactly 20 activities (classify every 20: at 20, 40, 60, etc.)
    if (buffer.activities.length === this.BUFFER_SIZE) {
      console.log(`🎯 Buffer reached ${this.BUFFER_SIZE} activities for user ${userId}, triggering classification...`);
      
      const classificationResult = await this.classifyAndSave(userId);
      
      return {
        success: true,
        buffered: true,
        classified: true,
        bufferSize: 0, // Buffer is now empty
        message: `Activity added and ${this.BUFFER_SIZE} activities classified and saved`
      };
    }

    return {
      success: true,
      buffered: true,
      classified: false,
      bufferSize: buffer.activities.length,
      message: `Activity buffered (${buffer.activities.length}/${this.BUFFER_SIZE})`
    };
  }

  /**
   * Classify activities and save to processed_tasks
   */
  private static async classifyAndSave(userId: string): Promise<boolean> {
    const buffer = this.buffers.get(userId);
    
    if (!buffer || buffer.activities.length === 0) {
      console.log(`⚠️ No activities to classify for user ${userId}`);
      return false;
    }

    try {
      // Prepare activities in the format expected by the system prompt
      const logs = {
        timestamp_start: buffer.activities[0]?.timestamp || new Date().toISOString(),
        timestamp_end: buffer.activities[buffer.activities.length - 1]?.timestamp || new Date().toISOString(),
        activities: buffer.activities.map(act => ({
          ts: act.timestamp,
          app: act.app,
          action: "activity", // Generic action since we don't have specific actions from client
          text: act.title,
          window_title: act.title
        }))
      };

      console.log(`🤖 Classifying ${buffer.activities.length} activities for user ${userId}...`);

      // Call Gemini for classification using the custom system prompt
      const systemPrompt = `
You are a real-time activity classifier. Every input you receive is a 1-minute batch of up to 20 atomic in-screen activities captured while a user works. Your job is to:

1. Group those activities into coherent task clusters.
2. Produce a concise human-readable summary for each cluster.
3. Return structured JSON only, following the schema below. Do not return any narrative text outside the JSON.

Rules and heuristics:

* Cluster by intent and topic first, then by application context. Intent examples: coding, debugging, reading, writing, researching, reviewing, emailing, meeting, design, testing, data analysis, watching tutorial, idle/afk.
* Use application context (window title, app name, URL) and action verbs (typed, clicked, opened, closed, copied, pasted, scrolled, navigated, played, paused) to decide clusters.
* Merge events into the same cluster if they share the same intent and domain keywords, or if 60% or more of events are from the same app and have similar verbs.
* If events are noisy (short unrelated clicks, notifications, quick alt-tabs) and do not form a coherent cluster, mark them as "noise" and group under a single cluster with label "other / noise".
* Always assign one primary cluster even if multiple clusters exist; primary = cluster with highest total duration or highest event count if duration not available.
* Never invent facts. If a field cannot be determined, use null or "unknown".
* Provide a confidence score for each cluster between 0.0 and 1.0 reflecting how sure you are of the label and summary.
* Keep each summary concise: 8-20 words.
* Include top 3 keywords for each cluster derived from content, titles, and text snippets.
* Provide a productivity estimate per cluster: "low", "medium", or "high", based on intent and active actions (typing, clicking, debugging = higher; idle, watching video without notes = lower).
* If multiple plausible labels exist, include alternatives in "alternative_labels".

Input Data:
${JSON.stringify(logs, null, 2)}

JSON output rules:

* Output must be valid JSON and follow this schema exactly.
* Do not include commentary, code fences, or any non-JSON wrapper.

Schema:

{
  "timestamp_start": "ISO8601 string",
  "timestamp_end": "ISO8601 string",
  "activities_count": integer,
  "clusters": [
    {
      "cluster_id": integer,
      "label": "string",
      "alternative_labels": ["string", "..."],
      "summary": "string",
      "apps": ["app name or browser domain", "..."],
      "top_actions": ["typed", "clicked", "navigated", "..."],
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "events_count": integer,
      "duration_seconds": integer or null,
      "probable_task_type": "coding|debugging|reading|writing|research|email|meeting|design|testing|browsing|other",
      "productivity": "low|medium|high",
      "confidence": float,
      "suggested_next_action": "string or null"
    }
  ],
  "primary_cluster_id": integer,
  "session_summary": "one concise sentence (10-25 words) summarizing the whole minute",
  "overall_productivity": "low|medium|high",
  "notes": "null or short string if special handling required"
}

---

### Behavior examples and edge cases:

**Example 1 - Email drafting with reference lookup**

{
  "clusters": [
    {
      "cluster_id": 1,
      "label": "email drafting with internal policy referencing and attachment handling",
      "alternative_labels": ["email","writing"],
      "summary": "Composed release email, inserted policy excerpt, attached notes and sent message.",
      ...
    }
  ]
}

---

**Example 2 - UI design session in Figma with quick Slack check**

{
  "clusters": [
    {
      "cluster_id": 1,
      "label": "interface design work on dashboard layout with asset export",
      "alternative_labels": ["design","Figma editing"],
      "summary": "Edited dashboard layout, resized UI components and exported visual assets.",
      ...
    },
    {
      "cluster_id": 2,
      "label": "quick Slack check for design team communication and feedback",
      "alternative_labels": ["slack","communication"],
      "summary": "Briefly checked Slack #design channel for potential design-related feedback messages.",
      ...
    }
  ]
}

---

**Example 3 - Deep research across browser and PDF reader with note taking**

{
  "clusters": [
    {
      "cluster_id": 1,
      "label": "literature review with academic paper reading and structured note taking",
      "alternative_labels": ["research","reading"],
      "summary": "Reviewed academic paper PDF, highlighted sections and captured structured research notes in Obsidian.",
      ...
    }
  ]
}

---

**Example 4 - Watching tutorial video and active note taking (two clusters)**

{
  "clusters": [
    {
      "cluster_id": 1,
      "label": "tutorial video learning session with pauses and resuming for understanding",
      "alternative_labels": ["video learning","watching"],
      "summary": "Watched Node deployment tutorial, paused video to process and resumed playback for further steps.",
      ...
    },
    {
      "cluster_id": 2,
      "label": "active note taking of tutorial steps and environment configuration details",
      "alternative_labels": ["note-taking","documentation"],
      "summary": "Took structured deployment notes in Notion with commands and environment setup reminders.",
      ...
    }
  ]
}

---

**Example 5 - Noise heavy minute with media playing and frequent alt-tab**

{
  "clusters": [
    {
      "cluster_id": 1,
      "label": "background focus music playback in Spotify alongside task switching",
      "alternative_labels": ["music","listening"],
      "summary": "Played focus music in Spotify while intermittently switching between unrelated applications.",
      ...
    },
    {
      "cluster_id": 2,
      "label": "transient application switching with short browsing and notification interruptions",
      "alternative_labels": ["noise","alt-tab activity"],
      "summary": "Frequent alt-tab, quick news site view and notifications, with no focused workflow detected.",
      ...
    }
  ]
}

`;

      // Call Gemini API directly
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const result = await model.generateContent(systemPrompt);
      const response = await result.response;
      const classificationResult = response.text();
      
      // Parse the result
      let parsed;
      try {
        // Clean up response (remove markdown code blocks if present)
        const cleanedResult = classificationResult
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        
        parsed = JSON.parse(cleanedResult);
      } catch (parseError) {
        console.error('❌ Failed to parse classification result:', parseError);
        console.error('Raw result:', classificationResult);
        return false;
      }

      const clusters = parsed.clusters || [];
      const savedTaskIds: number[] = [];
      
      // Save each cluster as a task to processed_tasks
      for (const cluster of clusters) {
        const durationMinutes = cluster.duration_seconds ? Math.round(cluster.duration_seconds / 60) : 0;
        
        // Prepare task data with extended cluster metadata
        const taskData: any = {
          user_id: userId,
          task_title: cluster.label || 'Unknown task',
          task_description: cluster.summary || '',
          start_time: parsed.timestamp_start,
          end_time: parsed.timestamp_end,
          status: 'completed',
          duration_minutes: durationMinutes,
          activity_summaries: cluster.apps || [],
          created_at: new Date().toISOString()
        };

        // Add metadata field if your database supports it (optional)
        // Uncomment if you have a 'metadata' JSONB column in processed_tasks table
        /*
        taskData.metadata = {
          cluster_id: cluster.cluster_id,
          alternative_labels: cluster.alternative_labels,
          top_actions: cluster.top_actions,
          keywords: cluster.keywords,
          probable_task_type: cluster.probable_task_type,
          productivity: cluster.productivity,
          confidence: cluster.confidence,
          suggested_next_action: cluster.suggested_next_action,
          session_summary: parsed.session_summary,
          overall_productivity: parsed.overall_productivity,
          is_primary: cluster.cluster_id === parsed.primary_cluster_id
        };
        */

        const { data, error } = await supabase
          .from('processed_tasks')
          .insert(taskData)
          .select()
          .single();

        if (error) {
          console.error(`❌ Failed to save cluster for user ${userId}:`, error);
        } else {
          console.log(`✅ Cluster saved for user ${userId}: "${cluster.label}" (${durationMinutes} min, ${cluster.productivity} productivity, ${cluster.confidence} confidence)`);
          if (data?.id) {
            savedTaskIds.push(data.id);
            
            // Auto-generate embedding for this processed task (non-blocking)
            const { EmbeddingAutoGenerator } = await import('./embeddingAutoGenerator');
            EmbeddingAutoGenerator.generateForProcessedTask(data.id, userId);
          }
        }
      }
      
      // Trigger subtask classification if conditions are met
      if (savedTaskIds.length > 0) {
        const shouldTrigger = await SubtaskService.shouldTriggerClassification(userId);
        if (shouldTrigger) {
          console.log(`🧩 Triggering subtask classification for user ${userId}...`);
          // Classify with the most recent task ID
          const newestTaskId = savedTaskIds[savedTaskIds.length - 1];
          await SubtaskService.classifyIntoSubtasks(userId, newestTaskId);
        }
      }

      // Clear buffer after successful classification
      buffer.activities = [];
      buffer.lastClassified = new Date().toISOString();

      console.log(`🎉 Successfully classified and saved ${clusters.length} cluster(s) for user ${userId}`);
      
      return true;
    } catch (error) {
      console.error('❌ Classification error:', error);
      return false;
    }
  }

  /**
   * Force classify current buffer (even if not full)
   */
  static async forceClassify(userId: string): Promise<{ 
    success: boolean; 
    tasksCreated?: number;
    message?: string;
  }> {
    const buffer = this.buffers.get(userId);
    
    if (!buffer || buffer.activities.length === 0) {
      return {
        success: false,
        message: 'No activities in buffer to classify'
      };
    }

    const activitiesCount = buffer.activities.length;
    const success = await this.classifyAndSave(userId);
    
    return {
      success,
      message: success 
        ? `Successfully classified ${activitiesCount} activities`
        : 'Failed to classify activities'
    };
  }

  /**
   * Get current buffer status for a user
   */
  static getBufferStatus(userId: string): {
    exists: boolean;
    size: number;
    maxSize: number;
    percentage: number;
    lastClassified?: string;
  } {
    const buffer = this.buffers.get(userId);
    
    if (!buffer) {
      return {
        exists: false,
        size: 0,
        maxSize: this.BUFFER_SIZE,
        percentage: 0
      };
    }

    return {
      exists: true,
      size: buffer.activities.length,
      maxSize: this.BUFFER_SIZE,
      percentage: (buffer.activities.length / this.BUFFER_SIZE) * 100,
      lastClassified: buffer.lastClassified
    };
  }

  /**
   * Clear buffer for a user
   */
  static clearBuffer(userId: string): boolean {
    return this.buffers.delete(userId);
  }

  /**
   * Get all active buffers
   */
  static getAllBuffers(): Map<string, UserBuffer> {
    return this.buffers;
  }
} 