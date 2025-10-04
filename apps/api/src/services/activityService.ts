import { supabase } from './database';
import { GeminiService } from './geminiService';

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
  task_id?: string; // Link to tasks table
  no_focus?: boolean; // Flag for activities with no task assignment and >5 min duration
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

    // Try to find a matching task from the tasks table
    const matchingTaskId = await this.findMatchingTask(userId, summary);

    const newTask: ProcessedTask = {
      user_id: userId,
      task_title: summary.title || 'Untitled Task',
      task_description: summary.description || 'No description available',
      start_time: now,
      status: 'active',
      duration_minutes: 1,
      activity_summaries: [summary],
      task_id: matchingTaskId || undefined // Link to existing task if found
    };

    userState.current_task = newTask;
    
    if (matchingTaskId) {
      console.log(`🆕 Started new task for user ${userId}: "${newTask.task_title}" (linked to task ID: ${matchingTaskId})`);
    } else {
      console.log(`🆕 Started new task for user ${userId}: "${newTask.task_title}" (no existing task match found)`);
    }
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
    
    // Ensure end_time is always after the last activity timestamp
    const currentTime = new Date();
    let endTime = currentTime.toISOString();
    
    // Check if there are activity summaries and get the latest timestamp
    if (task.activity_summaries && task.activity_summaries.length > 0) {
      const lastActivityTimestamp = Math.max(
        ...task.activity_summaries.map(activity => new Date(activity.timestamp || activity.event_timestamp || 0).getTime())
      );
      const lastActivityTime = new Date(lastActivityTimestamp);
      
      // If the last activity is newer than current time, set end_time to be 1 second after
      if (lastActivityTime.getTime() >= currentTime.getTime()) {
        endTime = new Date(lastActivityTime.getTime() + 1000).toISOString();
      }
    }
    
    task.end_time = endTime;

    // Check for "no focus" flag - activities with no assigned task and duration > 5 minutes
    // const isNoFocus = !task.task_id && task.duration_minutes > 1;
    const isNoFocus = !task.task_id && task.duration_minutes > 5;

    // Prepare the task object for database insertion
    const taskObject = {
      user_id: task.user_id,
      task_title: task.task_title,
      task_description: task.task_description,
      start_time: task.start_time,
      end_time: task.end_time,
      status: task.status,
      duration_minutes: task.duration_minutes,
      activity_summaries: task.activity_summaries,
      task_id: task.task_id || null, // Include linked task ID if available
      no_focus: isNoFocus, // Flag activities with no task assignment and >5 min duration
      created_at: new Date().toISOString()
    };

    // Fetch linked task information if available for better summary generation
    let linkedTask = null;
    if (task.task_id) {
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', task.task_id)
          .single();
        
        if (!error && data) {
          linkedTask = data;
          console.log(`📋 Retrieved linked task info for summary: "${linkedTask.name}"`);
        } else {
          console.warn(`⚠️ Failed to fetch linked task ${task.task_id}:`, error);
        }
      } catch (error) {
        console.warn(`⚠️ Error fetching linked task ${task.task_id}:`, error);
      }
    }

    // Generate pretty log summary using Gemini with linked task context
    let logPrettyDesc = '';
    try {
      logPrettyDesc = await GeminiService.generateTaskLogSummary(taskObject, linkedTask);
      if (linkedTask) {
        console.log(`🤖 Generated enhanced summary with linked task context for "${linkedTask.name}"`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to generate log summary for task ${task.task_title}:`, error);
      logPrettyDesc = `Task: ${task.task_title} (${task.duration_minutes} min, ${status})${linkedTask ? ` [linked to: ${linkedTask.name}]` : ''}`;
    }

    // Save to database with log summary
    const { data, error } = await supabase
      .from('processed_tasks')
      .insert({
        ...taskObject,
        log_pretty_desc: logPrettyDesc
      })
      .select()
      .single();

      if (error) {
      console.error(`❌ Failed to save task for user ${userId}:`, error);
      throw new Error(`Failed to save processed task: ${error.message}`);
    }

    console.log(`💾 Finalized task for user ${userId}: "${task.task_title}" (${task.duration_minutes} min, ${status})${task.task_id ? ` [linked to task: ${task.task_id}]` : ' [standalone task]'}${isNoFocus ? ' 🚨 [NO FOCUS - >5min unassigned]' : ''}`);
    
    // Auto-generate embedding for this processed task (non-blocking)
    if (data?.id) {
      const { EmbeddingAutoGenerator } = await import('./embeddingAutoGenerator');
      EmbeddingAutoGenerator.generateForProcessedTask(data.id, userId);
    }
    
    // Check for inactive tasks and auto-complete them after creating new processed log
    await this.checkAndCompleteInactiveTasks(userId);
    
    // Clear current task
    userState.current_task = null;
  }

  /**
   * Check if new activity is related to current task using AI
   */
  private static async isActivityRelatedToCurrentTask(userId: string, newSummary: any): Promise<boolean> {
    
    const userState = this.currentTasks.get(userId);
    if (!userState || !userState.current_task) {
      return false;
    }

    try {
      // Import GeminiService to avoid circular dependencies
      const { GeminiService } = await import('./geminiService');
      
      const isRelated = await GeminiService.compareTaskRelatedness(
        userState.current_task, 
        newSummary
      );

      return isRelated;

    } catch (error: any) {
      console.warn(`⚠️ Failed to check task relatedness for user ${userId}:`, error);
      // Default to true to continue current task if AI fails
      return true;
    }
  }

  /**
   * Get all active tasks for a user from the tasks table
   */
  private static async getUserTasks(userId: string): Promise<any[]> {
    try {
      // Get today's date boundaries
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1); // Start of tomorrow

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`❌ Failed to fetch tasks for user ${userId}:`, error);
        return [];
      }

      return data || [];
    } catch (error: any) {
      console.error(`❌ Error fetching tasks for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Find a matching task for the current activity summary using AI
   */
  private static async findMatchingTask(userId: string, activitySummary: any): Promise<string | null> {
    try {
      const userTasks = await this.getUserTasks(userId);

      console.log('userTasks', userTasks);
      
      if (!userTasks || userTasks.length === 0) {
        console.log(`📋 No tasks found for user ${userId} to match against`);
        return null;
      }

      console.log(`🔍 Attempting to match activity "${activitySummary.title}" against ${userTasks.length} user tasks`);

      // Import GeminiService to avoid circular dependencies
      const { GeminiService } = await import('./geminiService');
      
      const matchResult = await GeminiService.findBestTaskMatch(userTasks, activitySummary);
      
      console.log(`🤖 AI matching result:`, {
        success: matchResult.success,
        taskId: matchResult.taskId,
        taskName: matchResult.taskName,
        confidence: matchResult.confidence,
        reason: matchResult.reason
      });
      
      if (matchResult.success && matchResult.taskId && matchResult.confidence > 0.7) {
        console.log(`🎯 Found matching task for user ${userId}: "${matchResult.taskName}" (ID: ${matchResult.taskId}, confidence: ${matchResult.confidence})`);
        console.log(`   Reason: ${matchResult.reason}`);
        return matchResult.taskId;
      }

      console.log(`🔍 No suitable match found for user ${userId} activity: "${activitySummary.title}" (confidence: ${matchResult.confidence || 0})`);
      if (matchResult.reason) {
        console.log(`   Reason: ${matchResult.reason}`);
      }
      return null;

    } catch (error: any) {
      console.warn(`⚠️ Failed to find matching task for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Check for inactive tasks and auto-complete them if not worked on for 2+ hours
   * Called every time a new processed log is created
   */
  private static async checkAndCompleteInactiveTasks(userId: string): Promise<void> {
    try {
      console.log(`🕒 Checking for inactive tasks to auto-complete for user ${userId}`);

      // Get all tasks for the user
      const userTasks = await this.getUserTasks(userId);
      
      if (!userTasks || userTasks.length === 0) {
        console.log(`📋 No tasks found for user ${userId} - skipping inactive task check`);
        return;
      }

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const tasksToComplete: string[] = [];
      const taskStatusMap: { [taskId: string]: { name: string, lastWorked: string | null, hoursSinceWork: number | null } } = {};

      // Check each task's last activity
      for (const task of userTasks) {
        // Skip already completed tasks
        if (task.status === 'completed') {
          continue;
        }

        try {
          // Get the most recent processed log for this task
          const { data: lastProcessedLog, error } = await supabase
            .from('processed_tasks')
            .select('created_at, end_time')
            .eq('user_id', userId)
            .eq('task_id', task.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            console.warn(`⚠️ Error checking last activity for task ${task.id}:`, error);
            continue;
          }

          let lastWorkedTime: Date | null = null;
          let lastWorkedString: string | null = null;

          if (lastProcessedLog) {
            // Use end_time if available, otherwise created_at
            const timeToUse = lastProcessedLog.end_time || lastProcessedLog.created_at;
            lastWorkedTime = new Date(timeToUse);
            lastWorkedString = timeToUse;
          }

          // Calculate hours since last work
          let hoursSinceWork: number | null = null;
          if (lastWorkedTime) {
            hoursSinceWork = (Date.now() - lastWorkedTime.getTime()) / (1000 * 60 * 60);
          }

          // Store status for logging
          taskStatusMap[task.id] = {
            name: task.name,
            lastWorked: lastWorkedString,
            hoursSinceWork: hoursSinceWork
          };

          console.log(hoursSinceWork, twoHoursAgo)

          // Check if task should be auto-completed
          if (lastWorkedTime && lastWorkedTime < twoHoursAgo) {
            tasksToComplete.push(task.id);
            console.log(`⏰ Task "${task.name}" hasn't been worked on for ${hoursSinceWork?.toFixed(1)} hours - marking for completion`);
          } else if (!lastWorkedTime) {
            console.log(`📝 Task "${task.name}" has no processed logs yet - keeping active`);
          } else {
            console.log(`⚡ Task "${task.name}" was worked on ${hoursSinceWork?.toFixed(1)} hours ago - still active`);
          }

        } catch (error) {
          console.warn(`⚠️ Error processing task ${task.id} for auto-completion:`, error);
        }
      }

      // Auto-complete the inactive tasks
      if (tasksToComplete.length > 0) {
        console.log(`🎯 Auto-completing ${tasksToComplete.length} inactive tasks`);

        for (const taskId of tasksToComplete) {
          try {
            const { error } = await supabase
              .from('tasks')
              .update({
                status: 'completed',
                updated_at: new Date().toISOString()
              })
              .eq('id', taskId)
              .eq('user_id', userId); // Extra safety check

            if (error) {
              console.error(`❌ Failed to auto-complete task ${taskId}:`, error);
            } else {
              const taskInfo = taskStatusMap[taskId];
              console.log(`✅ Auto-completed task "${taskInfo.name}" (inactive for ${taskInfo.hoursSinceWork?.toFixed(1)} hours)`);
            }
          } catch (error) {
            console.error(`❌ Error auto-completing task ${taskId}:`, error);
          }
        }
      } else {
        console.log(`✨ No tasks need auto-completion for user ${userId}`);
      }

      // Log summary
      const activeTasksCount = Object.keys(taskStatusMap).length - tasksToComplete.length;
      console.log(`📊 Task activity summary for user ${userId}: ${activeTasksCount} active, ${tasksToComplete.length} auto-completed`);

    } catch (error: any) {
      console.error(`❌ Error in checkAndCompleteInactiveTasks for user ${userId}:`, error);
      // Don't throw - this is a background process that shouldn't break the main flow
    }
  }

  /**
   * Get processed tasks for a user with optional date range filtering
   * @param userId - User ID
   * @param limit - Maximum number of tasks to return
   * @param fromDate - Optional start date (ISO string). Defaults to today's start
   * @param toDate - Optional end date (ISO string). If not provided, filters to current time
   */
  static async getProcessedTasks(
    userId: string, 
    limit: number = 50,
    fromDate?: string,
    toDate?: string
  ): Promise<any> {
    try {
      let query = supabase
        .from('processed_tasks')
        .select(`
          *,
          linked_task:task_id (
            id,
            name,
            description,
            category,
            status
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
  
      // Apply date range filtering
      if (fromDate) {
        query = query.gte('created_at', fromDate);
        
        // If toDate is provided, filter up to that date, otherwise filter to now
        if (toDate) {
          query = query.lte('created_at', toDate);
        }
      } else {
        // Default to today if no date range provided
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        query = query.gte('created_at', today.toISOString()).lt('created_at', tomorrow.toISOString());
      }

      const { data, error } = await query;
  
      if (error) {
        throw new Error(`Failed to fetch processed tasks: ${error.message}`);
      }

      // Transform the data to include linked task info more clearly
      const tasksWithLinkedInfo = (data || []).map(task => ({
        ...task,
        has_linked_task: !!task.task_id,
        linked_task_name: task.linked_task?.name || null,
        linked_task_category: task.linked_task?.category || null,
        linked_task_status: task.linked_task?.status || null
      }));
  
      return {
        success: true,
        tasks: tasksWithLinkedInfo,
        count: tasksWithLinkedInfo.length,
        linked_count: tasksWithLinkedInfo.filter(t => t.has_linked_task).length,
        standalone_count: tasksWithLinkedInfo.filter(t => !t.has_linked_task).length
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
   * Get no-focus tasks for a user (tasks with no assignment and >5 min duration)
   */
  static async getNoFocusTasks(userId: string, limit: number = 50, dateFilter?: 'today' | 'week' | 'month'): Promise<any> {
    try {
      let query = supabase
        .from('processed_tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('no_focus', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Apply date filter if specified
      if (dateFilter) {
        const now = new Date();
        let startTime: Date;

        switch (dateFilter) {
          case 'today':
            startTime = new Date(now);
            startTime.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startTime = new Date(now);
            startTime.setHours(0, 0, 0, 0);
        }

        query = query.gte('created_at', startTime.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch no-focus tasks: ${error.message}`);
      }

      // Calculate total time spent on no-focus activities
      const totalNoFocusMinutes = (data || []).reduce((sum, task) => sum + (task.duration_minutes || 0), 0);

      return {
        success: true,
        no_focus_tasks: data || [],
        count: data?.length || 0,
        total_no_focus_minutes: totalNoFocusMinutes,
        total_no_focus_hours: Math.round(totalNoFocusMinutes / 60 * 100) / 100,
        filter_applied: dateFilter || 'none'
      };

    } catch (error: any) {
      console.error('Get no-focus tasks error:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch no-focus tasks',
        no_focus_tasks: []
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

  /**
   * Manually check and complete inactive tasks (public method for API access)
   * @param userId - User ID to check tasks for
   * @returns Summary of completed tasks
   */
  static async manuallyCheckInactiveTasks(userId: string): Promise<any> {
    try {
      console.log(`🔄 Manual inactive task check requested for user ${userId}`);
      await this.checkAndCompleteInactiveTasks(userId);
      
      return {
        success: true,
        message: `Inactive task check completed for user ${userId}`,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error(`❌ Error in manual inactive task check for user ${userId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to check inactive tasks',
        timestamp: new Date().toISOString()
      };
    }
  }
} 