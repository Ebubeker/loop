import { supabase } from './database';

interface ProcessedTask {
  id?: string;
  user_id: string;
  task_title: string;
  task_description: string;
  start_time: string;
  end_time?: string;
  status: 'active' | 'completed' | 'interrupted';
  duration_minutes: number;
  activity_summaries: any[];
  created_at?: string;
  updated_at?: string;
}

interface CurrentTaskState {
  user_id: string;
  current_task: ProcessedTask | null;
  last_processed_time: string;
  is_processing: boolean;
}

export class ActivityService {
  // In-memory state for current tasks (in production, this could be Redis or database)
  private static currentTasks: Map<string, CurrentTaskState> = new Map();

  static consolidateActivities(activities: any[]) {
    if (!activities || activities.length === 0) return [];

    // Sort activities by timestamp in ASCENDING order (oldest first)
    const sortedActivities = activities.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB; // Ascending order
    });

    const refactoredActivities: {
      log_name: string;
      title_description: string;
      start_time: string;
      end_time: string;
    }[] = [];

    let currentActivity: {
      log_name: string;
      title_description: string;
      start_time: string;
      end_time: string;
    } | null = null;

    sortedActivities.forEach((activity, index) => {
      if (index === sortedActivities.length - 1) {
        return;
      }
      const nextActivity = sortedActivities[index + 1];

      if (currentActivity && currentActivity.log_name === activity.app && currentActivity.title_description === activity.title) {
        currentActivity.end_time = nextActivity.event_timestamp;
      } else {
        if (currentActivity) {
          refactoredActivities.push(currentActivity);
        }
        currentActivity = {
          log_name: activity.app,
          title_description: activity.title,
          start_time: activity.event_timestamp,
          end_time: nextActivity.event_timestamp
        };
      }
    });

    return refactoredActivities;
  }

  static async getConsolidatedActivities() {
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('Error fetching activities:', error);
        throw new Error('Failed to fetch activities');
      }

      const consolidated = this.consolidateActivities(data);

      // Debug: Calculate and compare total times
      const rawTotalTime = this.calculateRawActivityTime(data);
      const consolidatedTotalTime = this.calculateConsolidatedTime(consolidated);

      console.log('📊 Time Analysis Debug:', {
        raw_activities_count: data?.length || 0,
        consolidated_activities_count: consolidated.length,
        raw_total_seconds: rawTotalTime,
        raw_total_minutes: Math.round(rawTotalTime / 60),
        consolidated_total_seconds: consolidatedTotalTime,
        consolidated_total_minutes: Math.round(consolidatedTotalTime / 60),
        difference_seconds: consolidatedTotalTime - rawTotalTime,
        difference_minutes: Math.round((consolidatedTotalTime - rawTotalTime) / 60)
      });

      console.log('⏱️ Overall Activity Time:', {
        total_time_seconds: consolidatedTotalTime,
        total_time_minutes: Math.round(consolidatedTotalTime / 60),
        total_time_hours: Math.round(consolidatedTotalTime / 3600 * 100) / 100
      });

      return {
        consolidated,
        summary: {
          raw_total_seconds: rawTotalTime,
          consolidated_total_seconds: consolidatedTotalTime,
          raw_activities_count: data?.length || 0,
          consolidated_activities_count: consolidated.length,
          time_difference_seconds: consolidatedTotalTime - rawTotalTime
        }
      };

    } catch (error: any) {
      console.error('Get consolidated activities error:', error);
      throw error;
    }
  }

  static async getActivities(limit: number = 100, timeRange?: string) {
    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
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
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to day
        }

        query = query.gte('timestamp', startTime.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching activities:', error);
        throw new Error('Failed to fetch activities');
      }

      return data || [];

    } catch (error: any) {
      console.error('Get activities error:', error);
      throw error;
    }
  }

  // Calculate total time from raw activity logs (time between consecutive activities)
  static calculateRawActivityTime(activities: any[]): number {
    if (!activities || activities.length < 2) return 0;

    const sortedActivities = activities.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let totalSeconds = 0;
    for (let i = 0; i < sortedActivities.length - 1; i++) {
      const current = new Date(sortedActivities[i].timestamp);
      const next = new Date(sortedActivities[i + 1].timestamp);
      const diffSeconds = (next.getTime() - current.getTime()) / 1000;
      
      // Only count reasonable time differences (less than 1 hour)
      if (diffSeconds > 0 && diffSeconds < 3600) {
        totalSeconds += diffSeconds;
      }
    }
    
    return Math.round(totalSeconds);
  }

  // Calculate total time from consolidated activities (sum of start/end time differences)
  static calculateConsolidatedTime(consolidatedActivities: any[]): number {
    if (!consolidatedActivities || consolidatedActivities.length === 0) return 0;

    return consolidatedActivities.reduce((total, activity) => {
      if (activity.start_time && activity.end_time) {
        const start = new Date(activity.start_time);
        const end = new Date(activity.end_time);
        const diffSeconds = (end.getTime() - start.getTime()) / 1000;
        return total + Math.max(0, diffSeconds); // Ensure no negative times
      }
      return total;
    }, 0);
  }

  /**
   * Initialize task processing for a user
   */
  static initializeUserTaskProcessing(userId: string): void {
    if (!this.currentTasks.has(userId)) {
      this.currentTasks.set(userId, {
        user_id: userId,
        current_task: null,
        last_processed_time: new Date().toISOString(),
        is_processing: false
      });
      console.log(`📝 Initialized task processing for user: ${userId}`);
    }
  }

  /**
   * Main processing function - should be called every minute
   */
  static async processUserActivities(userId: string): Promise<void> {
    try {
      this.initializeUserTaskProcessing(userId);
      
      const userState = this.currentTasks.get(userId)!;
      
      if (userState.is_processing) {
        console.log(`⏭️ Already processing activities for user ${userId}, skipping...`);
        return;
      }

      userState.is_processing = true;
      console.log(`🔄 Processing activities for user: ${userId}`);

      // Check if user has been inactive for more than 5 minutes
      const lastActivityTime = await this.getLastActivityTime(userId);
      if (!lastActivityTime) {
        console.log(`📭 No activities found for user ${userId}`);
        userState.is_processing = false;
        return;
      }

      const timeSinceLastActivity = Date.now() - new Date(lastActivityTime).getTime();
      const fiveMinutesInMs = 5 * 60 * 1000;

      if (timeSinceLastActivity > fiveMinutesInMs) {
        // User has been inactive - finalize current task if any
        if (userState.current_task) {
          await this.finalizeCurrentTask(userId, 'completed');
          console.log(`💤 User ${userId} inactive for ${Math.round(timeSinceLastActivity / 1000 / 60)} minutes - task finalized`);
        }
        userState.is_processing = false;
        return;
      }

      // Get activities from the last processed time
      const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
      const activities = await this.getActivitiesInTimeRange(
        userId, 
        userState.last_processed_time, 
        new Date().toISOString()
      );

      if (!activities || activities.length === 0) {
        console.log(`📭 No new activities for user ${userId} in the last minute`);
        userState.is_processing = false;
        return;
      }

      // Generate summary for this minute
      const summaryResult = await this.generateActivitySummary(activities, userId);
      
      if (!summaryResult.success) {
        console.log(`❌ Failed to generate summary for user ${userId}:`, summaryResult.error);
        userState.is_processing = false;
        return;
      }

      const summary = summaryResult.summary;

      // Process the summary based on current task state
      if (!userState.current_task) {
        // First task - start new task
        await this.startNewTask(userId, summary, activities);
      } else {
        // Check if this activity is related to current task
        const isRelated = await this.isActivityRelatedToCurrentTask(userId, summary);
        
        if (isRelated) {
          // Continue current task
          await this.continueCurrentTask(userId, summary);
        } else {
          // Context switch - finalize current and start new
          await this.finalizeCurrentTask(userId, 'completed');
          await this.startNewTask(userId, summary, activities);
        }
      }

      // Update last processed time
      userState.last_processed_time = new Date().toISOString();
      userState.is_processing = false;

      console.log(`✅ Completed processing for user ${userId}`);

    } catch (error: any) {
      console.error(`❌ Error processing activities for user ${userId}:`, error);
      const userState = this.currentTasks.get(userId);
      if (userState) {
        userState.is_processing = false;
      }
    }
  }

  /**
   * Get activities in a specific time range for a user
   */
  private static async getActivitiesInTimeRange(userId: string, startTime: string, endTime: string): Promise<any[]> {
      const { data, error } = await supabase
      .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
      .gte('timestamp', startTime)
      .lte('timestamp', endTime)
      .order('timestamp', { ascending: true });

      if (error) {
      throw new Error(`Failed to fetch activities: ${error.message}`);
      }

      return data || [];
  }

  /**
   * Get the timestamp of the last activity for a user
   */
  private static async getLastActivityTime(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data.timestamp;
  }

  /**
   * Generate activity summary using AI
   */
  private static async generateActivitySummary(activities: any[], userId: string): Promise<any> {
    try {
      // Import GeminiService here to avoid circular dependencies
      const { GeminiService } = await import('./geminiService');
      
      // Use the existing generateSummaryFromActivities method
      return await GeminiService.generateLastOneMinuteSummary(userId);
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to generate activity summary'
      };
    }
  }

  /**
   * Start a new task with the given summary
   */
  private static async startNewTask(userId: string, summary: any, activities: any[]): Promise<void> {
    const userState = this.currentTasks.get(userId)!;
    const now = new Date().toISOString();

    const newTask: ProcessedTask = {
      user_id: userId,
      task_title: summary.title || 'Untitled Task',
      task_description: summary.description || 'No description available',
      start_time: now,
      status: 'active',
      duration_minutes: 1,
      activity_summaries: [summary]
    };

    userState.current_task = newTask;
    
    console.log(`🆕 Started new task for user ${userId}: "${newTask.task_title}"`);
  }

  /**
   * Continue the current task with new summary
   */
  private static async continueCurrentTask(userId: string, summary: any): Promise<void> {
    const userState = this.currentTasks.get(userId)!;
    
    if (userState.current_task) {
      userState.current_task.duration_minutes += 1;
      userState.current_task.activity_summaries.push(summary);
      
      console.log(`⏳ Continued task for user ${userId}: "${userState.current_task.task_title}" (${userState.current_task.duration_minutes} min)`);
    }
  }

  /**
   * Finalize current task and save to database
   */
  private static async finalizeCurrentTask(userId: string, status: 'completed' | 'interrupted'): Promise<void> {
    const userState = this.currentTasks.get(userId)!;
    
    if (!userState.current_task) {
      return;
    }

    const task = userState.current_task;
    task.status = status;
    task.end_time = new Date().toISOString();

    // Save to database
    const { error } = await supabase
      .from('processed_tasks')
      .insert({
        user_id: task.user_id,
        task_title: task.task_title,
        task_description: task.task_description,
        start_time: task.start_time,
        end_time: task.end_time,
        status: task.status,
        duration_minutes: task.duration_minutes,
        activity_summaries: task.activity_summaries,
        created_at: new Date().toISOString()
      });

      if (error) {
      console.error(`❌ Failed to save task for user ${userId}:`, error);
      throw new Error(`Failed to save processed task: ${error.message}`);
    }

    console.log(`💾 Finalized task for user ${userId}: "${task.task_title}" (${task.duration_minutes} min, ${status})`);
    
    // Clear current task
    userState.current_task = null;
  }

  /**
   * Check if new activity is related to current task using AI
   */
  private static async isActivityRelatedToCurrentTask(userId: string, newSummary: any): Promise<boolean> {
    try {
      const userState = this.currentTasks.get(userId)!;
      
      if (!userState.current_task) {
        return false;
      }

      // Import GeminiService to check task relation
      const { GeminiService } = await import('./geminiService');
      
      return await GeminiService.compareTaskRelatedness(
        userState.current_task,
        newSummary
      );
      
    } catch (error: any) {
      console.error(`❌ Error checking task relatedness for user ${userId}:`, error);
      // Default to continuing current task if AI fails
      return true;
    }
  }

  /**
   * Get processed tasks for a user
   */
  static async getProcessedTasks(userId: string, limit: number = 50): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('processed_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch processed tasks: ${error.message}`);
      }

      return {
        success: true,
        tasks: data || [],
        count: data?.length || 0
      };

    } catch (error: any) {
      console.error('Get processed tasks error:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch processed tasks',
        tasks: []
      };
    }
  }

  /**
   * Get current task status for a user
   */
  static getCurrentTaskStatus(userId: string): any {
    this.initializeUserTaskProcessing(userId);
    const userState = this.currentTasks.get(userId)!;
    
    return {
      user_id: userId,
      has_current_task: !!userState.current_task,
      current_task: userState.current_task,
      last_processed_time: userState.last_processed_time,
      is_processing: userState.is_processing
    };
  }

  /**
   * Finalize any active tasks when user stops working
   */
  static async finalizeActiveTasksOnStop(userId: string): Promise<void> {
    try {
      const userState = this.currentTasks.get(userId);
      
      if (userState?.current_task) {
        // Finalize any current task as completed when user stops working
        await this.finalizeCurrentTask(userId, 'completed');
        console.log(`🛑 Finalized current task for user ${userId} on work stop`);
      }
      
      // Clear the user's state
      this.currentTasks.delete(userId);
      
    } catch (error: any) {
      console.error(`❌ Error finalizing tasks on stop for user ${userId}:`, error);
    }
  }
} 