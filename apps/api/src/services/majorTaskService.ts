import { supabase } from './database';

interface MajorTask {
  id?: number;
  user_id: string;
  major_task_title: string;
  major_task_summary: string[]; // Array of bullet points
  subtask_ids: number[];
  created_at: string;
  updated_at: string;
}

interface Subtask {
  id: number;
  user_id: string;
  subtask_name: string;
  subtask_summary: string;
  personalized_task_ids: number[];
  update_count: number;
}

export class MajorTaskService {
  private static readonly UPDATE_THRESHOLD = 10;

  /**
   * Check if major task classification should be triggered
   * Triggers when: new subtasks created OR subtask has 10 updates
   */
  static async shouldTriggerClassification(
    userId: string,
    subtaskId?: number,
    isNewSubtask: boolean = false
  ): Promise<boolean> {
    // Always trigger if new subtask created
    if (isNewSubtask) {
      console.log('🎯 New subtask detected - will trigger major task classification');
      return true;
    }

    // Check if specific subtask has reached update threshold
    if (subtaskId) {
      const { data, error } = await supabase
        .from('subtasks')
        .select('update_count')
        .eq('id', subtaskId)
        .single();

      if (!error && data) {
        const updateCount = data.update_count || 0;
        if (updateCount >= this.UPDATE_THRESHOLD) {
          console.log(`🎯 Subtask ${subtaskId} reached ${updateCount} updates - triggering major task classification`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get all subtasks for a user (today or all time)
   */
  private static async getSubtasks(userId: string, todayOnly: boolean = true): Promise<Subtask[]> {
    let query = supabase
      .from('subtasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (todayOnly) {
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

  /**
   * Get existing major tasks for a user
   */
  private static async getMajorTasks(userId: string, todayOnly: boolean = true): Promise<MajorTask[]> {
    let query = supabase
      .from('major_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (todayOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte('created_at', today.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching major tasks:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get predefined tasks (user's task categories) for classification guidance
   */
  private static async getDefinedTasks(userId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, name, description, category, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching defined tasks:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Classify subtasks into major tasks using Gemini AI
   */
  static async classifyIntoMajorTasks(
    userId: string,
    triggerReason: 'new_subtask' | 'threshold_reached' = 'new_subtask'
  ): Promise<{
    success: boolean;
    message: string;
    majorTasksCreated?: number;
    majorTasksUpdated?: number;
  }> {
    try {
      const subtasks = await this.getSubtasks(userId, true);
      const existingMajorTasks = await this.getMajorTasks(userId, true);
      const definedTasks = await this.getDefinedTasks(userId);

      if (subtasks.length === 0) {
        return {
          success: false,
          message: 'No subtasks found for classification'
        };
      }

      console.log(`🏗️ Classifying ${subtasks.length} subtasks into major tasks for user ${userId}...`);
      console.log(`📊 Existing major tasks: ${existingMajorTasks.length}`);
      console.log(`📋 Predefined tasks: ${definedTasks.length}`);
      console.log(`🎯 Trigger reason: ${triggerReason}`);

      const prompt = this.buildClassificationPrompt(subtasks, existingMajorTasks, definedTasks);

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
      const majorTasks = parsed.major_tasks || [];

      // Save or update major tasks
      let created = 0;
      let updated = 0;

      for (const majorTaskData of majorTasks) {
        const existingMajorTask = existingMajorTasks.find(
          mt => mt.id === majorTaskData.id || mt.major_task_title === majorTaskData.title
        );

        if (existingMajorTask) {
          // Update existing major task
          const { error } = await supabase
            .from('major_tasks')
            .update({
              major_task_title: majorTaskData.title,
              major_task_summary: majorTaskData.summary_bullets,
              subtask_ids: majorTaskData.subtask_ids,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingMajorTask.id);

          if (error) {
            console.error(`❌ Failed to update major task:`, error);
          } else {
            console.log(`✅ Updated major task: "${majorTaskData.title}" (${majorTaskData.subtask_ids.length} subtasks)`);
            updated++;

            // Auto-generate updated embedding for this major task (non-blocking)
            if (existingMajorTask.id) {
              const { EmbeddingAutoGenerator } = await import('./embeddingAutoGenerator');
              EmbeddingAutoGenerator.generateForMajorTask(existingMajorTask.id, userId);
            }
          }
        } else {
          // Create new major task
          const { data, error } = await supabase
            .from('major_tasks')
            .insert({
              user_id: userId,
              major_task_title: majorTaskData.title,
              major_task_summary: majorTaskData.summary_bullets,
              subtask_ids: majorTaskData.subtask_ids,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (error) {
            console.error(`❌ Failed to create major task:`, error);
          } else {
            console.log(`✅ Created major task: "${majorTaskData.title}" (${majorTaskData.subtask_ids.length} subtasks)`);
            created++;

            // Auto-generate embedding for this major task (non-blocking)
            if (data?.id) {
              const { EmbeddingAutoGenerator } = await import('./embeddingAutoGenerator');
              EmbeddingAutoGenerator.generateForMajorTask(data.id, userId);
            }
          }
        }
      }

      // Check and update defined task completion based on time spent
      console.log('🔍 Checking defined task completion status...');
      await this.checkAndUpdateTaskCompletion(userId, subtasks);

      return {
        success: true,
        message: `Classified ${subtasks.length} subtasks into ${majorTasks.length} major tasks`,
        majorTasksCreated: created,
        majorTasksUpdated: updated
      };

    } catch (error: any) {
      console.error('❌ Major task classification error:', error);
      return {
        success: false,
        message: error.message || 'Failed to classify major tasks'
      };
    }
  }

  /**
   * Build the classification prompt for Gemini
   */
  private static buildClassificationPrompt(
    subtasks: Subtask[],
    existingMajorTasks: MajorTask[],
    definedTasks: any[]
  ): string {
    const subtasksData = subtasks.map(sub => ({
      id: sub.id,
      name: sub.subtask_name,
      summary: sub.subtask_summary,
      task_count: sub.personalized_task_ids.length,
      update_count: sub.update_count || 0
    }));

    const majorTasksData = existingMajorTasks.map(mt => ({
      id: mt.id,
      title: mt.major_task_title,
      summary_bullets: mt.major_task_summary,
      subtask_ids: mt.subtask_ids
    }));

    return `
      You are a high-level work categorization assistant. You will receive:
- A list of subtasks representing different work streams.
- A list of predefined task categories that represent known major work areas.

Your job is to group these subtasks into **major_tasks** — the highest level of work organization.

If predefined tasks exist, aim to classify subtasks primarily into those predefined tasks.
If no predefined task fits, classify the subtask under a new category starting with "Other: ".

Rules for major_tasks:
1. A major_task represents a significant project, initiative, or area of work.
2. Group subtasks that contribute to the same high-level goal or project.
3. Use long, descriptive titles (15–25 words) that clearly capture the full scope.
4. Include a short description (10–15 words) for quick preview purposes.
5. Provide bullet-point summaries (3–5 bullets) describing the key accomplishments.
6. Each major_task should represent meaningful, substantial work — not minor efforts.
7. If subtasks are completely unrelated at a high level, create separate major_tasks.
8. Think in terms of: Projects, Features, Initiatives, Systems, or Major Components.

Predefined major task categories:
${JSON.stringify(definedTasks, null, 2)}

Subtasks to classify:
${JSON.stringify(subtasksData, null, 2)}

---

Examples of good major_tasks:

{
  "major_tasks": [
    {
      "title": "Comprehensive Backend API development with secure authentication, user management, and data optimization layers",
      "short_desc": "Developed backend with authentication, database structure, and route optimization",
      "summary_bullets": [
        "Implemented user authentication and authorization modules",
        "Optimized query handling and reduced API response latency",
        "Refactored endpoints to align with new business logic",
        "Integrated automated tests for core backend routes"
      ],
      "subtask_ids": [12, 15, 19]
    }
  ]
}

{
  "major_tasks": [
    {
      "title": "Frontend application redesign focusing on layout consistency, accessibility compliance, and improved load times",
      "short_desc": "Redesigned the frontend UI for better usability and performance",
      "summary_bullets": [
        "Reworked main layout and navigation structure",
        "Enhanced accessibility features including keyboard navigation",
        "Reduced bundle size and improved render times",
        "Conducted usability testing with internal team"
      ],
      "subtask_ids": [25, 26, 29]
    }
  ]
}

{
  "major_tasks": [
    {
      "title": "Other: Documentation and small UI bug fixes not part of predefined initiatives",
      "short_desc": "Grouped miscellaneous tasks like documentation and minor fixes",
      "summary_bullets": [
        "Updated API usage documentation for developers",
        "Fixed small layout inconsistencies across UI pages",
        "Performed quick regression checks after patch deployment"
      ],
      "subtask_ids": [33, 34]
    }
  ]
}

---

Output format (JSON only, no markdown):
{
  "major_tasks": [
    {
      "title": "long descriptive title capturing full scope (15–25 words)",
      "short_desc": "short description for quick view (10–15 words)",
      "summary_bullets": [
        "First key accomplishment or component",
        "Second key accomplishment or component",
        "Third key accomplishment or component"
      ],
      "subtask_ids": [1, 2, 3]
    }
  ]
}

Return ONLY valid JSON.

---

You are a high-level work categorization assistant. New subtasks have been created or updated.
Your job is to classify subtasks into existing major_tasks OR create new major_tasks if needed.

Predefined major task categories:
${JSON.stringify(definedTasks, null, 2)}

Existing major_tasks:
${JSON.stringify(majorTasksData, null, 2)}

All subtasks:
${JSON.stringify(subtasksData, null, 2)}

Rules:
1. Try to fit new subtasks into an existing major_task or predefined category if they match the high-level goal.
2. If a subtask represents a new type of work, create a new major_task.
3. If no predefined task fits, create one under “Other: ”.
4. Update major_task summaries to reflect all included subtasks.
5. Maintain consistency with existing major_task titles and structure.
6. Major_tasks should represent substantial, meaningful work categories.
7. Include a short_desc (10–15 words) for quick summary.
8. Provide 3–5 bullet points summarizing key accomplishments.

Output format (JSON only, no markdown):
{
  "major_tasks": [
    {
      "id": 123,  // include ID if updating existing major_task, omit if creating new
      "title": "long descriptive title (15–25 words)",
      "short_desc": "short description for quick preview (10–15 words)",
      "summary_bullets": [
        "Key accomplishment 1",
        "Key accomplishment 2",
        "Key accomplishment 3"
      ],
      "subtask_ids": [1, 2, 3, 4]
    }
  ]
}

Return ONLY valid JSON with ALL major_tasks (existing updated + any new ones).
`;
  }

  /**
   * Get major tasks for a user with optional date range filtering
   * @param userId - User ID
   * @param todayOnly - If true, only return today's major tasks (ignored if fromDate is provided)
   * @param fromDate - Optional start date (ISO string)
   * @param toDate - Optional end date (ISO string). If not provided, filters to current time
   */
  static async getMajorTasksForUser(
    userId: string,
    todayOnly: boolean = true,
    fromDate?: string,
    toDate?: string
  ): Promise<MajorTask[]> {
    let query = supabase
      .from('major_tasks')
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
      console.error('Error fetching major tasks:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Reset update count for a subtask after major task classification
   */
  static async resetSubtaskUpdateCount(subtaskId: number): Promise<void> {
    await supabase
      .from('subtasks')
      .update({ update_count: 0 })
      .eq('id', subtaskId);
  }

  /**
   * Check and update defined task completion status based on time spent
   * Calculates total time from processed_tasks linked to the defined task
   */
  private static async checkAndUpdateTaskCompletion(
    userId: string,
    subtasks: Subtask[]
  ): Promise<void> {
    try {
      // Get all personalized_task_ids from all subtasks
      const allPersonalizedTaskIds = subtasks.flatMap(sub => sub.personalized_task_ids);
      
      if (allPersonalizedTaskIds.length === 0) {
        console.log('⏭️ No personalized tasks to check for completion');
        return;
      }

      // Fetch all processed_tasks (processlogs) for these IDs
      const { data: processedTasks, error: processedError } = await supabase
        .from('processed_tasks')
        .select('id, task_id, duration_minutes')
        .in('id', allPersonalizedTaskIds)
        .not('task_id', 'is', null); // Only get tasks linked to defined tasks

      if (processedError) {
        console.error('❌ Error fetching processed tasks:', processedError);
        return;
      }

      if (!processedTasks || processedTasks.length === 0) {
        console.log('⏭️ No processed tasks linked to defined tasks');
        return;
      }

      // Group by task_id and calculate total time spent
      const taskTimeMap = new Map<number, number>();
      
      processedTasks.forEach(pt => {
        if (pt.task_id) {
          const currentTime = taskTimeMap.get(pt.task_id) || 0;
          taskTimeMap.set(pt.task_id, currentTime + (pt.duration_minutes || 0));
        }
      });

      console.log(`⏱️ Checking completion for ${taskTimeMap.size} defined tasks...`);

      // For each defined task, check if time spent >= duration
      for (const [taskId, totalMinutesSpent] of taskTimeMap.entries()) {
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .select('id, name, duration, status')
          .eq('id', taskId)
          .eq('user_id', userId)
          .single();

        if (taskError || !task) {
          console.error(`❌ Error fetching task ${taskId}:`, taskError);
          continue;
        }

        // Skip if task is already completed
        if (task.status === 'completed') {
          console.log(`✓ Task "${task.name}" already marked as completed`);
          continue;
        }

        // Check if time spent exceeds or equals the defined duration
        if (task.duration && totalMinutesSpent >= task.duration) {
          const { error: updateError } = await supabase
            .from('tasks')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', taskId);

          if (updateError) {
            console.error(`❌ Failed to mark task ${taskId} as completed:`, updateError);
          } else {
            console.log(`✅ Task "${task.name}" marked as COMPLETED! (${totalMinutesSpent}/${task.duration} minutes)`);
          }
        } else {
          console.log(`⏳ Task "${task.name}" in progress: ${totalMinutesSpent}/${task.duration} minutes`);
        }
      }

    } catch (error: any) {
      console.error('❌ Error checking task completion:', error);
    }
  }
} 