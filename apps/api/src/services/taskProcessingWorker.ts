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
  private static lastProcessingDuration = 0;
  private static adaptiveInterval = 60 * 1000; // Start with 60 seconds

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

    // Run with adaptive interval based on processing load
    this.scheduleNextProcessing();

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
      clearTimeout(this.intervalId);
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
      started_at: this.isRunning ? 'Running' : 'Not running',
      adaptive_interval_seconds: Math.round(this.adaptiveInterval / 1000),
      last_processing_duration_seconds: Math.round(this.lastProcessingDuration / 1000),
      processing_mode: this.activeUsers.size > 3 ? 'Staggered (batches of 2)' : 'Parallel (all at once)'
    };
  }

  /**
   * Process all active users with staggered processing to reduce load
   */
  private static async processAllActiveUsers(): Promise<void> {
    if (this.activeUsers.size === 0) {
      console.log('📭 No active users to process');
      return;
    }

    console.log(`🔄 Processing ${this.activeUsers.size} active users...`);

    const activeUserIds = Array.from(this.activeUsers.keys());
    
    // If we have many users, process them in smaller batches with delays
    if (activeUserIds.length > 3) {
      console.log(`📊 Large user count (${activeUserIds.length}), using staggered processing...`);
      
      const batchSize = 2; // Process 2 users at a time
      const delayBetweenBatches = 5000; // 5 seconds between batches
      
      for (let i = 0; i < activeUserIds.length; i += batchSize) {
        const batch = activeUserIds.slice(i, i + batchSize);
        
        console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}: users ${batch.join(', ')}`);
        
        const batchPromises = batch.map(async (userId) => {
          try {
            await ActivityService.processUserActivities(userId);
          } catch (error) {
            console.error(`❌ Error processing user ${userId}:`, error);
          }
        });
        
        await Promise.all(batchPromises);
        
        // Add delay between batches (except for the last batch)
        if (i + batchSize < activeUserIds.length) {
          console.log(`⏳ Waiting ${delayBetweenBatches/1000}s before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
    } else {
      // For small numbers of users, process all at once
      const promises = activeUserIds.map(async (userId) => {
        try {
          await ActivityService.processUserActivities(userId);
        } catch (error) {
          console.error(`❌ Error processing user ${userId}:`, error);
        }
      });

      await Promise.all(promises);
    }
    
    console.log(`✅ Completed processing all active users`);
  }

  /**
   * Schedule the next processing cycle with adaptive timing
   */
  private static scheduleNextProcessing(): void {
    if (!this.isRunning) return;

    // Clear existing interval
    if (this.intervalId) {
      clearTimeout(this.intervalId);
    }

    // Calculate adaptive interval based on last processing duration
    const baseInterval = 60 * 1000; // 60 seconds base
    const processingOverhead = Math.max(0, this.lastProcessingDuration - 30 * 1000); // Overhead beyond 30s
    const adaptiveInterval = Math.min(baseInterval + processingOverhead, 120 * 1000); // Cap at 2 minutes

    this.adaptiveInterval = adaptiveInterval;

    this.intervalId = setTimeout(async () => {
      try {
        const startTime = Date.now();
        await this.processAllActiveUsers();
        this.lastProcessingDuration = Date.now() - startTime;
        
        // Schedule next cycle
        this.scheduleNextProcessing();
      } catch (error) {
        console.error('❌ Error in task processing worker:', error);
        // Still schedule next cycle even on error
        this.scheduleNextProcessing();
      }
    }, adaptiveInterval);

    console.log(`⏰ Next processing cycle scheduled in ${Math.round(adaptiveInterval/1000)}s (adaptive timing)`);
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