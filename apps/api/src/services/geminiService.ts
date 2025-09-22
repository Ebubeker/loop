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
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `You are given a list of user activity objects in JSON. Each object has fields such as timestamp, app, and title. Your task is to convert these activities into a structured human-readable summary for exactly ONE minute in JSON format.

Output Rules

Always output valid JSON.

Return a single object (not an array):

{
  "time": "HH:MM AM/PM",
  "title": "Short title of the activity (8-10 words long)",
  "description": "Explanatory summary of what the user was doing during this minute (concise but informative)"
}

Convert timestamp into 12-hour format with AM/PM. Use the time that represents the minute being summarized.

Explanatory Rules

Do not simply echo the title. Interpret the activity into plain English.

Consolidate all activities within this single minute into one coherent summary.

If multiple apps were used in the same minute → describe the primary activity and mention transitions if significant.

Use descriptive language that captures the essence of what the user accomplished:

App-specific guidelines:

Code.exe → "Coding in Visual Studio Code on [project name]" (project extracted from title).
Browser apps → "Browsing [site/page]" or "researching [topic]".
Document apps → "Editing [document title] in [App]" or "working on [document name]".

IMPORTANT: Output only ONE minute summary object, not an array. Summarize all the provided activities into a single minute's work.

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
   * Check if Gemini service is available
   * @returns boolean indicating service availability
   */
  static isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }
} 