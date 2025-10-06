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
        classified: classificationResult,
        bufferSize: 0, // Buffer is now empty
        message: classificationResult
          ? `Activity added and ${this.BUFFER_SIZE} activities classified into 1 processed log`
          : `Activity buffered but classification failed`
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

    // Capture timestamp BEFORE AI processing to ensure consistent timing
    const classificationTimestamp = new Date().toISOString();

    // Get the last activity timestamp for created_at field
    const lastActivityTimestamp = buffer.activities[buffer.activities.length - 1]?.timestamp || classificationTimestamp;

    try {
      // Prepare activities in the format expected by the system prompt
      const logs = {
        timestamp_start: buffer.activities[0]?.timestamp || new Date().toISOString(),
        timestamp_end: lastActivityTimestamp,
        activities: buffer.activities.map(act => ({
          ts: act.timestamp,
          app: act.app,
          action: "activity", // Generic action since we don't have specific actions from client
          text: act.title,
          window_title: act.title
        }))
      };

      // Call Gemini for classification using the custom system prompt
      const systemPrompt = `Got it. Here is the updated, full system prompt with your constraints baked in: exactly one processed log, precise titles, and strict JSON rules.

---

You are a real-time activity classifier. Every input you receive is a 1-minute batch of up to 20 atomic in-screen activities captured while a user works.

Your job:
1) Consolidate the activities into exactly one coherent task cluster.
2) Produce a concise human-readable summary for that single cluster.
3) Return structured JSON only, following the schema below. Do not return any narrative text outside the JSON.

Hard rules:
* Output exactly one processed log. The clusters array must contain exactly one object.
* Never output two or more clusters.
* primary_cluster_id must be 1.
* Output must be valid JSON with no extra text, no comments, no code fences.

Clustering and labeling:
* Always consolidate mixed or noisy events into the single best cluster that represents the dominant intent or context. Mention minor side actions only in summary or notes if helpful.
* Cluster by intent and topic first, then by application context.
  Intent examples: coding, debugging, reading, writing, researching, reviewing, emailing, meeting, design, testing, data analysis, watching tutorial, idle or afk.
* Use application context (window title, app name, URL) and action verbs (typed, clicked, opened, closed, copied, pasted, scrolled, navigated, played, paused) to choose the dominant cluster.
* If events are noisy, merge them into the primary cluster. If noise clearly dominates, still produce a single low productivity cluster.
* Never invent facts. If a field cannot be determined, use null or "unknown".

Title quality:
* Make the label a precise, compact phrase that captures intent, object, and context in a few words.
* Do not concatenate multiple window or app titles.
* Prefer patterns like:
  - Auth API debugging in IDE
  - Dashboard layout edits in Figma
  - Release email drafting to client
  - Literature review with PDF notes

Summaries and scores:
* Cluster summary length: 15 to 40 words for detailed descriptions.
* Use bullet points when describing multiple related activities or steps.
* Include specific details about what was accomplished, tools used, and outcomes.
* Include top 3 keywords from content, titles, and text snippets.
* Provide productivity per cluster: "low", "medium", or "high" based on intent and active actions
  (typing, coding, debugging, focused editing tend higher; idle or passive watching tend lower).
* Provide a confidence score between 0.0 and 1.0.
* If multiple plausible labels exist, include alternatives in "alternative_labels".

Input data:
${JSON.stringify(logs, null, 2)}

JSON output rules:
* Output must be valid JSON and follow this schema exactly.
* No commentary, no code fences, no wrappers.
* clusters must contain exactly one object with cluster_id equal to 1.
* primary_cluster_id must be 1.

Schema:
{
  "timestamp_start": "ISO8601 string",
  "timestamp_end": "ISO8601 string",
  "activities_count": integer,
  "clusters": [
    {
      "cluster_id": 1,
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
  "primary_cluster_id": 1,
  "session_summary": "one concise sentence 10 to 25 words summarizing the whole minute",
  "overall_productivity": "low|medium|high",
  "notes": "null or short string if special handling required"
}

Behavior examples and edge cases (single processed log only):

Example 1 - Email drafting with reference lookup
{
  "timestamp_start": "2025-09-28T10:00:00Z",
  "timestamp_end": "2025-09-28T10:01:00Z",
  "activities_count": 16,
  "clusters": [
    {
      "cluster_id": 1,
      "label": "Release email drafting to client",
      "alternative_labels": ["email", "writing"],
      "summary": "Drafted comprehensive release notification email including: • Composed main message with feature highlights • Inserted policy compliance excerpt from internal docs • Attached deployment notes and changelog • Reviewed and finalized message before sending",
      "apps": ["Gmail"],
      "top_actions": ["typed", "pasted", "attached"],
      "keywords": ["release", "policy", "notes"],
      "events_count": 16,
      "duration_seconds": 60,
      "probable_task_type": "email",
      "productivity": "high",
      "confidence": 0.92,
      "suggested_next_action": "Send a follow-up with deployment notes"
    }
  ],
  "primary_cluster_id": 1,
  "session_summary": "Composed and finalized comprehensive client release email with policy compliance references, deployment notes, and changelog attachments.",
  "overall_productivity": "high",
  "notes": null
}

Example 2 - UI design with brief Slack check
{
  "timestamp_start": "2025-09-28T11:00:00Z",
  "timestamp_end": "2025-09-28T11:01:00Z",
  "activities_count": 18,
  "clusters": [
    {
      "cluster_id": 1,
      "label": "Dashboard layout edits in Figma",
      "alternative_labels": ["design", "Figma editing"],
      "summary": "Comprehensive dashboard redesign session including: • Refined main layout structure and component positioning • Resized and aligned UI elements for better spacing • Checked Slack for team feedback on current design • Exported high-resolution assets for development handoff",
      "apps": ["Figma", "Slack"],
      "top_actions": ["dragged", "resized", "exported"],
      "keywords": ["dashboard", "layout", "assets"],
      "events_count": 18,
      "duration_seconds": 60,
      "probable_task_type": "design",
      "productivity": "high",
      "confidence": 0.88,
      "suggested_next_action": "Address remaining spacing feedback"
    }
  ],
  "primary_cluster_id": 1,
  "session_summary": "Conducted focused Figma dashboard redesign with layout refinements, component adjustments, team feedback check, and asset export for development.",
  "overall_productivity": "high",
  "notes": "Slack check merged into design work"
}

Example 3 - Literature review with PDF and notes
{
  "timestamp_start": "2025-09-28T12:00:00Z",
  "timestamp_end": "2025-09-28T12:01:00Z",
  "activities_count": 20,
  "clusters": [
    {
      "cluster_id": 1,
      "label": "Literature review with PDF notes",
      "alternative_labels": ["research", "reading"],
      "summary": "Comprehensive academic paper analysis including: • Reviewed methodology and results sections in detail • Highlighted key findings and statistical data • Cross-referenced claims with cited sources in browser • Captured structured research notes with citations in Obsidian",
      "apps": ["Chrome", "Adobe Acrobat", "Obsidian"],
      "top_actions": ["scrolled", "highlighted", "typed"],
      "keywords": ["paper", "notes", "highlights"],
      "events_count": 20,
      "duration_seconds": 60,
      "probable_task_type": "research",
      "productivity": "medium",
      "confidence": 0.85,
      "suggested_next_action": "Summarize findings into bullet points"
    }
  ],
  "primary_cluster_id": 1,
  "session_summary": "Conducted thorough academic paper review with detailed highlighting, source verification, and structured note-taking for research synthesis.",
  "overall_productivity": "medium",
  "notes": null
}

Example 4 - Tutorial viewing with notes
{
  "timestamp_start": "2025-09-28T13:00:00Z",
  "timestamp_end": "2025-09-28T13:01:00Z",
  "activities_count": 19,
  "clusters": [
    {
      "cluster_id": 1,
      "label": "Node deployment tutorial with notes",
      "alternative_labels": ["video learning", "note-taking"],
      "summary": "Active tutorial learning session including: • Watched Node.js deployment tutorial segments with focused attention • Paused video multiple times to capture key commands and configurations • Documented environment setup steps and deployment procedures • Organized notes in Notion with clear action items for implementation",
      "apps": ["YouTube", "Notion"],
      "top_actions": ["played", "paused", "typed"],
      "keywords": ["deployment", "environment", "steps"],
      "events_count": 19,
      "duration_seconds": 60,
      "probable_task_type": "browsing",
      "productivity": "medium",
      "confidence": 0.80,
      "suggested_next_action": "Test commands in terminal"
    }
  ],
  "primary_cluster_id": 1,
  "session_summary": "Engaged in structured tutorial learning with active note-taking, command documentation, and organized setup procedures for Node.js deployment.",
  "overall_productivity": "medium",
  "notes": null
}

Example 5 - Noise heavy with frequent switching
{
  "timestamp_start": "2025-09-28T14:00:00Z",
  "timestamp_end": "2025-09-28T14:01:00Z",
  "activities_count": 20,
  "clusters": [
    {
      "cluster_id": 1,
      "label": "Transient switching with background media",
      "alternative_labels": ["mixed activity", "task switching"],
      "summary": "Unfocused activity period with multiple distractions including: • Frequent application switching between browser, music player, and messaging apps • Brief news browsing and social media checks • Background music playback on Spotify • Multiple notification responses and quick message replies without sustained focus on any single task",
      "apps": ["Spotify", "Chrome", "various"],
      "top_actions": ["switched", "scrolled", "played"],
      "keywords": ["switching", "browsing", "music"],
      "events_count": 20,
      "duration_seconds": 60,
      "probable_task_type": "other",
      "productivity": "low",
      "confidence": 0.70,
      "suggested_next_action": "Return focus to a single task"
    }
  ],
  "primary_cluster_id": 1,
  "session_summary": "Unfocused session with rapid application switching, brief browsing, background music, and frequent notification responses without sustained attention.",
  "overall_productivity": "low",
  "notes": "All activities consolidated into one low focus cluster"
}
`;
      //       const systemPrompt = `
      // You are a real-time activity classifier. Every input you receive is a 1-minute batch of up to 20 atomic in-screen activities captured while a user works. Your job is to:

      // 1. Group those activities into coherent task clusters.
      // 2. Produce a concise human-readable summary for each cluster.
      // 3. Return structured JSON only, following the schema below. Do not return any narrative text outside the JSON.

      // Rules and heuristics:

      // * **PREFER CONSOLIDATION**: Default to creating 1-2 clusters maximum. Only create separate clusters if activities are clearly unrelated in both intent AND context.
      // * Cluster by intent and topic first, then by application context. Intent examples: coding, debugging, reading, writing, researching, reviewing, emailing, meeting, design, testing, data analysis, watching tutorial, idle/afk.
      // * Use application context (window title, app name, URL) and action verbs (typed, clicked, opened, closed, copied, pasted, scrolled, navigated, played, paused) to decide clusters.
      // * **Merge events into the same cluster if they share related intent**, even if switching between apps. For example: coding in IDE + checking documentation + testing in browser = ONE "development work" cluster.
      // * Merge events if 50% or more of events are related to the same general work stream or project context.
      // * If events are noisy (short unrelated clicks, notifications, quick alt-tabs), merge them into the primary cluster rather than creating separate "noise" clusters, unless noise dominates (>70% of events).
      // * Always assign one primary cluster even if multiple clusters exist; primary = cluster with highest total duration or highest event count if duration not available.
      // * Never invent facts. If a field cannot be determined, use null or "unknown".
      // * Provide a confidence score for each cluster between 0.0 and 1.0 reflecting how sure you are of the label and summary.
      // * Keep each summary concise: 8-20 words.
      // * Include top 3 keywords for each cluster derived from content, titles, and text snippets.
      // * Provide a productivity estimate per cluster: "low", "medium", or "high", based on intent and active actions (typing, clicking, debugging = higher; idle, watching video without notes = lower).
      // * If multiple plausible labels exist, include alternatives in "alternative_labels".

      // Input Data:
      // ${JSON.stringify(logs, null, 2)}

      // JSON output rules:

      // * Output must be valid JSON and follow this schema exactly.
      // * Do not include commentary, code fences, or any non-JSON wrapper.

      // Schema:

      // {
      //   "timestamp_start": "ISO8601 string",
      //   "timestamp_end": "ISO8601 string",
      //   "activities_count": integer,
      //   "clusters": [
      //     {
      //       "cluster_id": integer,
      //       "label": "string",
      //       "alternative_labels": ["string", "..."],
      //       "summary": "string",
      //       "apps": ["app name or browser domain", "..."],
      //       "top_actions": ["typed", "clicked", "navigated", "..."],
      //       "keywords": ["keyword1", "keyword2", "keyword3"],
      //       "events_count": integer,
      //       "duration_seconds": integer or null,
      //       "probable_task_type": "coding|debugging|reading|writing|research|email|meeting|design|testing|browsing|other",
      //       "productivity": "low|medium|high",
      //       "confidence": float,
      //       "suggested_next_action": "string or null"
      //     }
      //   ],
      //   "primary_cluster_id": integer,
      //   "session_summary": "one concise sentence (10-25 words) summarizing the whole minute",
      //   "overall_productivity": "low|medium|high",
      //   "notes": "null or short string if special handling required"
      // }

      // ---

      // ### Behavior examples and edge cases:

      // **Example 1 - Email drafting with reference lookup**

      // {
      //   "clusters": [
      //     {
      //       "cluster_id": 1,
      //       "label": "email drafting with internal policy referencing and attachment handling",
      //       "alternative_labels": ["email","writing"],
      //       "summary": "Composed release email, inserted policy excerpt, attached notes and sent message.",
      //       ...
      //     }
      //   ]
      // }

      // ---

      // **Example 2 - UI design session in Figma with quick Slack check (CONSOLIDATED)**

      // {
      //   "clusters": [
      //     {
      //       "cluster_id": 1,
      //       "label": "interface design work on dashboard layout with team collaboration",
      //       "alternative_labels": ["design","Figma editing with communication"],
      //       "summary": "Edited dashboard layout, resized UI components, checked Slack for design feedback and exported assets.",
      //       "apps": ["Figma", "Slack"],
      //       "events_count": 18,
      //       ...
      //     }
      //   ],
      //   "primary_cluster_id": 1,
      //   "notes": "Quick Slack check merged into primary design work cluster"
      // }

      // ---

      // **Example 3 - Deep research across browser and PDF reader with note taking**

      // {
      //   "clusters": [
      //     {
      //       "cluster_id": 1,
      //       "label": "literature review with academic paper reading and structured note taking",
      //       "alternative_labels": ["research","reading"],
      //       "summary": "Reviewed academic paper PDF, highlighted sections and captured structured research notes in Obsidian.",
      //       ...
      //     }
      //   ]
      // }

      // ---

      // **Example 4 - Watching tutorial video and active note taking (two clusters)**

      // {
      //   "clusters": [
      //     {
      //       "cluster_id": 1,
      //       "label": "tutorial video learning session with pauses and resuming for understanding",
      //       "alternative_labels": ["video learning","watching"],
      //       "summary": "Watched Node deployment tutorial, paused video to process and resumed playback for further steps.",
      //       ...
      //     },
      //     {
      //       "cluster_id": 2,
      //       "label": "active note taking of tutorial steps and environment configuration details",
      //       "alternative_labels": ["note-taking","documentation"],
      //       "summary": "Took structured deployment notes in Notion with commands and environment setup reminders.",
      //       ...
      //     }
      //   ]
      // }

      // ---

      // **Example 5 - Noise heavy minute with media playing and frequent alt-tab (CONSOLIDATED)**

      // {
      //   "clusters": [
      //     {
      //       "cluster_id": 1,
      //       "label": "transient application switching and brief browsing with background music",
      //       "alternative_labels": ["mixed activity","task switching"],
      //       "summary": "Frequent app switching, brief news browsing, music playback, and notification checks without clear focus.",
      //       "apps": ["Spotify", "Chrome", "various"],
      //       "events_count": 20,
      //       "probable_task_type": "other",
      //       "productivity": "low",
      //       ...
      //     }
      //   ],
      //   "primary_cluster_id": 1,
      //   "notes": "All activities consolidated into single low-focus cluster"
      // }

      // `;

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
      const primaryCluster = clusters.find((c: any) => c.cluster_id === parsed.primary_cluster_id) || clusters[0];

      if (!primaryCluster) {
        console.error(`❌ No clusters found in AI response for user ${userId}`);
        return false;
      }

      // Calculate total duration from all clusters or estimate from activity count
      const totalDuration = clusters.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0);
      const durationMinutes = totalDuration > 0
        ? Math.round(totalDuration / 60)
        : Math.max(1, Math.round(buffer.activities.length / 3)); // Estimate ~3 activities per minute

      // Create a consolidated title from primary cluster and session summary
      const consolidatedTitle = primaryCluster.label || parsed.session_summary || 'Work session';

      // Create a detailed markdown description combining session summary and cluster info
      let consolidatedDescription = this.formatMarkdownDescription(parsed, clusters, primaryCluster);

      // Collect all apps from all clusters
      const allApps = [...new Set(clusters.flatMap((c: any) => c.apps || []))];

      // Create ONE processed task for the entire batch
      const taskData: any = {
        user_id: userId,
        task_title: consolidatedTitle,
        task_description: consolidatedDescription.trim(),
        start_time: parsed.timestamp_start,
        end_time: parsed.timestamp_end,
        status: 'completed',
        duration_minutes: durationMinutes,
        activity_summaries: allApps, // All apps from all clusters
        created_at: lastActivityTimestamp // Use last activity timestamp from BEFORE AI processing
      };

      // Add metadata field if your database supports it (optional)
      // Uncomment if you have a 'metadata' JSONB column in processed_tasks table
      /*
      taskData.metadata = {
        clusters: clusters.map(c => ({
          cluster_id: c.cluster_id,
          label: c.label,
          summary: c.summary,
          apps: c.apps,
          keywords: c.keywords,
          productivity: c.productivity,
          confidence: c.confidence,
          is_primary: c.cluster_id === parsed.primary_cluster_id
        })),
        primary_cluster_id: parsed.primary_cluster_id,
        session_summary: parsed.session_summary,
        overall_productivity: parsed.overall_productivity,
        activities_count: buffer.activities.length
      };
      */

      const { data, error } = await supabase
        .from('processed_tasks')
        .insert(taskData)
        .select()
        .single();

      if (error) {
        console.error(`❌ Failed to save processed log for user ${userId}:`, error);
        return false;
      }

      console.log(`✅ Processed log saved for user ${userId}: "${consolidatedTitle}" (${durationMinutes} min, ${buffer.activities.length} activities, ${clusters.length} clusters)`);

      // Auto-generate embedding for this processed task (non-blocking)
      if (data?.id) {
        const { EmbeddingAutoGenerator } = await import('./embeddingAutoGenerator');
        EmbeddingAutoGenerator.generateForProcessedTask(data.id, userId);

        // Trigger subtask classification if conditions are met
        const shouldTrigger = await SubtaskService.shouldTriggerClassification(userId);
        if (shouldTrigger) {
          console.log(`🧩 Triggering subtask classification for user ${userId}...`);
          await SubtaskService.classifyIntoSubtasks(userId, data.id);
        }
      }

      // Clear buffer after successful classification
      buffer.activities = [];
      buffer.lastClassified = classificationTimestamp;

      console.log(`🎉 Successfully saved 1 consolidated processed log from ${clusters.length} cluster(s) for user ${userId}`);

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
        ? `Successfully classified ${activitiesCount} activities into 1 processed log`
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

  /**
   * Format description as markdown with structured information
   */
  private static formatMarkdownDescription(parsed: any, clusters: any[], primaryCluster: any): string {
    let markdown = '';

    // Main session summary
    if (parsed.session_summary) {
      markdown += `## Session Summary\n\n${parsed.session_summary}\n\n`;
    }

    // Overall productivity indicator
    if (parsed.overall_productivity) {
      const productivityLevel = parsed.overall_productivity.toLowerCase();
      const productivityEmoji = productivityLevel === 'high' ? '🟢' : 
                                productivityLevel === 'medium' ? '🟡' : 
                                productivityLevel === 'low' ? '🔴' : '⚪';
      
      markdown += `**Overall Productivity:** ${productivityEmoji} ${parsed.overall_productivity.toUpperCase()}\n\n`;
    }

    // Primary activity details
    if (primaryCluster) {
      markdown += `## Primary Activity\n\n`;
      markdown += `**${primaryCluster.label}**\n\n`;
      
      if (primaryCluster.summary) {
        markdown += `${primaryCluster.summary}\n\n`;
      }

      // Apps used
      if (primaryCluster.apps && primaryCluster.apps.length > 0) {
        markdown += `**Applications:** ${primaryCluster.apps.join(', ')}\n\n`;
      }

      // Keywords
      if (primaryCluster.keywords && primaryCluster.keywords.length > 0) {
        markdown += `**Keywords:** ${primaryCluster.keywords.map((k: string) => `\`${k}\``).join(', ')}\n\n`;
      }

      // Productivity level
      if (primaryCluster.productivity) {
        const productivityLevel = primaryCluster.productivity.toLowerCase();
        const productivityEmoji = productivityLevel === 'high' ? '🟢' : 
                                  productivityLevel === 'medium' ? '🟡' : 
                                  productivityLevel === 'low' ? '🔴' : '⚪';
        
        markdown += `**Productivity Level:** ${productivityEmoji} ${primaryCluster.productivity.toUpperCase()}\n\n`;
      }

      // Confidence score
      if (primaryCluster.confidence) {
        const confidencePercent = Math.round(primaryCluster.confidence * 100);
        markdown += `**Confidence:** ${confidencePercent}%\n\n`;
      }

      // Suggested next action
      if (primaryCluster.suggested_next_action) {
        markdown += `**Suggested Next Action:** ${primaryCluster.suggested_next_action}\n\n`;
      }
    }

    // Additional clusters if multiple
    if (clusters.length > 1) {
      markdown += `## Additional Activities\n\n`;
      clusters.forEach((cluster, index) => {
        if (cluster.cluster_id !== parsed.primary_cluster_id) {
          markdown += `### ${cluster.label}\n\n`;
          if (cluster.summary) {
            markdown += `${cluster.summary}\n\n`;
          }
          if (cluster.apps && cluster.apps.length > 0) {
            markdown += `**Apps:** ${cluster.apps.join(', ')}\n\n`;
          }
        }
      });
    }

    // Session metadata
    markdown += `## Session Details\n\n`;
    markdown += `- **Duration:** ${parsed.activities_count || 0} activities\n`;
    markdown += `- **Time Range:** ${parsed.timestamp_start} → ${parsed.timestamp_end}\n`;
    markdown += `- **Clusters Generated:** ${clusters.length}\n`;

    // Notes if any
    if (parsed.notes) {
      markdown += `\n**Notes:** ${parsed.notes}\n`;
    }

    return markdown.trim();
  }
} 