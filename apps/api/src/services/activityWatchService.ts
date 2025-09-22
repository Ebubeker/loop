import axios from 'axios';
import { spawn, exec } from 'child_process';
import { join } from 'path';
import os from 'os';
import { supabase } from './database';

interface MonitoringState {
  userId: string;
  isMonitoring: boolean;
  intervalId: NodeJS.Timeout | null;
  lastLoggedEvent: any;
}

export class ActivityWatchService {
  private static awServer: any = null;
  private static awWatcher: any = null;
  private static monitoringSessions: Map<string, MonitoringState> = new Map();

  static async getCurrentActivity() {
    try {
      // Check if ActivityWatch server is responding
      try {
        await axios.get('http://localhost:5600/api/0/info', { timeout: 1000 });
      } catch (infoError) {
        return { error: 'ActivityWatch server not responding. Please ensure it is running.' };
      }

      const windowResponse = await axios.get('http://localhost:5600/api/0/buckets');
      const bucketsData = windowResponse.data;

      const buckets = Array.isArray(bucketsData) ? bucketsData : Object.values(bucketsData);

      const now = new Date().toISOString();
      const startTime = new Date(Date.now() - 60000).toISOString();

      const windowBucket = buckets.find((bucket: any) => bucket.type === 'currentwindow');
      let windowEvent = null;
      if (windowBucket) {
        try {
          const eventsResponse = await axios.get(
            `http://localhost:5600/api/0/buckets/${windowBucket.id}/events?start=${startTime}&end=${now}&limit=1`
          );
          windowEvent = eventsResponse.data[0];
        } catch (e) {
          console.log('No window events found');
        }
      }

      const afkBucket = buckets.find((bucket: any) => bucket.type === 'afkstatus');
      let afkStatus = 'unknown';
      let idleTime = 0;

      if (afkBucket) {
        try {
          const afkResponse = await axios.get(
            `http://localhost:5600/api/0/buckets/${afkBucket.id}/events?start=${startTime}&end=${now}&limit=1`
          );

          if (afkResponse.data[0]) {
            afkStatus = afkResponse.data[0].data?.status || 'unknown';
            if (afkStatus === 'afk') {
              const lastActive = new Date(afkResponse.data[0].timestamp);
              idleTime = Math.floor((Date.now() - lastActive.getTime()) / 1000);
            }
          }
        } catch (e) {
          console.log('No AFK events found');
        }
      }

      const appData = windowEvent?.data || {};

      console.log(' Raw window event data:', JSON.stringify({
        timestamp: new Date().toISOString(),
        app: appData.app || 'Unknown',
        title: appData.title || 'Unknown',
        availableData: {
          ...Object.fromEntries(
            Object.entries(appData).filter(([key, value]) => value !== null && value !== undefined)
          ),
          eventTimestamp: windowEvent?.timestamp,
          eventDuration: windowEvent?.duration,
          bucketId: windowBucket?.id,
          bucketCreated: windowBucket?.created,
          bucketLastUpdated: windowBucket?.last_updated
        },
        afkStatus,
        idleTime,
        rawData: {
          windowEvent,
          bucketInfo: windowBucket,
          allBuckets: buckets.map(b => ({ id: b.id, type: b.type, client: b.client }))
        }
      }));

      return {
        timestamp: new Date().toISOString(),
        app: appData.app || 'Unknown',
        title: appData.title || 'Unknown',
        availableData: {
          ...Object.fromEntries(
            Object.entries(appData).filter(([key, value]) => value !== null && value !== undefined)
          ),
          eventTimestamp: windowEvent?.timestamp,
          eventDuration: windowEvent?.duration,
          bucketId: windowBucket?.id,
          bucketCreated: windowBucket?.created,
          bucketLastUpdated: windowBucket?.last_updated
        },
        afkStatus,
        idleTime,
        lastActivity: windowEvent?.timestamp || null
      };

    } catch (error: any) {
      console.error('Error getting current activity:', error);
      return { error: error.message };
    }
  }

  /**
   * Start continuous activity monitoring for a user
   */
  static startUserMonitoring(userId: string): { success: boolean; message: string } {
    if (this.monitoringSessions.has(userId)) {
      const session = this.monitoringSessions.get(userId)!;
      if (session.isMonitoring) {
        return { success: true, message: 'Monitoring already active for this user' };
      }
    }

    console.log(`🎯 Starting activity monitoring for user: ${userId}`);

    // Immediately create "User started working" processed log
    this.createWorkStartedLog(userId);

    const intervalId = setInterval(async () => {
      await this.logActivityForUser(userId);
    }, 3000); // Every 3 seconds

    this.monitoringSessions.set(userId, {
      userId,
      isMonitoring: true,
      intervalId,
      lastLoggedEvent: null
    });

    return { success: true, message: 'Activity monitoring started successfully' };
  }

  /**
   * Stop activity monitoring for a user
   */
  static stopUserMonitoring(userId: string): { success: boolean; message: string } {
    const session = this.monitoringSessions.get(userId);
    
    if (!session || !session.isMonitoring) {
      return { success: false, message: 'No active monitoring session for this user' };
    }

    if (session.intervalId) {
      clearInterval(session.intervalId);
    }

    session.isMonitoring = false;
    session.intervalId = null;

    console.log(`⏹️ Stopped activity monitoring for user: ${userId}`);

    // Finalize any active work session
    this.finalizeWorkSession(userId);
    
    return { success: true, message: 'Activity monitoring stopped successfully' };
  }

  /**
   * Finalize active work session when monitoring stops
   */
  private static async finalizeWorkSession(userId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      // Find the most recent active "User started working" task
      const { data: activeTasks, error: findError } = await supabase
        .from('processed_tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('task_title', 'User started working')
        .order('created_at', { ascending: false })
        .limit(1);

      if (findError) {
        console.error(`❌ Error finding active work session for user ${userId}:`, findError);
        return;
      }

      if (activeTasks && activeTasks.length > 0) {
        const activeTask = activeTasks[0];
        const startTime = new Date(activeTask.start_time);
        const endTime = new Date(now);
        const durationMinutes = Math.ceil((endTime.getTime() - startTime.getTime()) / (1000 * 60));

        // Update the task to completed status with end time and duration
        const { error: updateError } = await supabase
          .from('processed_tasks')
          .update({
            status: 'completed',
            end_time: now,
            duration_minutes: durationMinutes,
            task_description: `Work session completed - total duration: ${durationMinutes} minutes`,
            updated_at: now
          })
          .eq('id', activeTask.id);

        if (updateError) {
          console.error(`❌ Error finalizing work session for user ${userId}:`, updateError);
          return;
        }

        console.log(`🏁 Finalized work session for user ${userId}: ${durationMinutes} minutes`);
      }

      // Also finalize any current task in ActivityService
      const { ActivityService } = await import('./activityService');
      await ActivityService.finalizeActiveTasksOnStop(userId);
      
    } catch (error) {
      console.error(`❌ Error finalizing work session for user ${userId}:`, error);
    }
  }

  /**
   * Get monitoring status for a user
   */
  static getUserMonitoringStatus(userId: string): any {
    const session = this.monitoringSessions.get(userId);
    
    return {
      userId,
      isMonitoring: session?.isMonitoring || false,
      hasSession: !!session,
      lastLoggedEvent: session?.lastLoggedEvent || null
    };
  }

  /**
   * Log current activity for a specific user
   */
  private static async logActivityForUser(userId: string): Promise<void> {
    try {
      // Get current activity from ActivityWatch
      const activity = await this.getCurrentActivity();
      
      if (activity.error) {
        console.log(`⚠️ ActivityWatch error for user ${userId}: ${activity.error}`);
        return;
      }

      // Skip if no significant activity data
      if (!activity.availableData?.eventTimestamp) {
        console.log(`📭 No new activity data for user ${userId}`);
        return;
      }

      const session = this.monitoringSessions.get(userId);
      if (!session) return;

      // Check if this is the same event we already logged
      if (session.lastLoggedEvent && 
          session.lastLoggedEvent.event_timestamp === activity.availableData.eventTimestamp &&
          session.lastLoggedEvent.app === activity.app &&
          session.lastLoggedEvent.title === activity.title) {
        return; // Skip duplicate
      }

      // Prepare activity data for database
      const activityData = {
        user_id: userId,
        timestamp: new Date().toISOString(),
        app: activity.app,
        title: activity.title,
        event_timestamp: activity.availableData.eventTimestamp,
        event_duration: activity.availableData.eventDuration?.toString() || '0',
        bucket_id: activity.availableData.bucketId || null,
        bucket_created: activity.availableData.bucketCreated || null,
        bucket_last_updated: activity.availableData.bucketLastUpdated || null,
        afk_status: activity.afkStatus === 'afk' ? 'afk' : 'not-afk',
        idle_time: activity.idleTime || 0
      };

      // Log to database
      const { data, error } = await supabase
        .from('activity_logs')
        .insert(activityData)
        .select()
        .single();

      if (error) {
        console.error(`❌ Error logging activity for user ${userId}:`, error);
        return;
      }

      // Update last logged event
      session.lastLoggedEvent = {
        ...activityData,
        id: data.id
      };

      console.log(`✅ Logged activity for user ${userId}: ${activity.app} - ${activity.title.substring(0, 50)}...`);

    } catch (error) {
      console.error(`❌ Error in logActivityForUser for ${userId}:`, error);
    }
  }

  /**
   * Create initial "User started working" processed log entry
   */
  private static async createWorkStartedLog(userId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      // Create a processed task entry indicating work has started
      const { error } = await supabase
        .from('processed_tasks')
        .insert({
          user_id: userId,
          task_title: 'User started working',
          task_description: 'Work session began - activity monitoring started',
          start_time: now,
          status: 'active',
          duration_minutes: 0,
          activity_summaries: [{
            time: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }),
            title: 'Work Session Started',
            description: 'User began working - activity tracking initiated'
          }],
          created_at: now
        });

      if (error) {
        console.error(`❌ Failed to create work started log for user ${userId}:`, error);
        return;
      }

      console.log(`🚀 Created "User started working" log for user: ${userId}`);
      
      // Also initialize the user's task processing state
      const { ActivityService } = await import('./activityService');
      ActivityService.initializeUserTaskProcessing(userId);
      
    } catch (error) {
      console.error(`❌ Error creating work started log for user ${userId}:`, error);
    }
  }

  /**
   * Get all active monitoring sessions
   */
  static getActiveMonitoringSessions(): string[] {
    const activeSessions = Array.from(this.monitoringSessions.entries())
      .filter(([_, session]) => session.isMonitoring)
      .map(([userId, _]) => userId);
    
    return activeSessions;
  }

  static async getDetailedActivity(timeRange: number = 3600) {
    try {
      // Check if ActivityWatch server is responding
      try {
        await axios.get('http://localhost:5600/api/0/info', { timeout: 1000 });
      } catch (infoError) {
        return { error: 'ActivityWatch server not responding. Please ensure it is running.' };
      }

      const windowResponse = await axios.get('http://localhost:5600/api/0/buckets');
      const bucketsData = windowResponse.data;

      const buckets = Array.isArray(bucketsData) ? bucketsData : Object.values(bucketsData);

      const now = new Date().toISOString();
      const startTime = new Date(Date.now() - timeRange * 1000).toISOString();

      const windowBucket = buckets.find((bucket: any) => bucket.type === 'currentwindow');
      let events = [];

      if (windowBucket) {
        try {
          const eventsResponse = await axios.get(
            `http://localhost:5600/api/0/buckets/${windowBucket.id}/events?start=${startTime}&end=${now}`
          );
          events = eventsResponse.data || [];
        } catch (e) {
          console.log('No window events found');
        }
      }

      // Process events to get detailed activity data
      const processedEvents = events.map((event: any) => ({
        timestamp: event.timestamp,
        duration: event.duration,
        app: event.data?.app || 'Unknown',
        title: event.data?.title || 'Unknown',
        data: event.data
      }));

      return {
        events: processedEvents,
        totalEvents: events.length,
        timeRange: timeRange,
        bucket: windowBucket
      };

    } catch (error: any) {
      console.error('Error getting detailed activity:', error);
      return { error: error.message };
    }
  }

  // Enhanced Bucket Type Detection
  static async getAllBucketTypes() {
    try {
      const response = await axios.get('http://localhost:5600/api/0/buckets');
      const buckets = Array.isArray(response.data) ? response.data : Object.values(response.data);
      
      return {
        buckets: buckets.map((bucket: any) => ({
          id: bucket.id,
          type: bucket.type,
          client: bucket.client,
          hostname: bucket.hostname,
          created: bucket.created,
          last_updated: bucket.last_updated
        })),
        count: buckets.length
      };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Enhanced Web Activity Detection
  static async getWebActivity(timeRange: number = 3600) {
    try {
      const bucketsResponse = await axios.get('http://localhost:5600/api/0/buckets');
      const buckets = Array.isArray(bucketsResponse.data) ? bucketsResponse.data : Object.values(bucketsResponse.data);
      
      const windowBucket = buckets.find((bucket: any) => bucket.type === 'currentwindow');
      
      if (!windowBucket) {
        return { error: 'No window bucket found' };
      }

      const now = new Date().toISOString();
      const startTime = new Date(Date.now() - timeRange * 1000).toISOString();

      const eventsResponse = await axios.get(
        `http://localhost:5600/api/0/buckets/${windowBucket.id}/events?start=${startTime}&end=${now}`
      );
      
      const events = eventsResponse.data || [];
      const webEvents = events.filter((event: any) => {
        const app = event.data?.app?.toLowerCase();
        return app && (
          app.includes('chrome') || 
          app.includes('firefox') || 
          app.includes('safari') || 
          app.includes('edge') ||
          app.includes('browser')
        );
      });

      const processedWebEvents = webEvents.map((event: any) => ({
        timestamp: event.timestamp,
        duration: event.duration,
        browser: event.data?.app || 'Unknown Browser',
        title: event.data?.title || 'Unknown Page',
        url: this.extractUrlFromTitle(event.data?.title || '')
      }));

      return {
        webEvents: processedWebEvents,
        totalWebEvents: webEvents.length,
        totalEvents: events.length,
        webActivityPercentage: events.length > 0 ? (webEvents.length / events.length) * 100 : 0
      };

    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Helper method to extract URL from browser title
  private static extractUrlFromTitle(title: string): string {
    // Common patterns for extracting URLs from browser titles
    const patterns = [
      /https?:\/\/[^\s]+/i,
      /www\.[^\s]+/i,
      /[a-zA-Z0-9-]+\.(com|org|net|edu|gov|io|co|uk|de|fr|jp|cn)[^\s]*/i
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return 'URL not detected';
  }

  static async getAppsCategories() {
    try {
      const detailedActivity = await this.getDetailedActivity(3600); // Last hour
      
      if (detailedActivity.error) {
        return detailedActivity;
      }

      const events = detailedActivity.events || [];
      const appStats: { [key: string]: { count: number; totalDuration: number; category: string } } = {};

      events.forEach((event: any) => {
        const app = event.app || 'Unknown';
        
        if (!appStats[app]) {
          appStats[app] = {
            count: 0,
            totalDuration: 0,
            category: this.categorizeApp(app)
          };
        }
        
        appStats[app].count++;
        appStats[app].totalDuration += event.duration || 0;
      });

      const categorizedApps = Object.entries(appStats).map(([app, stats]) => ({
        app,
        category: stats.category,
        eventCount: stats.count,
        totalDuration: Math.round(stats.totalDuration),
        averageDuration: Math.round(stats.totalDuration / stats.count)
      }));

      // Group by category
      const categories: { [key: string]: any[] } = {};
      categorizedApps.forEach(app => {
        if (!categories[app.category]) {
          categories[app.category] = [];
        }
        categories[app.category].push(app);
      });

      return {
        categories,
        totalApps: categorizedApps.length,
        totalEvents: events.length
      };

    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Enhanced App Categorization
  private static categorizeApp(appName: string): string {
    const app = appName.toLowerCase();
    
    if (app.includes('chrome') || app.includes('firefox') || app.includes('safari') || app.includes('edge')) {
      return 'Web Browser';
    }
    if (app.includes('code') || app.includes('visual') || app.includes('atom') || app.includes('sublime')) {
      return 'Development';
    }
    if (app.includes('word') || app.includes('excel') || app.includes('powerpoint') || app.includes('office')) {
      return 'Office Suite';
    }
    if (app.includes('slack') || app.includes('teams') || app.includes('discord') || app.includes('zoom')) {
      return 'Communication';
    }
    if (app.includes('photoshop') || app.includes('illustrator') || app.includes('gimp') || app.includes('figma')) {
      return 'Design & Graphics';
    }
    if (app.includes('spotify') || app.includes('music') || app.includes('vlc') || app.includes('media')) {
      return 'Media & Entertainment';
    }
    if (app.includes('terminal') || app.includes('cmd') || app.includes('powershell') || app.includes('bash')) {
      return 'System & Terminal';
    }
    
    return 'Other';
  }

  static async getRecentEvents() {
    try {
      const detailedActivity = await this.getDetailedActivity(300); // Last 5 minutes
      
      if (detailedActivity.error) {
        return detailedActivity;
      }

      const events = detailedActivity.events || [];
      const recentEvents = events
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10)
        .map((event: any) => ({
          timestamp: event.timestamp,
          app: event.app,
          title: event.title,
          duration: Math.round(event.duration || 0),
          timeAgo: this.getTimeAgo(new Date(event.timestamp))
        }));

      return {
        recentEvents,
        count: recentEvents.length
      };

    } catch (error: any) {
      return { error: error.message };
    }
  }

  private static getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}h ${diffMin % 60}m ago`;
  }

  static startActivityWatch() {
    const platform = os.platform();

    let binFolder: string;
    if (platform === 'win32') binFolder = 'win';
    else if (platform === 'darwin') binFolder = 'mac';
    else if (platform === 'linux') binFolder = 'linux';
    else throw new Error('Unsupported OS');

    const awServerPath = join(
      process.cwd(),
      'bin',
      binFolder,
      platform === 'win32' ? 'aw-server.exe' : 'aw-server'
    );
    const awWatcherPath = join(
      process.cwd(),
      'bin',
      binFolder,
      platform === 'win32' ? 'aw-watcher-window.exe' : 'aw-watcher-window'
    );

    try {
      this.awServer = spawn(awServerPath, [], { detached: true, stdio: 'ignore' });
      this.awServer.unref();

      this.awWatcher = spawn(awWatcherPath, [], { detached: true, stdio: 'ignore' });
      this.awWatcher.unref();

      console.log('✅ ActivityWatch launched successfully.');

      // Check buckets after 5 seconds
      setTimeout(async () => {
        try {
          const res = await axios.get('http://localhost:5600/api/0/buckets');
          // console.log('Buckets:', res.data);
        } catch (err: any) {
          console.error('Error fetching buckets:', err.message);
        }
      }, 5000);
    } catch (err: any) {
      console.error('Failed to launch ActivityWatch:', err.message);
      throw err;
    }
  }

  static stopActivityWatch() {
    try {
      if (this.awServer) this.awServer.kill();
      if (this.awWatcher) this.awWatcher.kill();
      console.log('✅ ActivityWatch stopped.');
    } catch (err: any) {
      console.error('Error stopping ActivityWatch:', err.message);
    }
  }
} 