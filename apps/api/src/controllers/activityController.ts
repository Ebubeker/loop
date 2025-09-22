import { Request, Response } from 'express';
import { ActivityWatchService } from '../services/activityWatchService';
import { ActivityService } from '../services/activityService';
import { TaskProcessingWorker } from '../services/taskProcessingWorker';

export class ActivityController {
  static async getCurrentActivity(req: Request, res: Response) {
    try {
      const activity = await ActivityWatchService.getCurrentActivity();
      res.json(activity);
    } catch (error: any) {
      console.error('Get current activity error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getDetailedActivity(req: Request, res: Response) {
    try {
      const timeRange = parseInt(req.query.timeRange as string) || 3600;
      const activity = await ActivityWatchService.getDetailedActivity(timeRange);
      res.json(activity);
    } catch (error: any) {
      console.error('Get detailed activity error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // NEW: Start activity monitoring for a user
  static async startActivityMonitoring(req: Request, res: Response) {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }

      console.log(`🚀 Starting activity monitoring for user: ${userId}`);
      
      const result = ActivityWatchService.startUserMonitoring(userId);
      
      res.json({
        success: result.success,
        message: result.message,
        userId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Start activity monitoring error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: error.message 
      });
    }
  }

  // NEW: Stop activity monitoring for a user
  static async stopActivityMonitoring(req: Request, res: Response) {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }

      console.log(`⏹️ Stopping activity monitoring for user: ${userId}`);
      
      const result = ActivityWatchService.stopUserMonitoring(userId);
      
      res.json({
        success: result.success,
        message: result.message,
        userId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Stop activity monitoring error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: error.message 
      });
    }
  }

  // NEW: Get activity monitoring status for a user
  static async getActivityMonitoringStatus(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }
      
      const status = ActivityWatchService.getUserMonitoringStatus(userId);
      const activeSessions = ActivityWatchService.getActiveMonitoringSessions();
      
      res.json({
        success: true,
        ...status,
        activeSessions,
        totalActiveSessions: activeSessions.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Get activity monitoring status error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: error.message 
      });
    }
  }

  // NEW: Get all active monitoring sessions
  static async getAllActiveMonitoringSessions(req: Request, res: Response) {
    try {
      const activeSessions = ActivityWatchService.getActiveMonitoringSessions();
      
      res.json({
        success: true,
        activeSessions,
        count: activeSessions.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Get active monitoring sessions error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: error.message 
      });
    }
  }

  static async getAllBucketTypes(req: Request, res: Response) {
    try {
      const bucketTypes = await ActivityWatchService.getAllBucketTypes();
      res.json(bucketTypes);
    } catch (error: any) {
      console.error('Get bucket types error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getWebActivity(req: Request, res: Response) {
    try {
      const timeRange = parseInt(req.query.timeRange as string) || 3600; // 1 hour default
      const webActivity = await ActivityWatchService.getWebActivity(timeRange);
      res.json(webActivity);
    } catch (error: any) {
      console.error('Get web activity error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getConsolidatedActivities(req: Request, res: Response) {
    try {
      const consolidated = await ActivityService.getConsolidatedActivities();
      res.json(consolidated);
    } catch (error: any) {
      console.error('Get consolidated activities error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getAppsCategories(req: Request, res: Response) {
    try {
      const categories = await ActivityWatchService.getAppsCategories();
      res.json(categories);
    } catch (error: any) {
      console.error('Get apps categories error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getRecentEvents(req: Request, res: Response) {
    try {
      const events = await ActivityWatchService.getRecentEvents();
      res.json(events);
    } catch (error: any) {
      console.error('Get recent events error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getRawActivities(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      
      const activities = await ActivityService.getActivities(limit);
      
      res.json({
        success: true,
        activities: activities,
        count: activities.length
      });
    } catch (error: any) {
      console.error('Get raw activities error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Task Processing Methods
  static async processUserTasks(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }

      await ActivityService.processUserActivities(userId);
      
      res.json({
        success: true,
        message: 'User activities processed successfully',
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

      const status = await ActivityService.getCurrentTaskStatus(userId);
      
      res.json(status);
      
    } catch (error: any) {
      console.error('Get current task status error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: error.message 
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

      const tasks = await ActivityService.getProcessedTasks(userId, limit);
      
      res.json({
        success: true,
        tasks,
        count: tasks.length,
        userId,
        timestamp: new Date().toISOString()
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

  // Task Processing Worker Methods
  static async startTaskWorker(req: Request, res: Response) {
    try {
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
        ...status,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Get task worker status error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: error.message 
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