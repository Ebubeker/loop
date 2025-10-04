import { Request, Response } from 'express';
import { ActivityService } from '../services/activityService';
import { TaskProcessingWorker } from '../services/taskProcessingWorker';
import { ActivityBufferService } from '../services/activityBufferService';
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

      const activity = {
        userId,
        app,
        title,
        timestamp: timestamp || new Date().toISOString(),
        duration: duration?.toString() || '0',
        afkStatus: afkStatus || 'not-afk',
        idleTime: idleTime || 0,
        windowDetails,
        processInfo
      };

      // Add activity to buffer (will auto-classify when buffer reaches 20)
      const result = await ActivityBufferService.addActivity(activity);

      console.log(`✅ Activity buffered for user ${userId}: ${app} - ${title}`, {
        bufferSize: result.bufferSize,
        classified: result.classified,
        processes: processInfo?.totalProcesses || 0,
        systemLoad: processInfo?.systemLoad || 0,
        windowState: windowDetails?.isMaximized ? 'maximized' :
          windowDetails?.isMinimized ? 'minimized' : 'normal'
      });

      res.json({
        success: true,
        message: result.message,
        buffered: result.buffered,
        classified: result.classified,
        bufferSize: result.bufferSize,
        maxBufferSize: 20
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

      const { data, error } = await supabase
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
          created_at: taskTimestamp
        })
        .select()
        .single();

      if (error) {
        console.error(`❌ Failed to save task for user ${userId}:`, error);
        throw new Error(`Failed to save processed task: ${error.message}`);
      }

      const logMessage = linkedTaskId 
        ? `Processed task added successfully (linked to task: ${linkedTaskId})`
        : 'Processed task added successfully (standalone)';

      console.log(`✅ ${logMessage} for user ${userId}: "${taskName}"`);

      // Auto-generate embedding for this processed task (non-blocking)
      if (data?.id) {
        const { EmbeddingAutoGenerator } = await import('../services/embeddingAutoGenerator');
        EmbeddingAutoGenerator.generateForProcessedTask(data.id, userId);
      }

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
      const fromDate = req.query.fromDate as string;
      const toDate = req.query.toDate as string;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`📋 Getting processed tasks for user: ${userId} (limit: ${limit}, fromDate: ${fromDate || 'today'}, toDate: ${toDate || 'now'})`);

      const result = await ActivityService.getProcessedTasks(userId, limit, fromDate, toDate);

      res.json({
        success: result.success,
        userId,
        tasks: result.tasks,
        count: result.count,
        linked_count: result.linked_count,
        standalone_count: result.standalone_count,
        limit,
        fromDate: fromDate || 'today',
        toDate: toDate || 'now'
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

  // Subtask Management
  static async getSubtasks(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const todayOnly = req.query.todayOnly !== 'false'; // default true
      const fromDate = req.query.fromDate as string;
      const toDate = req.query.toDate as string;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`🧩 Getting subtasks for user: ${userId} (todayOnly: ${todayOnly}, fromDate: ${fromDate || 'none'}, toDate: ${toDate || 'none'})`);

      const { SubtaskService } = await import('../services/subtaskService');
      const subtasks = await SubtaskService.getSubtasks(userId, todayOnly, fromDate, toDate);
      
      res.json({
        success: true,
        userId,
        subtasks,
        count: subtasks.length,
        todayOnly,
        fromDate: fromDate || (todayOnly ? 'today' : 'all'),
        toDate: toDate || 'now'
      });
      
    } catch (error: any) {
      console.error('Get subtasks error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  static async forceSubtaskClassification(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`🧩 Force subtask classification for user: ${userId}`);
      
      const { SubtaskService } = await import('../services/subtaskService');
      const result = await SubtaskService.classifyIntoSubtasks(userId);
      
      res.json(result);
      
    } catch (error: any) {
      console.error('Force subtask classification error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Major Task Management
  static async getMajorTasks(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const todayOnly = req.query.todayOnly !== 'false'; // default true
      const fromDate = req.query.fromDate as string;
      const toDate = req.query.toDate as string;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`🏗️ Getting major tasks for user: ${userId} (todayOnly: ${todayOnly}, fromDate: ${fromDate || 'none'}, toDate: ${toDate || 'none'})`);

      const { MajorTaskService } = await import('../services/majorTaskService');
      const majorTasks = await MajorTaskService.getMajorTasksForUser(userId, todayOnly, fromDate, toDate);
      
      res.json({
        success: true,
        userId,
        majorTasks,
        count: majorTasks.length,
        todayOnly,
        fromDate: fromDate || (todayOnly ? 'today' : 'all'),
        toDate: toDate || 'now'
      });
      
    } catch (error: any) {
      console.error('Get major tasks error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  static async forceMajorTaskClassification(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`🏗️ Force major task classification for user: ${userId}`);
      
      const { MajorTaskService } = await import('../services/majorTaskService');
      const result = await MajorTaskService.classifyIntoMajorTasks(userId, 'new_subtask');
      
      res.json(result);
      
    } catch (error: any) {
      console.error('Force major task classification error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Chat/LLM Endpoints
  // static async askQuestion(req: Request, res: Response) {
  //   try {
  //     const { userId } = req.params;
  //     const { question, limit, similarityThreshold, includeHistory } = req.body;
      
  //     if (!userId || !question) {
  //       return res.status(400).json({
  //         success: false,
  //         error: 'userId and question are required'
  //       });
  //     }

  //     console.log(`💬 Chat question from user ${userId}: "${question}"`);
      
  //     const { ChatService } = await import('../services/chatService');
  //     const result = await ChatService.askQuestion(question, userId, {
  //       limit,
  //       similarityThreshold,
  //       includeHistory
  //     });
      
  //     res.json(result);
      
  //   } catch (error: any) {
  //     console.error('Ask question error:', error);
  //     res.status(500).json({
  //       success: false,
  //       error: 'Internal server error',
  //       message: error.message
  //     });
  //   }
  // }

  // static async getChatHistory(req: Request, res: Response) {
  //   try {
  //     const { userId } = req.params;
  //     const limit = parseInt(req.query.limit as string) || 20;
      
  //     if (!userId) {
  //       return res.status(400).json({
  //         success: false,
  //         error: 'User ID is required'
  //       });
  //     }

  //     const { ChatService } = await import('../services/chatService');
  //     const history = await ChatService.getChatHistory(userId, limit);
      
  //     res.json({
  //       success: true,
  //       history,
  //       count: history.length
  //     });
      
  //   } catch (error: any) {
  //     console.error('Get chat history error:', error);
  //     res.status(500).json({
  //       success: false,
  //       error: 'Internal server error'
  //     });
  //   }
  // }

  // static async clearChatHistory(req: Request, res: Response) {
  //   try {
  //     const { userId } = req.params;
      
  //     if (!userId) {
  //       return res.status(400).json({
  //         success: false,
  //         error: 'User ID is required'
  //       });
  //     }

  //     const { ChatService } = await import('../services/chatService');
  //     const success = await ChatService.clearChatHistory(userId);
      
  //     res.json({
  //       success,
  //       message: success ? 'Chat history cleared' : 'Failed to clear chat history'
  //     });
      
  //   } catch (error: any) {
  //     console.error('Clear chat history error:', error);
  //     res.status(500).json({
  //       success: false,
  //       error: 'Internal server error'
  //     });
  //   }
  // }

  // static async getSuggestedQuestions(req: Request, res: Response) {
  //   try {
  //     const { userId } = req.params;
      
  //     if (!userId) {
  //       return res.status(400).json({
  //         success: false,
  //         error: 'User ID is required'
  //       });
  //     }

  //     const { ChatService } = await import('../services/chatService');
  //     const suggestions = await ChatService.getSuggestedQuestions(userId);
      
  //     res.json({
  //       success: true,
  //       suggestions
  //     });
      
  //   } catch (error: any) {
  //     console.error('Get suggested questions error:', error);
  //     res.status(500).json({
  //       success: false,
  //       error: 'Internal server error'
  //     });
  //   }
  // }

  static async generateEmbeddings(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      console.log(`🔄 Generating embeddings for user: ${userId}`);
      
      const { generateAllEmbeddings } = await import('../utils/generateEmbeddings');
      const result = await generateAllEmbeddings(userId);
      
      res.json({
        success: true,
        message: 'Embeddings generated successfully',
        data: result
      });
      
    } catch (error: any) {
      console.error('Generate embeddings error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
} 