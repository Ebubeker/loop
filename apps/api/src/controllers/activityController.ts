import { Request, Response } from 'express';
import { ActivityService } from '../services/activityService';
import { TaskProcessingWorker } from '../services/taskProcessingWorker';
import { supabase } from '../services/database';

export class ActivityController {
  // NEW: Add activity manually
  static async addActivity(req: Request, res: Response) {
    try {
      const { userId, app, title, timestamp, duration, afkStatus, idleTime } = req.body;
      
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
        idle_time: idleTime || 0
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

      console.log(`✅ Activity added for user ${userId}: ${app} - ${title}`);
      
      res.json({
        success: true,
        message: 'Activity added successfully',
        activity: data
      });
      
    } catch (error: any) {
      console.error('Add activity error:', error);
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
} 