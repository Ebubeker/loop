import { supabase } from './database';

interface IdleSession {
  id?: number;
  user_id: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  max_continuous_idle_seconds: number;
  processed_task_id?: string; // Link to processed_tasks table
  created_at?: string;
  updated_at?: string;
}

interface UserIdleState {
  userId: string;
  isIdle: boolean;
  idleStartTime?: string;
  continuousIdleSeconds: number;
  maxContinuousIdleSeconds: number;
  lastActivityTime?: string;
}

export class IdleTrackingService {
  private static readonly MAX_IDLE_MINUTES = 7;
  private static readonly MAX_IDLE_SECONDS = IdleTrackingService.MAX_IDLE_MINUTES * 60;
  private static userStates: Map<string, UserIdleState> = new Map();

  /**
   * Update idle state for a user based on activity data
   */
  static updateIdleState(userId: string, activity: {
    timestamp: string;
    afkStatus: string;
    idleTime: number;
  }): {
    shouldEndTimer: boolean;
    continuousIdleSeconds: number;
    maxContinuousIdleSeconds: number;
  } {
    const currentTime = new Date(activity.timestamp);
    const isCurrentlyIdle = activity.afkStatus === 'afk' || activity.idleTime > 0;

    // Get or create user state
    let userState = this.userStates.get(userId);
    if (!userState) {
      userState = {
        userId,
        isIdle: false,
        continuousIdleSeconds: 0,
        maxContinuousIdleSeconds: 0,
        lastActivityTime: activity.timestamp
      };
      this.userStates.set(userId, userState);
    }

    // Update last activity time
    userState.lastActivityTime = activity.timestamp;

    if (isCurrentlyIdle) {
      // User is idle
      if (!userState.isIdle) {
        // Just became idle
        userState.isIdle = true;
        userState.idleStartTime = activity.timestamp;
        userState.continuousIdleSeconds = activity.idleTime || 0;
      } else {
        // Already idle, accumulate time
        if (userState.idleStartTime) {
          const idleStart = new Date(userState.idleStartTime);
          const currentIdleSeconds = Math.floor((currentTime.getTime() - idleStart.getTime()) / 1000);
          userState.continuousIdleSeconds = Math.max(userState.continuousIdleSeconds, currentIdleSeconds);
        } else {
          userState.continuousIdleSeconds += activity.idleTime || 0;
        }
      }
    } else {
      // User is active
      if (userState.isIdle) {
        // Just became active, reset idle tracking
        userState.isIdle = false;
        userState.idleStartTime = undefined;
        userState.continuousIdleSeconds = 0;
      }
    }

    // Update max continuous idle time
    userState.maxContinuousIdleSeconds = Math.max(
      userState.maxContinuousIdleSeconds,
      userState.continuousIdleSeconds
    );

    // Check if we should end the timer
    const shouldEndTimer = userState.continuousIdleSeconds >= this.MAX_IDLE_SECONDS;

    if (shouldEndTimer) {
      console.log(`⏰ User ${userId} has been idle for ${Math.floor(userState.continuousIdleSeconds / 60)} minutes. Timer should be ended.`);
    }

    return {
      shouldEndTimer,
      continuousIdleSeconds: userState.continuousIdleSeconds,
      maxContinuousIdleSeconds: userState.maxContinuousIdleSeconds
    };
  }

  /**
   * Save idle session data to database
   */
  static async saveIdleSession(
    userId: string,
    processedTaskId?: string
  ): Promise<{ success: boolean; message?: string }> {
    const userState = this.userStates.get(userId);
    
    if (!userState || userState.maxContinuousIdleSeconds === 0) {
      return {
        success: true,
        message: 'No idle time to save'
      };
    }

    try {
      const idleSessionData: Partial<IdleSession> = {
        user_id: userId,
        start_time: userState.idleStartTime || userState.lastActivityTime || new Date().toISOString(),
        end_time: userState.isIdle ? undefined : new Date().toISOString(),
        duration_seconds: userState.maxContinuousIdleSeconds,
        max_continuous_idle_seconds: userState.maxContinuousIdleSeconds,
        processed_task_id: processedTaskId
      };

      const { data, error } = await supabase
        .from('idle_sessions')
        .insert(idleSessionData)
        .select()
        .single();

      if (error) {
        console.error(`❌ Failed to save idle session for user ${userId}:`, error);
        return {
          success: false,
          message: 'Failed to save idle session'
        };
      }

      console.log(`✅ Idle session saved for user ${userId}: ${Math.floor(userState.maxContinuousIdleSeconds / 60)} minutes of idle time`);

      // Reset user state after saving
      this.resetUserState(userId);

      return {
        success: true,
        message: `Saved ${Math.floor(userState.maxContinuousIdleSeconds / 60)} minutes of idle time`
      };
    } catch (error) {
      console.error('❌ Error saving idle session:', error);
      return {
        success: false,
        message: 'Error saving idle session'
      };
    }
  }

  /**
   * Reset user idle state (called after processing)
   */
  static resetUserState(userId: string): void {
    const userState = this.userStates.get(userId);
    if (userState) {
      userState.continuousIdleSeconds = 0;
      userState.maxContinuousIdleSeconds = 0;
      userState.isIdle = false;
      userState.idleStartTime = undefined;
    }
  }

  /**
   * Get current idle state for a user
   */
  static getIdleState(userId: string): {
    isIdle: boolean;
    continuousIdleSeconds: number;
    maxContinuousIdleSeconds: number;
    shouldEndTimer: boolean;
  } {
    const userState = this.userStates.get(userId);
    
    if (!userState) {
      return {
        isIdle: false,
        continuousIdleSeconds: 0,
        maxContinuousIdleSeconds: 0,
        shouldEndTimer: false
      };
    }

    return {
      isIdle: userState.isIdle,
      continuousIdleSeconds: userState.continuousIdleSeconds,
      maxContinuousIdleSeconds: userState.maxContinuousIdleSeconds,
      shouldEndTimer: userState.continuousIdleSeconds >= this.MAX_IDLE_SECONDS
    };
  }

  /**
   * Get all user idle states (for debugging)
   */
  static getAllIdleStates(): Map<string, UserIdleState> {
    return this.userStates;
  }

  /**
   * Clear idle state for a user
   */
  static clearUserState(userId: string): boolean {
    return this.userStates.delete(userId);
  }
}
