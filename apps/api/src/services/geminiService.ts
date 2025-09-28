import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './database';

export class GeminiService {
  private static genAI: GoogleGenerativeAI | null = null;

  private static initializeGemini() {
    if (!this.genAI) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
    return this.genAI;
  }

  /**
   * Get raw activities for a user from the database
   * @param userId - The user ID to get activities for
   * @param limit - Optional limit on number of activities (default: 100)
   * @param timeRange - Optional time range filter (hour, day, week)
   * @returns JSON response with user activities
   */
  static async getUserActivities(userId: string, limit: number = 100, timeRange?: string): Promise<any> {
    try {
      if (!userId) {
        return {
          success: false,
          error: 'User ID is required',
          activities: []
        };
      }

      let query = supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      // Apply time range filter if specified
      if (timeRange) {
        const now = new Date();
        let startTime: Date;

        switch (timeRange) {
          case 'hour':
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case 'day':
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case 'week':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          default:
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }

        query = query.gte('timestamp', startTime.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching user activities:', error);
        return {
          success: false,
          error: 'Failed to fetch activities from database',
          activities: []
        };
      }

      return {
        success: true,
        user_id: userId,
        activities: data || [],
        count: data?.length || 0,
        limit: limit,
        time_range: timeRange || 'all',
        fetched_at: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('Error in getUserActivities:', error);
      return {
        success: false,
        error: error.message || 'Failed to get user activities',
        activities: []
      };
    }
  }

  /**
   * Generate 1-minute activity summary using Gemini AI (from current time)
   * @param userId - The user ID to analyze activities for
   * @returns JSON response with 1-minute summary
   */
  static async generateOneMinuteSummary(userId: string): Promise<any> {
    try {
      if (!userId) {
        return {
          success: false,
          error: 'User ID is required'
        };
      }

      // Get recent activities (last 1 minute from now)
      const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
      const { data: activities, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', oneMinuteAgo.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        throw new Error('Failed to fetch activities');
      }

      if (!activities || activities.length === 0) {
        return {
          success: false,
          error: 'No activities found in the last 1 minute'
        };
      }

      return await this.generateSummaryFromActivities(activities, userId);

    } catch (error: any) {
      console.error('Error in generateOneMinuteSummary:', error);

      if (error.message.includes('GEMINI_API_KEY')) {
        return {
          success: false,
          error: 'Gemini API key not configured'
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to generate summary'
      };
    }
  }

  /**
   * Generate 1-minute activity summary from last recorded activity
   * @param userId - The user ID to analyze activities for
   * @returns JSON response with 1-minute summary
   */
  static async generateLastOneMinuteSummary(userId: string): Promise<any> {
    try {
      if (!userId) {
        return {
          success: false,
          error: 'User ID is required'
        };
      }

      // Get the most recent activity to find the end time
      const { data: lastActivity, error: lastError } = await supabase
        .from('activity_logs')
        .select('timestamp')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (lastError || !lastActivity) {
        return {
          success: false,
          error: 'No activities found for this user'
        };
      }

      const lastActivityTime = new Date(lastActivity.timestamp);
      const oneMinuteBeforeLast = new Date(lastActivityTime.getTime() - 1 * 60 * 1000);

      // Get activities in the 1-minute window before the last activity
      const { data: activities, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', oneMinuteBeforeLast.toISOString())
        .lte('timestamp', lastActivityTime.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        throw new Error('Failed to fetch activities');
      }

      if (!activities || activities.length === 0) {
        return {
          success: false,
          error: 'No activities found in the 1 minute before last recorded activity',
          last_activity_time: lastActivityTime.toISOString()
        };
      }

      const result = await this.generateSummaryFromActivities(activities, userId);

      // Add metadata about the time window used
      if (result.success) {
        result.time_window = {
          start: oneMinuteBeforeLast.toISOString(),
          end: lastActivityTime.toISOString(),
          last_activity_time: lastActivityTime.toISOString()
        };
      }

      return result;

    } catch (error: any) {
      console.error('Error in generateLastOneMinuteSummary:', error);

      if (error.message.includes('GEMINI_API_KEY')) {
        return {
          success: false,
          error: 'Gemini API key not configured'
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to generate last activity summary'
      };
    }
  }

  /**
   * Generate summary with sample data for testing - calls real AI
   * @returns JSON response with AI-generated summary using sample data
   */
  static async generateSummaryWithSampleData(): Promise<any> {
    try {
      // Sample activities data for testing (1 minute span)
      const sampleActivities = [
        {
          id: "sample-1",
          user_id: "test-user-123",
          timestamp: new Date(Date.now() - 50 * 1000).toISOString(), // 50 seconds ago
          app: "Code.exe",
          title: "MyProject - Visual Studio Code [Administrator]"
        },
        {
          id: "sample-2",
          user_id: "test-user-123",
          timestamp: new Date(Date.now() - 30 * 1000).toISOString(), // 30 seconds ago
          app: "Code.exe",
          title: "MyProject - Visual Studio Code [Administrator]"
        },
        {
          id: "sample-3",
          user_id: "test-user-123",
          timestamp: new Date(Date.now() - 15 * 1000).toISOString(), // 15 seconds ago
          app: "chrome.exe",
          title: "Stack Overflow - Google Chrome"
        },
        {
          id: "sample-4",
          user_id: "test-user-123",
          timestamp: new Date(Date.now() - 5 * 1000).toISOString(), // 5 seconds ago
          app: "Code.exe",
          title: "MyProject - Visual Studio Code [Administrator]"
        }
      ];

      return await this.generateSummaryFromActivities(sampleActivities, "test-user-123");

    } catch (error: any) {
      console.error('Error in generateSummaryWithSampleData:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate sample summary'
      };
    }
  }

  /**
   * Compare if a new activity summary is related to the current task
   * @param currentTask - The current active task
   * @param newSummary - The new activity summary to compare
   * @returns Boolean indicating if they are related
   */
  static async compareTaskRelatedness(currentTask: any, newSummary: any): Promise<boolean> {
    try {
      // Initialize Gemini
      const genAI = this.initializeGemini();
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `You are a task continuity analyzer. Your job is to determine if a new activity is related to an ongoing task.

CURRENT TASK:
Title: ${currentTask.task_title}
Description: ${currentTask.task_description}
Duration: ${currentTask.duration_minutes} minutes

NEW ACTIVITY:
Title: ${newSummary.title}
Description: ${newSummary.description}

ANALYSIS RULES:

Return ONLY "true" or "false" (no other text).

Return "true" if the new activity is:
- Working on the same project/codebase
- Researching related topics for the same task
- Using related tools for the same objective
- A natural continuation or extension of the current work
- Taking a brief break but within the same work context (e.g., checking related documentation)

Return "false" if the new activity is:
- Working on a completely different project
- Personal activities (social media, entertainment, shopping)
- Switching to unrelated work tasks
- Administrative tasks unrelated to current work
- Long breaks or distractions

Examples:
- Current: "Coding React components" → New: "Looking up React documentation" = true
- Current: "Writing documentation" → New: "Testing the documented feature" = true
- Current: "Debugging JavaScript" → New: "Checking email" = false
- Current: "Database design" → New: "Working on UI mockups" = false

IMPORTANT: Respond with only "true" or "false".`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text().trim().toLowerCase();

      // Parse the response - should be just "true" or "false"
      const isRelated = responseText === 'true' || responseText.includes('true');

      console.log(`🤖 Task relatedness check: "${currentTask.task_title}" vs "${newSummary.title}" = ${isRelated}`);

      return isRelated;

    } catch (error: any) {
      console.error('Error comparing task relatedness:', error);
      // Default to true (continue current task) if AI fails
      return true;
    }
  }

  /**
   * Find the best matching task for an activity summary from a list of user tasks
   * @param userTasks - Array of user tasks from the tasks table
   * @param activitySummary - The activity summary to match against
   * @returns Object with success flag and matching task details
   */
  static async findBestTaskMatch(userTasks: any[], activitySummary: any): Promise<any> {
    try {
      // Initialize Gemini
      const genAI = this.initializeGemini();
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const tasksText = userTasks.map((task, index) => `${index + 1}. ID: ${task.id}
   Name: ${task.name}
   Description: ${task.description || 'No description'}
   Category: ${task.category || 'No category'}
   Status: ${task.status || 'active'}`).join('\n\n');

      const prompt = `You are a task matching assistant. Your job is to determine which existing user goal/task best relates to a specific implementation activity.

EXISTING USER TASKS (High-level goals):
${tasksText}

CURRENT ACTIVITY (Implementation work):
Title: ${activitySummary.title}
Description: ${activitySummary.description}

MATCHING PHILOSOPHY:
You should find connections between HIGH-LEVEL GOALS and SPECIFIC IMPLEMENTATION work. Think of tasks as "what I want to accomplish" and activities as "what I'm actually doing to get there".

RELATIONSHIP TYPES TO CONSIDER:

1. **Direct Implementation**: Activity directly implements the task
   - Task: "Build user authentication" → Activity: "Coding login form in React"

2. **Component Work**: Working on specific parts that contribute to the larger goal
   - Task: "Determine task status" → Activity: "Working on todaystasks.jsx in Cursor"
   - Task: "Improve app performance" → Activity: "Optimizing database queries"

3. **Supporting Work**: Activities that enable or support the main task
   - Task: "Launch new feature" → Activity: "Writing unit tests for API endpoints"
   - Task: "Fix user interface bugs" → Activity: "Debugging CSS styles in Chrome"

4. **Research & Planning**: Learning or investigating for the task
   - Task: "Implement payment system" → Activity: "Reading Stripe documentation"
   - Task: "Database migration" → Activity: "Researching PostgreSQL best practices"

5. **Tooling & Setup**: Setting up tools/environment needed for the task
   - Task: "Deploy to production" → Activity: "Configuring Docker containers"

CONTEXTUAL CLUES TO ANALYZE:
- **File names & technologies**: "todaystasks.jsx" relates to task management
- **Actions & verbs**: "debugging", "implementing", "testing", "researching"
- **Project domains**: frontend work, backend APIs, database, deployment, etc.
- **Tool usage**: specific IDEs, browsers, terminals suggest related development work

DECISION PROCESS:
1. Identify the domain/area of the activity (UI, API, database, etc.)
2. Look for tasks that would logically need work in that domain
3. Consider the specificity: specific file work usually supports broader goals
4. If multiple tasks could match, choose the most specific/relevant one
5. Only match if there's a logical connection (confidence > 0.7)

EXAMPLES OF GOOD MATCHES:

✅ Task: "Implement user dashboard" + Activity: "Editing dashboard.jsx component" 
   → HIGH match (direct implementation)

✅ Task: "Fix task management bugs" + Activity: "Debugging todaystasks.jsx in VSCode"
   → HIGH match (component work for specific goal)

✅ Task: "Optimize app performance" + Activity: "Analyzing bundle size in webpack"
   → MEDIUM-HIGH match (supporting work)

✅ Task: "Set up CI/CD pipeline" + Activity: "Configuring GitHub Actions workflow"
   → HIGH match (direct implementation)

❌ Task: "Write documentation" + Activity: "Playing music on Spotify"
   → NO match (unrelated activities)

RESPONSE FORMAT:
Return ONLY a JSON object:
{
  "success": true,
  "taskId": "task-uuid",
  "taskName": "Task Name",
  "confidence": 0.85,
  "reason": "Working on todaystasks.jsx directly supports determining task status functionality"
}

OR if no logical relationship exists:
{
  "success": false,
  "taskId": null,
  "taskName": null,
  "confidence": 0.0,
  "reason": "Activity doesn't relate to any existing user goals"
}

IMPORTANT: Be intelligent about relationships. Implementation work often supports broader goals. Don't require exact keyword matches - understand the logical connections between what someone wants to accomplish and what they're actually working on.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text().trim();

      // Extract JSON from markdown code blocks if present
      const cleanedJson = this.extractJsonFromText(responseText);

      // Try to parse as JSON
      try {
        const matchResult = JSON.parse(cleanedJson);
        
        // Validate the response structure
        if (typeof matchResult.success === 'boolean' && 
            (matchResult.success === false || typeof matchResult.taskId === 'string')) {
          return matchResult;
        } else {
          console.warn('Invalid task match response structure:', matchResult);
          return {
            success: false,
            taskId: null,
            taskName: null,
            confidence: 0.0,
            reason: 'Invalid response format from AI'
          };
        }
      } catch (parseError) {
        console.warn('Failed to parse task match response as JSON:', parseError);
        console.warn('Cleaned JSON string:', cleanedJson);
        return {
          success: false,
          taskId: null,
          taskName: null,
          confidence: 0.0,
          reason: 'Failed to parse AI response'
        };
      }

    } catch (error: any) {
      console.error('Error finding best task match:', error);
      return {
        success: false,
        taskId: null,
        taskName: null,
        confidence: 0.0,
        reason: error.message || 'Failed to process task matching'
      };
    }
  }

  /**
   * Helper method to extract JSON from markdown code blocks or plain text
   * @param text - The text that may contain JSON wrapped in markdown
   * @returns Extracted JSON string
   */
  private static extractJsonFromText(text: string): string {
    // Check if the response is wrapped in markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }

    // If no markdown blocks, try to find JSON object in the text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }

    // Return original text if no patterns match
    return text.trim();
  }

  /**
   * Helper method to generate summary from activities using Gemini AI
   * @param activities - Array of activity objects
   * @param userId - User ID for the response
   * @returns AI-generated summary
   */
  private static async generateSummaryFromActivities(activities: any[], userId: string): Promise<any> {
    try {
      // Initialize Gemini
      const genAI = this.initializeGemini();
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `
      You are a summarization assistant. You will receive a list of user activity objects that contain only these fields: timestamp (ISO or epoch), app (application name), and title (window or tab title string). Your job is to convert all events that occur within a single minute into exactly one JSON object and nothing else.

Strict output rules

Output only valid JSON and nothing else. Do not output explanation, logs, or extra text.

Return exactly one object, with exactly these three properties and these names and types:
{
"time": "HH:MM AM/PM",
"title": "Short title of the activity (8-10 words long)",
"description": "Concise, explanatory summary of what the user was doing during this minute"
}

Do not add any other properties, metadata, or comments.

Do not use the character "—". Use normal hyphen/minus instead if needed.

Time and minute selection

Use the minute represented by the events. Convert the representative timestamp to 12-hour clock with AM/PM and zero-padded minutes. Example: 02:05 PM.

If events span multiple timestamps within that minute, use the minute they share (same hour and minute).

Primary activity selection and wording

Consolidate all provided events for that minute into one coherent summary.

Determine the primary activity by these heuristics in order:

App priority: code editors > IDEs > browser > document editors (Docs/Word) > terminal > email > meeting apps > media/viewers > others.

Frequency: the app that appears most often in the list.

Title signal: presence of high-signal keywords (github, pull request, PR, issue, stackoverflow, google docs, doc, spreadsheet, meeting, zoom, meet, slack, jira, vscode, Visual Studio Code).

If two apps are clearly tied and both are significant, treat the minute as "mixed activity" and present the primary activity first then mention the secondary transition briefly.

Title generation rules

Produce a short title of 8 to 10 words only. Keep it actionable and specific. Do not simply copy the window title.

Use these templates by matching the app/type:

Code editors (vscode, code.exe, IntelliJ, etc): "Coding in Visual Studio Code on <project or filename>" or "Editing <filename> in <project>." Extract project or filename from title when possible.

Browsers: "Browsing <domain> about <topic>" or "Researching <topic> on <site>" if the title reveals the page.

Documents: "Editing <document title> in <app>" or "Working on <document name>."

Terminal: "Running commands in terminal for <project or task>."

Meetings: "In a meeting: <meeting title or app name>."

Media: "Watching <video title> on <site>" or "Listening to audio."

If project or domain cannot be confidently extracted from title, use a short generic phrasing: "in project" or "on site".

Description generation rules

Write 1 to 2 sentences, concise but informative, interpreting the activity in plain English. Do not echo the raw title.

Mention transitions only if they are significant (more than one distinct app and the secondary app appears at least 25 percent as often as the primary).

If you are uncertain about the interpretation, start the description with "Likely" or "Possibly" to indicate lower confidence.

If events are passive (titles contain "YouTube", "video", "playback", or low-information titles with no signal words), prefer "Watching" or "Listening" phrasing.

Parsing heuristics and regex hints (apply these to title)

VS Code pattern: look for " - Visual Studio Code" or " - VS Code". Extract workspace or the second group in "file - workspace - Visual Studio Code".

GitHub pattern: title often contains "· GitHub" or "GitHub -". Extract repo names or "pull request".

Google Docs: " - Google Docs" or "Google Docs" in title means editing a doc.

Browser pages: if the title contains a domain or site name, map to "browsing <site>".

Terminal: titles that look like shell prompts or contain project paths often indicate coding tasks.

Edge cases

Mixed noise: if more than 3 different apps appear in the minute, set the description to "Multitasking between X, Y, and Z" and pick the top two to describe.

Low information titles: if title is empty, "New Tab", or generic, use app heuristics to infer activity: e.g., "New Tab" + browser -> "Browsing".

Very short titles: fill the description but keep the title template-driven to reach 8-10 words.

Examples (input -> required single JSON output)
Input examples are for reference only, not part of output:

events: [{timestamp: "...:14", app: "chrome", title: "Auth-service · Pull request #42 · GitHub"}, {timestamp: "...:45", app: "Terminal", title: "npm test"}
Output (exact JSON):
{
"time": "02:14 PM",
"title": "Reviewing GitHub pull request and running tests",
"description": "Reading a GitHub pull request for the auth-service repository and running tests locally in the terminal; switched briefly to terminal to inspect failing output."
}

events: [{timestamp: "...:05", app: "Code.exe", title: "server.js - myapp - Visual Studio Code"}]
Output:
{
"time": "11:05 AM",
"title": "Editing server.js in myapp project in VS Code",
"description": "Making code changes in server.js inside the myapp project using Visual Studio Code; likely editing logic or fixing a bug."
}

If exact project, domain, or file name cannot be confidently extracted, prefer conservative phrasing and indicate uncertainty with "Likely" or "Possibly" in the description.
      
INPUT:
${JSON.stringify(activities, null, 2)}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const summaryText = response.text();

      // Extract JSON from markdown code blocks if present
      const cleanedJson = this.extractJsonFromText(summaryText);

      // Try to parse as JSON
      try {
        const parsedSummary = JSON.parse(cleanedJson);
        return {
          success: true,
          user_id: userId,
          summary: parsedSummary,
          activities_processed: activities.length,
          generated_at: new Date().toISOString(),
          raw_response: summaryText
        };
      } catch (parseError) {
        console.warn('Failed to parse Gemini response as JSON:', parseError);
        console.warn('Cleaned JSON string:', cleanedJson);
        return {
          success: false,
          error: 'Failed to parse AI response',
          raw_response: summaryText,
          cleaned_json: cleanedJson
        };
      }

    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Generate a pretty description of a task object for logging
   * @param taskObject - The processed task object to summarize
   * @param linkedTask - Optional linked task from tasks table for additional context
   * @returns Plain text summary following the specified format
   */
  static async generateTaskLogSummary(taskObject: any, linkedTask?: any): Promise<string> {
    try {
      // Initialize Gemini
      const genAI = this.initializeGemini();
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // Build context information
      let contextSection = '';
      if (linkedTask) {
        contextSection = `
LINKED USER-DEFINED TASK CONTEXT:
Task Name: ${linkedTask.name}
Task Description: ${linkedTask.description || 'No description provided'}
Task Category: ${linkedTask.category || 'No category'}
Task Status: ${linkedTask.status || 'active'}

This processed activity was automatically linked to the above user-defined task, meaning the work performed contributes to achieving this broader goal.
`;
      }

      const systemPrompt = `You are given a task completion record${linkedTask ? ' that has been linked to a user-defined goal' : ''}. Read the task details and activity summaries to produce a plain-text summary with exactly three sections and these exact headers:

Objective:
Action taken:
Results:

${contextSection}

PROCESSED TASK DATA:
${JSON.stringify(taskObject, null, 2)}

Output rules

Output only plain text. Do not use JSON, markdown, code blocks, or any extra commentary.

Do not use the character "—". Use a normal hyphen if needed.

Keep it concise and actionable.

Content requirements

Objective: ${linkedTask ? 
  'Explain how this work session contributed to the user-defined goal. Reference both the specific implementation work and the broader objective. Please be straight to the point and tell what the user is trying to do (not summarize)' : 
  'Explain what the goal of this task was (straight forward), what were we trying to accomplish, what was the main objective. Keep it short and concise.'
}

Action taken: 5 to 10 concise bullets. Each bullet should be 8 to 20 words. Focus on:

- Task title and main objective${linkedTask ? ' in context of the user-defined goal' : ''}
- Duration and time period (start to end times)
- Key activities performed (from activity_summaries)
- Tools, applications, or platforms used
- Completion status and any interruptions
- Main accomplishments or work done
- Context switches or focus changes
- Any notable patterns in the work session${linkedTask ? '\n- How this work advances the user-defined task goal' : ''}

Results: ${linkedTask ? 
  'Explain results in context of both the immediate work done and progress toward the user-defined goal. (just tell what the reults are not the summary of the work)' : 
  'Explain results of the task. What went well, what could have been done better, what was the outcome of the task. (just tell what the reults are not the summary of the work)'
}

Tone and style

Be direct and Stright forward about the actual work performed.

Focus on what the person accomplished, not technical data structures.

Use action words like "worked on", "completed", "developed", "researched", "debugged".

${linkedTask ? 'Connect the specific implementation work to the broader user goal when relevant.' : ''}

Now generate the log summary of the task record:`;

      const result = await model.generateContent(systemPrompt);
      const response = await result.response;
      const summary = response.text().trim();

      return summary;

    } catch (error: any) {
      console.error('Error generating task log summary:', error);
      // Return a fallback summary if AI fails
      const fallbackObjective = linkedTask ? 
        `Work session contributed to user-defined task "${linkedTask.name}" in ${linkedTask.category || 'general'} category.` :
        `This object represents a processed task record with ${Object.keys(taskObject).length} fields for the employee.`;
      
      return `Objective:
${fallbackObjective}

Action taken:
- Contains task metadata including title, description, and timing information
- Includes start_time, end_time, and duration_minutes for temporal tracking
- Status field indicates task completion state
- Activity_summaries array stores related activity data
- Created_at timestamp marks database insertion time${linkedTask ? `\n- Work was linked to user task: ${linkedTask.name}` : ''}

Results:
Task record contains essential tracking data. ${linkedTask ? 'Successfully linked to user-defined objective.' : 'Validate timestamps and ensure activity_summaries structure consistency.'}`;
    }
  }

  /**
   * Check if Gemini service is available
   * @returns boolean indicating service availability
   */
  static isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }
} 