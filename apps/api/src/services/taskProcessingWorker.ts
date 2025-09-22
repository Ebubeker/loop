import { ActivityService } from './activityService';

interface ActiveUser {
  userId: string;
  lastActivity: string;
  isActive: boolean;
}

export class TaskProcessingWorker {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;
  private static activeUsers: Map<string, ActiveUser> = new Map();

  /**
   * Start the background worker
   */
  static start(): void {
    if (this.isRunning) {
      console.log('📝 Task processing worker is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting task processing worker...');

    // Run every minute (60 seconds)
    this.intervalId = setInterval(async () => {
      try {
        await this.processAllActiveUsers();
      } catch (error) {
        console.error('❌ Error in task processing worker:', error);
      }
    }, 60 * 1000); // 60 seconds

    // Initial run
    setTimeout(() => {
      this.processAllActiveUsers();
    }, 5000); // Wait 5 seconds before first run

    console.log('✅ Task processing worker started - running every minute');
  }

  /**
   * Stop the background worker
   */
  static stop(): void {
    if (!this.isRunning) {
      console.log('📝 Task processing worker is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('⏹️ Task processing worker stopped');
  }

  /**
   * Add a user to be monitored for task processing
   */
  static addUser(userId: string): void {
    this.activeUsers.set(userId, {
      userId,
      lastActivity: new Date().toISOString(),
      isActive: true
    });
    
    console.log(`👤 Added user ${userId} to task processing`);
  }

  /**
   * Remove a user from monitoring
   */
  static removeUser(userId: string): void {
    this.activeUsers.delete(userId);
    console.log(`👤 Removed user ${userId} from task processing`);
  }

  /**
   * Get list of active users being processed
   */
  static getActiveUsers(): string[] {
    return Array.from(this.activeUsers.keys());
  }

  /**
   * Get worker status
   */
  static getStatus(): any {
    return {
      is_running: this.isRunning,
      active_users_count: this.activeUsers.size,
      active_users: Array.from(this.activeUsers.keys()),
      started_at: this.isRunning ? 'Running' : 'Not running'
    };
  }

  /**
   * Process all active users
   */
  private static async processAllActiveUsers(): Promise<void> {
    if (this.activeUsers.size === 0) {
      console.log('📭 No active users to process');
      return;
    }

    console.log(`🔄 Processing ${this.activeUsers.size} active users...`);

    const promises = Array.from(this.activeUsers.keys()).map(async (userId) => {
      try {
        await ActivityService.processUserActivities(userId);
      } catch (error) {
        console.error(`❌ Error processing user ${userId}:`, error);
      }
    });

    await Promise.all(promises);
    console.log(`✅ Completed processing all active users`);
  }

  /**
   * Process a specific user manually
   */
  static async processUser(userId: string): Promise<void> {
    try {
      this.addUser(userId); // Ensure user is in active list
      await ActivityService.processUserActivities(userId);
      console.log(`✅ Manually processed user: ${userId}`);
    } catch (error) {
      console.error(`❌ Error manually processing user ${userId}:`, error);
      throw error;
    }
  }
} 