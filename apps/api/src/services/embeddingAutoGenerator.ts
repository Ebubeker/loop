import { createClient } from '@supabase/supabase-js';
import EmbeddingService from './embeddingService';
import { formatProcessedTaskContent, formatSubtaskContent, formatMajorTaskContent } from '../utils/generateEmbeddings';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

/**
 * Auto-generate embeddings service
 * This runs in the background and doesn't block the main flow
 */
export class EmbeddingAutoGenerator {
  /**
   * Generate embedding for a processed task (async, non-blocking)
   */
  static async generateForProcessedTask(taskId: number | string, userId: string): Promise<void> {
    // Run in background, don't block
    setImmediate(async () => {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Fetch the task data
        const { data: task, error } = await supabase
          .from('processed_tasks')
          .select('*')
          .eq('id', taskId)
          .eq('user_id', userId)
          .single();

        if (error || !task) {
          console.warn(`⚠️ Could not fetch processed task ${taskId} for embedding:`, error);
          return;
        }

        const content = formatProcessedTaskContent(task);

        const embeddingService = new EmbeddingService(geminiApiKey, supabase);
        await embeddingService.storeEmbedding({
          userId,
          sourceType: 'processed_task',
          sourceId: taskId.toString(),
          content,
          metadata: {
            task_title: task.task_title,
            duration_minutes: task.duration_minutes,
            status: task.status,
            start_time: task.start_time,
          },
        });

        console.log(`🤖 Generated embedding for processed task ${taskId}: "${task.task_title}"`);
      } catch (error) {
        console.error(`❌ Failed to generate embedding for processed task ${taskId}:`, error);
      }
    });
  }

  /**
   * Generate embedding for a subtask (async, non-blocking)
   */
  static async generateForSubtask(subtaskId: number | string, userId: string): Promise<void> {
    // Run in background, don't block
    setImmediate(async () => {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Fetch the subtask data
        const { data: subtask, error } = await supabase
          .from('subtasks')
          .select('*')
          .eq('id', subtaskId)
          .eq('user_id', userId)
          .single();

        if (error || !subtask) {
          console.warn(`⚠️ Could not fetch subtask ${subtaskId} for embedding:`, error);
          return;
        }

        const content = formatSubtaskContent(subtask);

        const embeddingService = new EmbeddingService(geminiApiKey, supabase);
        await embeddingService.storeEmbedding({
          userId,
          sourceType: 'subtask',
          sourceId: subtaskId.toString(),
          content,
          metadata: {
            subtask_name: subtask.subtask_name,
            task_count: subtask.personalized_task_ids?.length || 0,
            created_at: subtask.created_at,
          },
        });

        console.log(`🤖 Generated embedding for subtask ${subtaskId}: "${subtask.subtask_name}"`);
      } catch (error) {
        console.error(`❌ Failed to generate embedding for subtask ${subtaskId}:`, error);
      }
    });
  }

  /**
   * Generate embedding for a major task (async, non-blocking)
   */
  static async generateForMajorTask(majorTaskId: number | string, userId: string): Promise<void> {
    // Run in background, don't block
    setImmediate(async () => {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Fetch the major task data
        const { data: majorTask, error } = await supabase
          .from('major_tasks')
          .select('*')
          .eq('id', majorTaskId)
          .eq('user_id', userId)
          .single();

        if (error || !majorTask) {
          console.warn(`⚠️ Could not fetch major task ${majorTaskId} for embedding:`, error);
          return;
        }

        const content = formatMajorTaskContent(majorTask);

        const embeddingService = new EmbeddingService(geminiApiKey, supabase);
        await embeddingService.storeEmbedding({
          userId,
          sourceType: 'major_task',
          sourceId: majorTaskId.toString(),
          content,
          metadata: {
            major_task_title: majorTask.major_task_title,
            subtask_count: majorTask.subtask_ids?.length || 0,
            created_at: majorTask.created_at,
            updated_at: majorTask.updated_at,
          },
        });

        console.log(`🤖 Generated embedding for major task ${majorTaskId}: "${majorTask.major_task_title}"`);
      } catch (error) {
        console.error(`❌ Failed to generate embedding for major task ${majorTaskId}:`, error);
      }
    });
  }

  /**
   * Batch generate embeddings for multiple processed tasks (async, non-blocking)
   */
  static async generateForProcessedTasks(taskIds: (number | string)[], userId: string): Promise<void> {
    for (const taskId of taskIds) {
      await this.generateForProcessedTask(taskId, userId);
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

export default EmbeddingAutoGenerator;

