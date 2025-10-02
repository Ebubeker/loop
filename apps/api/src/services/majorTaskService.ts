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

      if (subtasks.length === 0) {
        return {
          success: false,
          message: 'No subtasks found for classification'
        };
      }

      console.log(`🏗️ Classifying ${subtasks.length} subtasks into major tasks for user ${userId}...`);
      console.log(`📊 Existing major tasks: ${existingMajorTasks.length}`);
      console.log(`🎯 Trigger reason: ${triggerReason}`);

      const prompt = this.buildClassificationPrompt(subtasks, existingMajorTasks);

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
          }
        } else {
          // Create new major task
          const { error } = await supabase
            .from('major_tasks')
            .insert({
              user_id: userId,
              major_task_title: majorTaskData.title,
              major_task_summary: majorTaskData.summary_bullets,
              subtask_ids: majorTaskData.subtask_ids,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (error) {
            console.error(`❌ Failed to create major task:`, error);
          } else {
            console.log(`✅ Created major task: "${majorTaskData.title}" (${majorTaskData.subtask_ids.length} subtasks)`);
            created++;
          }
        }
      }

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
    existingMajorTasks: MajorTask[]
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

    const isInitial = existingMajorTasks.length === 0;

    if (isInitial) {
      return `
You are a high-level work categorization assistant. You will receive a list of subtasks representing different work streams.
Your job is to group these subtasks into **major_tasks** - the highest level of work organization.

Rules for major_tasks:
1. A major_task represents a significant project, initiative, or area of work
2. Group subtasks that contribute to the same high-level goal or project
3. Use long, descriptive titles (15-25 words) that capture the full scope
4. Provide bullet-point summaries (3-5 bullets) describing the key accomplishments
5. Each major_task should represent meaningful, substantial work - not minor tasks
6. If subtasks are completely unrelated at a high level, create separate major_tasks
7. Think in terms of: Projects, Features, Initiatives, Systems, or Major Components

Examples of good major_task titles:
- "Comprehensive Backend API Development with Authentication, Security, and Performance Optimization"
- "Frontend User Interface Redesign with Improved UX and Accessibility Features"
- "Database Migration and Schema Optimization for Scalability and Performance"

Subtasks to classify:
${JSON.stringify(subtasksData, null, 2)}

Output format (JSON only, no markdown):
{
  "major_tasks": [
    {
      "title": "long descriptive title capturing full scope (15-25 words)",
      "summary_bullets": [
        "First key accomplishment or component",
        "Second key accomplishment or component",
        "Third key accomplishment or component"
      ],
      "subtask_ids": [1, 2, 3]
    }
  ]
}

Return ONLY valid JSON.`;
    } else {
      return `
You are a high-level work categorization assistant. New subtasks have been created or updated.
Your job is to classify subtasks into existing major_tasks OR create new major_tasks if needed.

Existing major_tasks:
${JSON.stringify(majorTasksData, null, 2)}

All subtasks:
${JSON.stringify(subtasksData, null, 2)}

Rules:
1. Try to fit new subtasks into existing major_tasks if they match the high-level goal
2. If a subtask represents entirely new work direction, create a new major_task
3. Update major_task summaries to reflect all included subtasks
4. Maintain consistency with existing major_task titles and structure
5. Major tasks should represent substantial, meaningful work categories
6. Use long descriptive titles (15-25 words)
7. Provide 3-5 bullet points summarizing key accomplishments

Output format (JSON only, no markdown):
{
  "major_tasks": [
    {
      "id": 123,  // include ID if updating existing major_task, omit if creating new
      "title": "long descriptive title (15-25 words)",
      "summary_bullets": [
        "Key accomplishment 1",
        "Key accomplishment 2",
        "Key accomplishment 3"
      ],
      "subtask_ids": [1, 2, 3, 4]
    }
  ]
}

Return ONLY valid JSON with ALL major_tasks (existing updated + any new ones).`;
    }
  }

  /**
   * Get major tasks for a user
   */
  static async getMajorTasksForUser(userId: string, todayOnly: boolean = true): Promise<MajorTask[]> {
    return this.getMajorTasks(userId, todayOnly);
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
} 