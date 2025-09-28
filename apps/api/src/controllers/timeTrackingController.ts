import { Request, Response } from 'express';
import { TimeTrackingService } from '../services/timeTrackingService';

export class TimeTrackingController {
  /**
   * POST /api/time-tracking/session
   * Create new time tracking session
   */
  static async createSession(req: Request, res: Response) {
    try {
      const { user_id, start_time } = req.body;

      if (!user_id || !start_time) {
        return res.status(400).json({
          success: false,
          error: 'user_id and start_time are required'
        });
      }

      console.log(`⏰ Creating time tracking session for user: ${user_id}`);

      const result = await TimeTrackingService.createSession(user_id, start_time);

      if (result.success) {
        res.status(201).json({
          session_id: result.session_id,
          message: result.message
        });
      } else {
        res.status(400).json({
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Create session error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * PUT /api/time-tracking/session/:sessionId
   * Update session with end time
   */
  static async updateSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { end_time, duration_seconds } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          error: 'sessionId parameter is required'
        });
      }

      if (!end_time) {
        return res.status(400).json({
          error: 'end_time is required'
        });
      }

      const sessionIdNumber = parseInt(sessionId, 10);
      if (isNaN(sessionIdNumber)) {
        return res.status(400).json({
          error: 'Invalid sessionId format'
        });
      }

      console.log(`⏰ Updating time tracking session: ${sessionId}`);

      const result = await TimeTrackingService.updateSession(
        sessionIdNumber,
        end_time,
        duration_seconds
      );

      if (result.success) {
        res.json({
          message: result.message
        });
      } else {
        res.status(400).json({
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Update session error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * GET /api/time-tracking/stats/:userId
   * Get daily and weekly summaries
   */
  static async getStats(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          error: 'userId parameter is required'
        });
      }

      console.log(`📊 Getting time tracking stats for user: ${userId}`);

      const result = await TimeTrackingService.getStats(userId);

      if (result.success) {
        res.json({
          today_seconds: result.today_seconds,
          week_seconds: result.week_seconds,
          sessions_today: result.sessions_today,
          sessions_week: result.sessions_week
        });
      } else {
        res.status(400).json({
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Get stats error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * GET /api/time-tracking/stats
   * Get daily and weekly summaries for all users
   */
  static async getAllStats(req: Request, res: Response) {
    try {
      console.log(`📊 Getting time tracking stats for all users`);

      const result = await TimeTrackingService.getAllStats();

      if (result.success) {
        res.json({
          users_stats: result.users_stats,
          total_users: result.total_users,
          totals: result.totals
        });
      } else {
        res.status(400).json({
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Get all stats error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * GET /api/time-tracking/history/:userId?limit=10
   * Get recent sessions history
   */
  static async getHistory(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        return res.status(400).json({
          error: 'userId parameter is required'
        });
      }

      if (limit < 1 || limit > 100) {
        return res.status(400).json({
          error: 'limit must be between 1 and 100'
        });
      }

      console.log(`📚 Getting time tracking history for user: ${userId} (limit: ${limit})`);

      const result = await TimeTrackingService.getHistory(userId, limit);

      if (result.success) {
        res.json({
          sessions: result.sessions,
          count: result.count,
          limit: result.limit
        });
      } else {
        res.status(400).json({
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Get history error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * GET /api/time-tracking/active/:userId
   * Get active (incomplete) sessions for a user
   */
  static async getActiveSessions(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          error: 'userId parameter is required'
        });
      }

      console.log(`⚡ Getting active sessions for user: ${userId}`);

      const result = await TimeTrackingService.getActiveSessions(userId);

      if (result.success) {
        res.json({
          active_sessions: result.active_sessions,
          count: result.count
        });
      } else {
        res.status(400).json({
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Get active sessions error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
} 