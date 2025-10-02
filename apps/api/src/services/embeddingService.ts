import { supabase } from './database';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class EmbeddingService {
  private static genAI: GoogleGenerativeAI | null = null;

  private static initializeGemini() {
    if (!this.genAI) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
    return this.genAI;
  }

  /**
   * Generate embedding for text using Gemini
   */
  private static async generateEmbedding(text: string): Promise<number[]> {
    const genAI = this.initializeGemini();
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    const result = await model.embedContent(text);
    const embedding = result.embedding;
    
    return embedding.values;
  }

  /**
   * Create embedding for a processed task
   */
  static async embedProcessedTask(taskId: number, userId: string): Promise<boolean> {
    try {
      // Get the task data
      const { data: task, error } = await supabase
        .from('processed_tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

      if (error || !task) {
        console.error('Error fetching task:', error);
        return false;
      }

      // Create rich text representation
      const content = `
Task: ${task.task_title}
Description: ${task.task_description}
Duration: ${task.duration_minutes} minutes
Status: ${task.status}
Time: ${new Date(task.start_time).toLocaleString()}
Apps/Activities: ${task.activity_summaries?.join(', ') || 'N/A'}
`.trim();

      // Generate embedding
      const embedding = await this.generateEmbedding(content);

      // Store in database
      const { error: insertError } = await supabase
        .from('activity_embeddings')
        .upsert({
          user_id: userId,
          source_type: 'processed_task',
          source_id: taskId,
          content: content,
          embedding: embedding,
          metadata: {
            task_title: task.task_title,
            duration_minutes: task.duration_minutes,
            start_time: task.start_time,
            end_time: task.end_time,
            status: task.status
          }
        }, {
          onConflict: 'source_type,source_id,user_id'
        });

      if (insertError) {
        console.error('Error storing embedding:', insertError);
        return false;
      }

      console.log(`✅ Created embedding for processed_task ${taskId}`);
      return true;

    } catch (error) {
      console.error('Error in embedProcessedTask:', error);
      return false;
    }
  }

  /**
   * Create embedding for a subtask
   */
  static async embedSubtask(subtaskId: number, userId: string): Promise<boolean> {
    try {
      const { data: subtask, error } = await supabase
        .from('subtasks')
        .select('*')
        .eq('id', subtaskId)
        .eq('user_id', userId)
        .single();

      if (error || !subtask) {
        console.error('Error fetching subtask:', error);
        return false;
      }

      const content = `
Subtask: ${subtask.subtask_name}
Summary: ${subtask.subtask_summary}
Number of tasks: ${subtask.personalized_task_ids?.length || 0}
Last updated: ${new Date(subtask.updated_at).toLocaleString()}
`.trim();

      const embedding = await this.generateEmbedding(content);

      const { error: insertError } = await supabase
        .from('activity_embeddings')
        .upsert({
          user_id: userId,
          source_type: 'subtask',
          source_id: subtaskId,
          content: content,
          embedding: embedding,
          metadata: {
            subtask_name: subtask.subtask_name,
            task_count: subtask.personalized_task_ids?.length || 0,
            created_at: subtask.created_at,
            updated_at: subtask.updated_at
          }
        }, {
          onConflict: 'source_type,source_id,user_id'
        });

      if (insertError) {
        console.error('Error storing embedding:', insertError);
        return false;
      }

      console.log(`✅ Created embedding for subtask ${subtaskId}`);
      return true;

    } catch (error) {
      console.error('Error in embedSubtask:', error);
      return false;
    }
  }

  /**
   * Create embedding for a major task
   */
  static async embedMajorTask(majorTaskId: number, userId: string): Promise<boolean> {
    try {
      const { data: majorTask, error } = await supabase
        .from('major_tasks')
        .select('*')
        .eq('id', majorTaskId)
        .eq('user_id', userId)
        .single();

      if (error || !majorTask) {
        console.error('Error fetching major task:', error);
        return false;
      }

      const summaryBullets = Array.isArray(majorTask.major_task_summary)
        ? majorTask.major_task_summary.map((bullet: string) => `• ${bullet}`).join('\n')
        : '';

      const content = `
Major Task: ${majorTask.major_task_title}
Summary:
${summaryBullets}
Number of subtasks: ${majorTask.subtask_ids?.length || 0}
Last updated: ${new Date(majorTask.updated_at).toLocaleString()}
`.trim();

      const embedding = await this.generateEmbedding(content);

      const { error: insertError } = await supabase
        .from('activity_embeddings')
        .upsert({
          user_id: userId,
          source_type: 'major_task',
          source_id: majorTaskId,
          content: content,
          embedding: embedding,
          metadata: {
            major_task_title: majorTask.major_task_title,
            subtask_count: majorTask.subtask_ids?.length || 0,
            created_at: majorTask.created_at,
            updated_at: majorTask.updated_at
          }
        }, {
          onConflict: 'source_type,source_id,user_id'
        });

      if (insertError) {
        console.error('Error storing embedding:', insertError);
        return false;
      }

      console.log(`✅ Created embedding for major_task ${majorTaskId}`);
      return true;

    } catch (error) {
      console.error('Error in embedMajorTask:', error);
      return false;
    }
  }

  /**
   * Generate embeddings for all existing data for a user
   */
  static async generateAllEmbeddings(userId: string): Promise<{
    success: boolean;
    processedTasks: number;
    subtasks: number;
    majorTasks: number;
    errors: number;
  }> {
    console.log(`🔄 Generating embeddings for all data for user ${userId}...`);
    
    let processedCount = 0;
    let subtaskCount = 0;
    let majorTaskCount = 0;
    let errorCount = 0;

    try {
      // Get all processed tasks
      const { data: tasks } = await supabase
        .from('processed_tasks')
        .select('id')
        .eq('user_id', userId);

      if (tasks) {
        for (const task of tasks) {
          const success = await this.embedProcessedTask(task.id, userId);
          if (success) processedCount++;
          else errorCount++;
          
          // Rate limiting - wait 50ms between requests (Gemini is fast)
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Get all subtasks
      const { data: subtasks } = await supabase
        .from('subtasks')
        .select('id')
        .eq('user_id', userId);

      if (subtasks) {
        for (const subtask of subtasks) {
          const success = await this.embedSubtask(subtask.id, userId);
          if (success) subtaskCount++;
          else errorCount++;
          
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Get all major tasks
      const { data: majorTasks } = await supabase
        .from('major_tasks')
        .select('id')
        .eq('user_id', userId);

      if (majorTasks) {
        for (const majorTask of majorTasks) {
          const success = await this.embedMajorTask(majorTask.id, userId);
          if (success) majorTaskCount++;
          else errorCount++;
          
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      console.log(`✅ Embedding generation complete: ${processedCount} tasks, ${subtaskCount} subtasks, ${majorTaskCount} major tasks, ${errorCount} errors`);

      return {
        success: true,
        processedTasks: processedCount,
        subtasks: subtaskCount,
        majorTasks: majorTaskCount,
        errors: errorCount
      };

    } catch (error) {
      console.error('Error generating embeddings:', error);
      return {
        success: false,
        processedTasks: processedCount,
        subtasks: subtaskCount,
        majorTasks: majorTaskCount,
        errors: errorCount + 1
      };
    }
  }

  /**
   * Search for relevant activity embeddings using a query
   */
  static async searchRelevantActivities(
    query: string,
    userId: string,
    limit: number = 10,
    similarityThreshold: number = 0.5
  ): Promise<Array<{
    id: number;
    source_type: string;
    source_id: number;
    content: string;
    metadata: any;
    similarity: number;
  }>> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Use the stored procedure for similarity search
      const { data, error } = await supabase.rpc('search_activity_embeddings', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: limit,
        similarity_threshold: similarityThreshold
      });

      if (error) {
        console.error('Error searching embeddings:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      console.error('Error in searchRelevantActivities:', error);
      return [];
    }
  }
} 