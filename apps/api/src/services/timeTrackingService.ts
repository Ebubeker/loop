import { supabase } from './database';

interface TimeTrackingSession {
  id?: number;
  user_id: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  created_at?: string;
  updated_at?: string;
}

interface SessionStats {
  today_seconds: number;
  week_seconds: number;
}

export class TimeTrackingService {
  /**
   * Create a new time tracking session
   * @param userId - User ID
   * @param startTime - Session start time in ISO format
   * @returns Created session with session_id
   */
  static async createSession(userId: string, startTime: string): Promise<any> {
    try {
      if (!userId || !startTime) {
        return {
          success: false,
          error: 'user_id and start_time are required'
        };
      }

      // Validate start time format
      const startTimeDate = new Date(startTime);
      if (isNaN(startTimeDate.getTime())) {
        return {
          success: false,
          error: 'Invalid start_time format. Use ISO 8601 format.'
        };
      }

      // Check if user has any active (incomplete) sessions
      const { data: activeSessions, error: checkError } = await supabase
        .from('time_tracked')
        .select('id, start_time')
        .eq('user_id', userId)
        .is('end_time', null)
        .limit(5);

      if (checkError) {
        console.error('Error checking active sessions:', checkError);
        return {
          success: false,
          error: 'Failed to check existing sessions'
        };
      }

      if (activeSessions && activeSessions.length > 0) {
        console.warn(`User ${userId} has ${activeSessions.length} active sessions. Creating new session anyway.`);
      }

      // Create new session
      const { data, error } = await supabase
        .from('time_tracked')
        .insert({
          user_id: userId,
          start_time: startTime,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating time tracking session:', error);
        return {
          success: false,
          error: 'Failed to create session'
        };
      }

      console.log(`✅ Created time tracking session ${data.id} for user ${userId}`);

      return {
        success: true,
        session_id: data.id,
        message: 'Session created successfully'
      };

    } catch (error: any) {
      console.error('Create session error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }

  /**
   * Update a time tracking session with end time and calculate duration
   * @param sessionId - Session ID to update
   * @param endTime - Session end time in ISO format
   * @param durationSeconds - Optional duration in seconds (calculated if not provided)
   * @returns Update result
   */
  static async updateSession(sessionId: number, endTime: string, durationSeconds?: number): Promise<any> {
    try {
      if (!sessionId || !endTime) {
        return {
          success: false,
          error: 'sessionId and end_time are required'
        };
      }

      // Validate end time format
      const endTimeDate = new Date(endTime);
      if (isNaN(endTimeDate.getTime())) {
        return {
          success: false,
          error: 'Invalid end_time format. Use ISO 8601 format.'
        };
      }

      // Get existing session to calculate duration if not provided
      const { data: existingSession, error: fetchError } = await supabase
        .from('time_tracked')
        .select('start_time, end_time')
        .eq('id', sessionId)
        .single();

      if (fetchError) {
        console.error('Error fetching session:', fetchError);
        return {
          success: false,
          error: 'Session not found'
        };
      }

      if (existingSession.end_time) {
        return {
          success: false,
          error: 'Session already completed'
        };
      }

      // Calculate duration if not provided
      let calculatedDuration = durationSeconds;
      if (!calculatedDuration) {
        const startTime = new Date(existingSession.start_time);
        calculatedDuration = Math.floor((endTimeDate.getTime() - startTime.getTime()) / 1000);
        
        if (calculatedDuration < 0) {
          return {
            success: false,
            error: 'End time cannot be before start time'
          };
        }
      }

      // Update session
      const { error: updateError } = await supabase
        .from('time_tracked')
        .update({
          end_time: endTime,
          duration_seconds: calculatedDuration,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (updateError) {
        console.error('Error updating session:', updateError);
        return {
          success: false,
          error: 'Failed to update session'
        };
      }

      console.log(`✅ Updated session ${sessionId} with duration ${calculatedDuration} seconds`);

      return {
        success: true,
        message: 'Session updated successfully',
        duration_seconds: calculatedDuration
      };

    } catch (error: any) {
      console.error('Update session error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }

  /**
   * Get daily and weekly time tracking statistics for a user
   * @param userId - User ID
   * @returns Daily and weekly seconds totals
   */
  static async getStats(userId: string): Promise<any> {
    try {
      if (!userId) {
        return {
          success: false,
          error: 'user_id is required'
        };
      }

      // Get current date boundaries
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - todayStart.getDay()); // Start of week (Sunday)

      // Get today's completed sessions
      const { data: todaySessions, error: todayError } = await supabase
        .from('time_tracked')
        .select('duration_seconds')
        .eq('user_id', userId)
        .gte('start_time', todayStart.toISOString())
        .not('duration_seconds', 'is', null);

      if (todayError) {
        console.error('Error fetching today sessions:', todayError);
        return {
          success: false,
          error: 'Failed to fetch today statistics'
        };
      }

      // Get this week's completed sessions
      const { data: weekSessions, error: weekError } = await supabase
        .from('time_tracked')
        .select('duration_seconds')
        .eq('user_id', userId)
        .gte('start_time', weekStart.toISOString())
        .not('duration_seconds', 'is', null);

      if (weekError) {
        console.error('Error fetching week sessions:', weekError);
        return {
          success: false,
          error: 'Failed to fetch weekly statistics'
        };
      }

      // Calculate totals
      const todaySeconds = todaySessions?.reduce((sum, session) => sum + (session.duration_seconds || 0), 0) || 0;
      const weekSeconds = weekSessions?.reduce((sum, session) => sum + (session.duration_seconds || 0), 0) || 0;

      console.log(`📊 Stats for user ${userId}: Today ${todaySeconds}s, Week ${weekSeconds}s`);

      return {
        success: true,
        today_seconds: todaySeconds,
        week_seconds: weekSeconds,
        sessions_today: todaySessions?.length || 0,
        sessions_week: weekSessions?.length || 0
      };

    } catch (error: any) {
      console.error('Get stats error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }

  /**
   * Get daily and weekly time tracking statistics for all users
   * @returns Array of user stats with daily and weekly seconds totals
   */
  static async getAllStats(): Promise<any> {
    try {
      // Get current date boundaries
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - todayStart.getDay()); // Start of week (Sunday)

      // Get all unique users who have tracked time
      const { data: users, error: usersError } = await supabase
        .from('time_tracked')
        .select('user_id')
        .not('user_id', 'is', null);

      if (usersError) {
        console.error('Error fetching users:', usersError);
        return {
          success: false,
          error: 'Failed to fetch users'
        };
      }

      // Get unique user IDs
      const uniqueUserIds = [...new Set(users?.map(u => u.user_id) || [])];

      if (uniqueUserIds.length === 0) {
        return {
          success: true,
          users_stats: [],
          total_users: 0
        };
      }

      // Get stats for each user
      const userStatsPromises = uniqueUserIds.map(async (userId) => {
        // Get today's completed sessions for this user
        const { data: todaySessions, error: todayError } = await supabase
          .from('time_tracked')
          .select('duration_seconds')
          .eq('user_id', userId)
          .gte('start_time', todayStart.toISOString())
          .not('duration_seconds', 'is', null);

        // Get this week's completed sessions for this user
        const { data: weekSessions, error: weekError } = await supabase
          .from('time_tracked')
          .select('duration_seconds')
          .eq('user_id', userId)
          .gte('start_time', weekStart.toISOString())
          .not('duration_seconds', 'is', null);

        if (todayError || weekError) {
          console.error(`Error fetching sessions for user ${userId}:`, todayError || weekError);
          return {
            user_id: userId,
            today_seconds: 0,
            week_seconds: 0,
            sessions_today: 0,
            sessions_week: 0,
            error: 'Failed to fetch user sessions'
          };
        }

        // Calculate totals for this user
        const todaySeconds = todaySessions?.reduce((sum, session) => sum + (session.duration_seconds || 0), 0) || 0;
        const weekSeconds = weekSessions?.reduce((sum, session) => sum + (session.duration_seconds || 0), 0) || 0;

        return {
          user_id: userId,
          today_seconds: todaySeconds,
          week_seconds: weekSeconds,
          sessions_today: todaySessions?.length || 0,
          sessions_week: weekSessions?.length || 0
        };
      });

      // Wait for all user stats to be calculated
      const userStats = await Promise.all(userStatsPromises);

      // Calculate overall totals
      const totalTodaySeconds = userStats.reduce((sum, user) => sum + user.today_seconds, 0);
      const totalWeekSeconds = userStats.reduce((sum, user) => sum + user.week_seconds, 0);
      const totalSessionsToday = userStats.reduce((sum, user) => sum + user.sessions_today, 0);
      const totalSessionsWeek = userStats.reduce((sum, user) => sum + user.sessions_week, 0);

      console.log(`📊 All users stats: ${uniqueUserIds.length} users, Today total: ${totalTodaySeconds}s, Week total: ${totalWeekSeconds}s`);

      return {
        success: true,
        users_stats: userStats,
        total_users: uniqueUserIds.length,
        totals: {
          today_seconds: totalTodaySeconds,
          week_seconds: totalWeekSeconds,
          sessions_today: totalSessionsToday,
          sessions_week: totalSessionsWeek
        }
      };

    } catch (error: any) {
      console.error('Get all stats error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }

  /**
   * Get recent time tracking sessions history for a user
   * @param userId - User ID
   * @param limit - Maximum number of sessions to return (default: 10)
   * @returns Array of recent sessions
   */
  static async getHistory(userId: string, limit: number = 10): Promise<any> {
    try {
      if (!userId) {
        return {
          success: false,
          error: 'user_id is required'
        };
      }

      const { data: sessions, error } = await supabase
        .from('time_tracked')
        .select('id, start_time, end_time, duration_seconds, created_at')
        .eq('user_id', userId)
        .order('start_time', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching session history:', error);
        return {
          success: false,
          error: 'Failed to fetch session history'
        };
      }

      console.log(`📚 Retrieved ${sessions?.length || 0} session history records for user ${userId}`);

      return {
        success: true,
        sessions: sessions || [],
        count: sessions?.length || 0,
        limit
      };

    } catch (error: any) {
      console.error('Get history error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }

  /**
   * Get active (incomplete) sessions for a user
   * @param userId - User ID
   * @returns Array of active sessions
   */
  static async getActiveSessions(userId: string): Promise<any> {
    try {
      const { data: sessions, error } = await supabase
        .from('time_tracked')
        .select('id, start_time, created_at')
        .eq('user_id', userId)
        .is('end_time', null)
        .order('start_time', { ascending: false });

      if (error) {
        console.error('Error fetching active sessions:', error);
        return {
          success: false,
          error: 'Failed to fetch active sessions'
        };
      }

      return {
        success: true,
        active_sessions: sessions || [],
        count: sessions?.length || 0
      };

    } catch (error: any) {
      console.error('Get active sessions error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }
} 