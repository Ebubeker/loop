import { supabase } from './database';
import { MajorTaskService } from './majorTaskService';

interface Subtask {
  id: number;
  user_id: string;
  subtask_name: string;
  subtask_summary: string;
  personalized_task_ids: number[];
  update_count: number;
  created_at: string;
  updated_at: string;
}

interface PersonalizedTask {
  id: number;
  user_id: string;
  task_title: string;
  task_description: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

export class SubtaskService {
  private static readonly INITIAL_THRESHOLD = 4;

  /**
   * Check if subtask classification should be triggered for a user
   */
  static async shouldTriggerClassification(userId: string): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Get today's personalized tasks count
    const { data, error } = await supabase
      .from('processed_tasks')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', todayISO);

    if (error) {
      console.error('Error checking task count:', error);
      return false;
    }

    const taskCount = data?.length || 0;

    // Get today's subtasks count
    const { data: subtasks, error: subtaskError } = await supabase
      .from('subtasks')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', todayISO);

    if (subtaskError) {
      console.error('Error checking subtask count:', subtaskError);
      return false;
    }

    const subtaskCount = subtasks?.length || 0;

    // If no subtasks exist and we have at least 4 tasks, trigger initial classification
    if (subtaskCount === 0 && taskCount >= this.INITIAL_THRESHOLD) {
      return true;
    }

    // If subtasks exist, trigger on every new task
    if (subtaskCount > 0) {
      return true;
    }

    return false;
  }

  /**
   * Get today's personalized tasks for a user
   */
  private static async getTodaysTasks(userId: string): Promise<PersonalizedTask[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const { data, error } = await supabase
      .from('processed_tasks')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', todayISO)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get today's subtasks for a user
   */
  private static async getTodaysSubtasks(userId: string): Promise<Subtask[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const { data, error } = await supabase
      .from('subtasks')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', todayISO)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching subtasks:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Classify tasks into subtasks using Gemini AI
   */
  static async classifyIntoSubtasks(userId: string, newTaskId?: number): Promise<{
    success: boolean;
    message: string;
    subtasksCreated?: number;
    subtasksUpdated?: number;
  }> {
    try {
      const tasks = await this.getTodaysTasks(userId);
      const existingSubtasks = await this.getTodaysSubtasks(userId);

      if (tasks.length < this.INITIAL_THRESHOLD && existingSubtasks.length === 0) {
        return {
          success: false,
          message: `Waiting for ${this.INITIAL_THRESHOLD} tasks (current: ${tasks.length})`
        };
      }

      // Prepare data for Gemini
      const tasksData = tasks.map(task => ({
        id: task.id,
        title: task.task_title,
        description: task.task_description,
        duration_minutes: task.duration_minutes,
        start_time: task.start_time
      }));

      const subtasksData = existingSubtasks.map(sub => ({
        id: sub.id,
        name: sub.subtask_name,
        summary: sub.subtask_summary,
        task_ids: sub.personalized_task_ids
      }));

      console.log(`🧩 Classifying ${tasks.length} tasks into subtasks for user ${userId}...`);
      console.log(`📊 Existing subtasks: ${existingSubtasks.length}`);

      const prompt = this.buildClassificationPrompt(tasksData, subtasksData, newTaskId);

      // Call Gemini API
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const aiResult = response.text();

      // Parse result
      const cleanedResult = aiResult
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleanedResult);
      const subtasks = parsed.subtasks || [];

      // Save or update subtasks
      let created = 0;
      let updated = 0;
      const createdSubtaskIds: number[] = [];
      const updatedSubtaskIds: number[] = [];

      for (const subtaskData of subtasks) {
        const existingSubtask = existingSubtasks.find(
          s => s.id === subtaskData.id || s.subtask_name === subtaskData.name
        );

        if (existingSubtask) {
          // Increment update_count
          const newUpdateCount = (existingSubtask.update_count || 0) + 1;

          // Update existing subtask
          const { error } = await supabase
            .from('subtasks')
            .update({
              subtask_name: subtaskData.name,
              subtask_summary: subtaskData.summary,
              personalized_task_ids: subtaskData.task_ids,
              update_count: newUpdateCount,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingSubtask.id);

          if (error) {
            console.error(`❌ Failed to update subtask:`, error);
          } else {
            console.log(`✅ Updated subtask: "${subtaskData.name}" (${subtaskData.task_ids.length} tasks, ${newUpdateCount} updates)`);
            updated++;
            updatedSubtaskIds.push(existingSubtask.id);

            // Auto-generate updated embedding for this subtask (non-blocking)
            const { EmbeddingAutoGenerator } = await import('./embeddingAutoGenerator');
            EmbeddingAutoGenerator.generateForSubtask(existingSubtask.id, userId);

            // Check if this subtask reached threshold for major task classification
            if (newUpdateCount >= 10) {
              console.log(`🎯 Subtask ${existingSubtask.id} reached 10 updates - will trigger major task classification`);
            }
          }
        } else {
          // Create new subtask
          const { data, error } = await supabase
            .from('subtasks')
            .insert({
              user_id: userId,
              subtask_name: subtaskData.name,
              subtask_summary: subtaskData.summary,
              personalized_task_ids: subtaskData.task_ids,
              update_count: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (error) {
            console.error(`❌ Failed to create subtask:`, error);
          } else {
            console.log(`✅ Created subtask: "${subtaskData.name}" (${subtaskData.task_ids.length} tasks)`);
            created++;
            if (data?.id) {
              createdSubtaskIds.push(data.id);

              // Auto-generate embedding for this subtask (non-blocking)
              const { EmbeddingAutoGenerator } = await import('./embeddingAutoGenerator');
              EmbeddingAutoGenerator.generateForSubtask(data.id, userId);
            }
          }
        }
      }

      // Trigger major task classification if needed
      const shouldTriggerMajorTask = created > 0 || updatedSubtaskIds.some(async (id) => {
        const shouldTrigger = await MajorTaskService.shouldTriggerClassification(userId, id, false);
        return shouldTrigger;
      });

      if (created > 0) {
        console.log(`🏗️ New subtasks created - triggering major task classification...`);
        await MajorTaskService.classifyIntoMajorTasks(userId, 'new_subtask');
      } else if (updatedSubtaskIds.length > 0) {
        // Check if any updated subtask reached threshold
        for (const subtaskId of updatedSubtaskIds) {
          const shouldTrigger = await MajorTaskService.shouldTriggerClassification(userId, subtaskId, false);
          if (shouldTrigger) {
            console.log(`🏗️ Subtask threshold reached - triggering major task classification...`);
            await MajorTaskService.classifyIntoMajorTasks(userId, 'threshold_reached');
            // Reset update count for this subtask
            await MajorTaskService.resetSubtaskUpdateCount(subtaskId);
            break; // Only trigger once
          }
        }
      }

      return {
        success: true,
        message: `Classified ${tasks.length} tasks into ${subtasks.length} subtasks`,
        subtasksCreated: created,
        subtasksUpdated: updated
      };

    } catch (error: any) {
      console.error('❌ Subtask classification error:', error);
      return {
        success: false,
        message: error.message || 'Failed to classify subtasks'
      };
    }
  }


  private static buildClassificationPrompt(
    tasks: any[],
    existingSubtasks: any[],
    newTaskId?: number
  ): string {
      //       return `
      // You are a task grouping assistant. You will receive a list of personalized tasks completed by a user today.
      // Your job is to group these tasks into logical **subtasks** based on their intent, topic, and context.

      // Rules:
      // 1. A subtask represents a higher-level work stream or project that groups related personalized tasks
      // 2. Group tasks that share similar intent, domain, or are part of the same project
      // 3. Each subtask should have a clear, descriptive name (8-15 words)
      // 4. Each subtask should have a summary explaining what work was done (15-30 words)
      // 5. A subtask must contain at least 1 task
      // 6. If tasks are completely unrelated, create separate subtasks
      // 7. Use descriptive names like "Backend API development for user authentication" instead of generic names like "Coding"

      // Tasks to classify:
      // ${JSON.stringify(tasks, null, 2)}

      // Output format (JSON only, no markdown):
      // {
      //   "subtasks": [
      //     {
      //       "name": "descriptive subtask name",
      //       "summary": "what work was accomplished in this subtask",
      //       "task_ids": [1, 2, 3]
      //     }
      //   ]
      // }

      // Return ONLY valid JSON.`;
      //     } else {
      //       return `
      // You are a task grouping assistant. A new personalized task has been completed.
      // Your job is to classify this task into one of the existing subtasks OR create a new subtask if it doesn't fit.

      // Existing subtasks:
      // ${JSON.stringify(existingSubtasks, null, 2)}

      // All tasks (including new one - ID: ${newTaskId}):
      // ${JSON.stringify(tasks, null, 2)}

      // Rules:
      // 1. Try to classify the new task into an existing subtask if it matches the intent/topic
      // 2. If the new task doesn't fit any existing subtask, create a new one
      // 3. Update the subtask summary to reflect all tasks in that group
      // 4. Maintain consistency with existing subtask names
      // 5. Each subtask name should be descriptive (8-15 words)

      // Output format (JSON only, no markdown):
      // {
      //   "subtasks": [
      //     {
      //       "id": 123,  // include ID if updating existing subtask, omit if creating new
      //       "name": "subtask name",
      //       "summary": "updated summary including all tasks",
      //       "task_ids": [1, 2, 3, ${newTaskId}]
      //     }
      //   ]
      // }

      // Return ONLY valid JSON with ALL subtasks (existing + any new ones).`;
      return `
You are a task grouping assistant. You will receive a list of personalized tasks completed by a user today.
Your job is to group these tasks into logical subtasks based on their intent, topic, and context.

Rules:
1. A subtask represents a higher-level work stream or project that groups related personalized tasks
2. Group tasks that share similar intent, domain, or are part of the same project
3. Each subtask should have a clear, descriptive name 8 to 15 words
4. Each subtask should have a summary with bullet points and a conclusion (40-60 words total)
5. Summary format: "Work description including: • Bullet point 1 • Bullet point 2 • Bullet point 3. Brief conclusion sentence."
6. A subtask must contain at least 1 task
7. If tasks are completely unrelated, create separate subtasks
8. Use descriptive names like "Backend API development for user authentication" instead of generic names like "Coding"

Tasks to classify:
${JSON.stringify(tasks, null, 2)}

Output format JSON only, no markdown:
{
  "subtasks": [
    {
      "name": "descriptive subtask name",
      "summary": "what work was accomplished in this subtask with bullet points",
      "task_ids": [1, 2, 3]
    }
  ]
}

Examples of good subtasks JSON only:

{
  "subtasks": [
    {
      "name": "Backend API development for user authentication and session management",
      "summary": "Authentication system development including: • Built and debugged login and refresh endpoints • Added JWT token rotation for enhanced security • Implemented input validation and error handling • Wrote tests to confirm session lifecycle across protected routes. Successfully established secure authentication flow with proper token management.",
      "task_ids": [101, 108, 112]
    }
  ]
}

{
  "subtasks": [
    {
      "name": "Marketing website redesign for landing pages navigation accessibility and performance",
      "summary": "Website redesign and optimization including: • Updated hero and pricing page layouts for better user experience • Simplified navigation structure and improved accessibility • Added ARIA roles and semantic HTML elements • Compressed images and optimized fonts for faster loading • Reduced Largest Contentful Paint and cumulative layout shift. Successfully improved website performance and accessibility standards.",
      "task_ids": [205, 209, 214, 217]
    }
  ]
}

{
  "subtasks": [
    {
      "name": "Data pipeline maintenance for analytics ingestion cleaning and schema validation",
      "summary": "Data pipeline stabilization including: • Investigated and resolved dropped events in the ingestion process • Added dead letter queue handling for failed records • Normalized payload fields for consistent data structure • Introduced schema versioning with validation rules • Prevented malformed records from reaching the data warehouse. Successfully stabilized the data pipeline with improved error handling and data quality.",
      "task_ids": [301, 302]
    }
  ]
}

Return ONLY valid JSON.

---

You are a task grouping assistant. A new personalized task has been completed.
Your job is to classify this task into one of the existing subtasks OR create a new subtask if it does not fit.

Existing subtasks:
${JSON.stringify(existingSubtasks, null, 2)}

All tasks including new one - ID: ${newTaskId}:
${JSON.stringify(tasks, null, 2)}

Rules:
1. Try to classify the new task into an existing subtask if it matches the intent or topic
2. If the new task does not fit any existing subtask, create a new one
3. Update the subtask summary to reflect all tasks in that group with bullet points and conclusion
4. Summary format: "Work description including: • Bullet point 1 • Bullet point 2 • Bullet point 3. Brief conclusion sentence."
5. Maintain consistency with existing subtask names
6. Each subtask name should be descriptive 8 to 15 words

Output format JSON only, no markdown:
{
  "subtasks": [
    {
      "id": 123,
      "name": "subtask name",
      "summary": "updated summary including all tasks",
      "task_ids": [1, 2, 3, ${newTaskId}]
    }
  ]
}

Return ONLY valid JSON with ALL subtasks existing plus any new ones.
`;
  }

  /**
   * Get subtasks for a user with optional date range filtering
   * @param userId - User ID
   * @param todayOnly - If true, only return today's subtasks (ignored if fromDate is provided)
   * @param fromDate - Optional start date (ISO string)
   * @param toDate - Optional end date (ISO string). If not provided, filters to current time
   */
  static async getSubtasks(
    userId: string,
    todayOnly: boolean = true,
    fromDate?: string,
    toDate?: string
  ): Promise<Subtask[]> {
    let query = supabase
      .from('subtasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Date range filtering takes priority over todayOnly
    if (fromDate) {
      query = query.gte('created_at', fromDate);

      // If toDate is provided, filter up to that date, otherwise filter to now
      if (toDate) {
        query = query.lte('created_at', toDate);
      }
    } else if (todayOnly) {
      // Fall back to todayOnly if no date range provided
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte('created_at', today.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching subtasks:', error);
      return [];
    }

    return data || [];
  }
} 