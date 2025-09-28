import { Request, Response } from 'express';
import { ActivityService } from '../services/activityService';
import { TaskProcessingWorker } from '../services/taskProcessingWorker';
import { supabase } from '../services/database';

export class ActivityController {
  // NEW: Add activity manually
  static async addActivity(req: Request, res: Response) {
    console.log('addActivity!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    try {
      const {
        userId,
        app,
        title,
        timestamp,
        duration,
        afkStatus,
        idleTime,
        windowDetails,
        processInfo
      } = req.body;

      console.log('req.body', req.body);

      if (!userId || !app || !title) {
        return res.status(400).json({
          success: false,
          error: 'userId, app, and title are required fields'
        });
      }

      const activityData = {
        user_id: userId,
        timestamp: timestamp || new Date().toISOString(),
        app: app,
        title: title,
        event_timestamp: timestamp || new Date().toISOString(),
        event_duration: duration?.toString() || '0',
        bucket_id: null,
        bucket_created: null,
        bucket_last_updated: null,
        afk_status: afkStatus || 'not-afk',
        idle_time: idleTime || 0,

        // Enhanced window information
        window_bounds: windowDetails?.bounds ? JSON.stringify(windowDetails.bounds) : null,
        is_visible: windowDetails?.isVisible ?? true,
        is_minimized: windowDetails?.isMinimized ?? false,
        is_maximized: windowDetails?.isMaximized ?? false,
        process_id: windowDetails?.processId || null,

        // Enhanced process information
        top_processes: processInfo?.topProcesses ? JSON.stringify(processInfo.topProcesses) : null,
        total_processes: processInfo?.totalProcesses || 0,
        system_load: processInfo?.systemLoad || 0,
        process_categories: processInfo?.categories ? JSON.stringify(processInfo.categories) : null
      };

      const { data, error } = await supabase
        .from('activity_logs')
        .insert(activityData)
        .select()
        .single();

      if (error) {
        console.error('Error adding activity:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to add activity to database'
        });
      }

      console.log(`✅ Enhanced activity added for user ${userId}: ${app} - ${title}`, {
        processes: processInfo?.totalProcesses || 0,
        systemLoad: processInfo?.systemLoad || 0,
        windowState: windowDetails?.isMaximized ? 'maximized' :
          windowDetails?.isMinimized ? 'minimized' : 'normal'
      });

      res.json({
        success: true,
        message: 'Enhanced activity added successfully',
        activity: data
      });

    } catch (error: any) {
      console.error('Add enhanced activity error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  static async getConsolidatedActivities(req: Request, res: Response) {
    try {
      const consolidatedData = await ActivityService.getConsolidatedActivities();
      res.json(consolidatedData);
    } catch (error: any) {
      console.error('Get consolidated activities error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getRawActivities(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const timeRange = req.query.timeRange as string;

      const activities = await ActivityService.getActivities(limit, timeRange);
      res.json({
        activities,
        count: activities.length,
        limit,
        timeRange: timeRange || 'all'
      });
    } catch (error: any) {
      console.error('Get raw activities error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Task processing endpoints
  static async processUserTasks(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`🔄 Processing tasks for user: ${userId}`);

      await ActivityService.processUserActivities(userId);

      res.json({
        success: true,
        message: `Processing completed for user ${userId}`,
        userId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Process user tasks error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  static async getCurrentTaskStatus(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      const status = ActivityService.getCurrentTaskStatus(userId);
      res.json({
        success: true,
        userId,
        status
      });

    } catch (error: any) {
      console.error('Get current task status error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  static async addProcessedTask(req: Request, res: Response) {
    try {
      const { userId, taskId, taskName, taskDescription, taskStatus, taskTimestamp, linkedTaskId } = req.body;

      const { error } = await supabase
        .from('processed_tasks')
        .insert({
          // user_id: task.user_id,
          // task_title: task.task_title,
          // task_description: task.task_description,
          // start_time: task.start_time,
          // end_time: task.end_time,
          // status: task.status,
          // duration_minutes: task.duration_minutes,
          // activity_summaries: task.activity_summaries,
          user_id: userId,
          task_title: taskName,
          task_description: taskDescription,
          start_time: taskTimestamp,
          end_time: taskTimestamp,
          status: taskStatus,
          duration_minutes: 0,
          activity_summaries: [],
          task_id: linkedTaskId || null, // Link to existing task if provided
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error(`❌ Failed to save task for user ${userId}:`, error);
        throw new Error(`Failed to save processed task: ${error.message}`);
      }

      const logMessage = linkedTaskId 
        ? `Processed task added successfully (linked to task: ${linkedTaskId})`
        : 'Processed task added successfully (standalone)';

      console.log(`✅ ${logMessage} for user ${userId}: "${taskName}"`);

      res.json({
        success: true,
        message: logMessage,
      });
    } catch (error: any) {
      console.error('Add processed task error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // NEW: Get processed tasks
  static async getProcessedTasks(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`📋 Getting processed tasks for user: ${userId} (limit: ${limit})`);

      const tasks = await ActivityService.getProcessedTasks(userId, limit);

      res.json({
        success: true,
        userId,
        tasks,
        count: tasks.length,
        limit
      });

    } catch (error: any) {
      console.error('Get processed tasks error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // NEW: Get no-focus tasks (activities with no assigned task and >5 min duration)
  static async getNoFocusTasks(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const dateFilter = req.query.dateFilter as 'today' | 'week' | 'month';

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`🚨 Getting no-focus tasks for user: ${userId} (limit: ${limit}, filter: ${dateFilter || 'none'})`);

      const result = await ActivityService.getNoFocusTasks(userId, limit, dateFilter);

      if (result.success) {
        res.json({
          success: true,
          userId,
          no_focus_tasks: result.no_focus_tasks,
          count: result.count,
          total_no_focus_minutes: result.total_no_focus_minutes,
          total_no_focus_hours: result.total_no_focus_hours,
          filter_applied: result.filter_applied,
          limit
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Get no-focus tasks error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Task processing worker endpoints
  static async startTaskWorker(req: Request, res: Response) {
    try {
      console.log('🚀 Starting task processing worker...');

      TaskProcessingWorker.start();
      const status = TaskProcessingWorker.getStatus();

      res.json({
        success: true,
        message: 'Task processing worker started',
        status: status,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Start task worker error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  static async stopTaskWorker(req: Request, res: Response) {
    try {
      console.log('🛑 Stopping task processing worker...');

      TaskProcessingWorker.stop();
      const status = TaskProcessingWorker.getStatus();

      res.json({
        success: true,
        message: 'Task processing worker stopped',
        status: status,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Stop task worker error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  static async getTaskWorkerStatus(req: Request, res: Response) {
    try {
      const status = TaskProcessingWorker.getStatus();

      res.json({
        success: true,
        status: status,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Get task worker status error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  static async addUserToWorker(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`👤 Adding user ${userId} to task processing worker`);

      TaskProcessingWorker.addUser(userId);

      res.json({
        success: true,
        message: `User ${userId} added to task processing worker`,
        userId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Add user to worker error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Task auto-completion endpoint
  static async checkInactiveTasks(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`🕒 Manual inactive task check for user: ${userId}`);

      const result = await ActivityService.manuallyCheckInactiveTasks(userId);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          userId,
          timestamp: result.timestamp
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          userId,
          timestamp: result.timestamp
        });
      }

    } catch (error: any) {
      console.error('Check inactive tasks error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
} 