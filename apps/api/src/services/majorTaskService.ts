import { supabase } from './database';
import { EmbeddingAutoGenerator } from './embeddingAutoGenerator';
import { formatSubtaskContent } from '../utils/generateEmbeddings';
import EmbeddingService from './embeddingService';

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
   * Find the most similar major task using semantic similarity
   */
  private static async getMostSimilarMajorTask(
    userId: string, 
    subtaskEmbedding: number[]
  ): Promise<{task: MajorTask | null, similarity: number}> {
    try {
      // Use Supabase pgvector similarity search
      const { data, error } = await supabase.rpc('search_similar_activities', {
        query_embedding: JSON.stringify(subtaskEmbedding),
        match_user_id: userId,
        match_count: 1,
        similarity_threshold: 0.0, // Get the best match regardless of threshold
        source_types: ['major_task'] // Only search major tasks
      });

      if (error) {
        console.error('Error searching similar major tasks:', error);
        return { task: null, similarity: 0 };
      }

      if (!data || data.length === 0) {
        return { task: null, similarity: 0 };
      }

      const result = data[0];
      
      // Fetch the full major task data
      const { data: majorTaskData, error: majorTaskError } = await supabase
        .from('major_tasks')
        .select('*')
        .eq('id', result.source_id)
        .eq('user_id', userId)
        .single();

      if (majorTaskError || !majorTaskData) {
        console.error('Error fetching major task data:', majorTaskError);
        return { task: null, similarity: 0 };
      }

      return {
        task: majorTaskData as MajorTask,
        similarity: result.similarity
      };

    } catch (error) {
      console.error('Error in getMostSimilarMajorTask:', error);
      return { task: null, similarity: 0 };
    }
  }

  /**
   * Mutate an existing major task to integrate a new subtask using Gemini AI
   */
  private static async mutateMajorTask(existingTask: MajorTask, newSubtask: Subtask): Promise<void> {
    try {
      // Build the mutation prompt
      const prompt = `You are a major task mutation assistant.
Update the task name and summary to integrate the new subtask information.
Preserve the overall project identity.

Existing major task:
{
"name": "${existingTask.major_task_title}",
"summary": "${Array.isArray(existingTask.major_task_summary) ? existingTask.major_task_summary.join('; ') : existingTask.major_task_summary}"
}

New subtask:
{
"name": "${newSubtask.subtask_name}",
"summary": "${newSubtask.subtask_summary}"
}

Return valid JSON:
{
"name": "updated name",
"summary": "updated summary"
}`;

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
      const updatedName = parsed.name;
      const updatedSummary = parsed.summary;

      // Update the major task in Supabase
      const updatedSubtaskIds = [...(existingTask.subtask_ids || []), newSubtask.id];
      const updatedSummaryArray = Array.isArray(existingTask.major_task_summary) 
        ? [...existingTask.major_task_summary, `• ${newSubtask.subtask_name}: ${newSubtask.subtask_summary}`]
        : [updatedSummary, `• ${newSubtask.subtask_name}: ${newSubtask.subtask_summary}`];

      const { error } = await supabase
        .from('major_tasks')
        .update({
          major_task_title: updatedName,
          major_task_summary: updatedSummaryArray,
          subtask_ids: updatedSubtaskIds,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTask.id);

      if (error) {
        console.error(`❌ Failed to mutate major task:`, error);
        throw error;
      }

      console.log(`🌀 Mutated major task: "${updatedName}" based on subtask: ${newSubtask.id}`);

      // Auto-generate updated embedding for this major task (non-blocking)
      if (existingTask.id) {
        EmbeddingAutoGenerator.generateForMajorTask(existingTask.id, existingTask.user_id);
      }

    } catch (error) {
      console.error('❌ Error mutating major task:', error);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  private static calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Merge similar major tasks to reduce redundancy
   */
  static async mergeSimilarMajorTasks(userId: string): Promise<void> {
    try {
      console.log('🔍 Checking for similar major tasks to merge...');

      // Fetch all major tasks for the user
      const { data: majorTasks, error: fetchError } = await supabase
        .from('major_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        console.error('❌ Error fetching major tasks for merge:', fetchError);
        return;
      }

      if (!majorTasks || majorTasks.length < 2) {
        console.log('⏭️ Not enough major tasks to merge');
        return;
      }

      // Fetch embeddings for all major tasks
      const { data: embeddings, error: embeddingError } = await supabase
        .from('activity_embeddings')
        .select('source_id, embedding')
        .eq('user_id', userId)
        .eq('source_type', 'major_task')
        .in('source_id', majorTasks.map(mt => mt.id.toString()));

      if (embeddingError) {
        console.error('❌ Error fetching embeddings for merge:', embeddingError);
        return;
      }

      // Create a map of task ID to embedding
      const embeddingMap = new Map<string, number[]>();
      embeddings?.forEach(emb => {
        try {
          embeddingMap.set(emb.source_id, JSON.parse(emb.embedding));
        } catch (error) {
          console.warn(`⚠️ Could not parse embedding for task ${emb.source_id}`);
        }
      });

      // Compare each pair of major tasks
      const tasksToMerge: Array<{taskA: MajorTask, taskB: MajorTask, similarity: number}> = [];
      const processedPairs = new Set<string>();

      for (let i = 0; i < majorTasks.length; i++) {
        for (let j = i + 1; j < majorTasks.length; j++) {
          const taskA = majorTasks[i];
          const taskB = majorTasks[j];
          const pairKey = `${Math.min(taskA.id, taskB.id)}-${Math.max(taskA.id, taskB.id)}`;

          // Skip if already processed or if tasks don't have embeddings
          if (processedPairs.has(pairKey) || !embeddingMap.has(taskA.id.toString()) || !embeddingMap.has(taskB.id.toString())) {
            continue;
          }

          processedPairs.add(pairKey);

          // Check if they have identical subtask sets
          const subtasksA = new Set(taskA.subtask_ids || []);
          const subtasksB = new Set(taskB.subtask_ids || []);
          const hasIdenticalSubtasks = subtasksA.size === subtasksB.size && 
            [...subtasksA].every(id => subtasksB.has(id));

          if (hasIdenticalSubtasks) {
            continue; // Skip if they have identical subtask sets
          }

          // Calculate cosine similarity
          const embeddingA = embeddingMap.get(taskA.id.toString())!;
          const embeddingB = embeddingMap.get(taskB.id.toString())!;
          const similarity = this.calculateCosineSimilarity(embeddingA, embeddingB);

          if (similarity >= 0.75) {
            tasksToMerge.push({ taskA, taskB, similarity });
            console.log(`🔍 Found similar major tasks: "${taskA.major_task_title}" and "${taskB.major_task_title}" (similarity: ${similarity.toFixed(3)})`);
          }
        }
      }

      if (tasksToMerge.length === 0) {
        console.log('✅ No similar major tasks found for merging');
        return;
      }

      console.log(`🔗 Found ${tasksToMerge.length} pairs of similar major tasks to merge`);

      // Process merges
      for (const { taskA, taskB, similarity } of tasksToMerge) {
        try {
          await this.performTaskMerge(taskA, taskB, similarity);
        } catch (error) {
          console.error(`❌ Failed to merge tasks ${taskA.id} and ${taskB.id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Error in mergeSimilarMajorTasks:', error);
    }
  }

  /**
   * Perform the actual merge of two major tasks
   */
  private static async performTaskMerge(taskA: MajorTask, taskB: MajorTask, similarity: number): Promise<void> {
    try {
      // Build the merge prompt
      const prompt = `Combine these two major tasks into one unified version.
Preserve both goals but produce one clear, coherent summary.

Task A: { "name": "${taskA.major_task_title}", "summary": "${Array.isArray(taskA.major_task_summary) ? taskA.major_task_summary.join('; ') : taskA.major_task_summary}" }
Task B: { "name": "${taskB.major_task_title}", "summary": "${Array.isArray(taskB.major_task_summary) ? taskB.major_task_summary.join('; ') : taskB.major_task_summary}" }

Return valid JSON:
{
"name": "merged major task name",
"summary": "merged major task summary"
}`;

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
      const mergedName = parsed.name;
      const mergedSummary = parsed.summary;

      // Combine subtask_ids (unique only)
      const combinedSubtaskIds = [...new Set([...(taskA.subtask_ids || []), ...(taskB.subtask_ids || [])])];

      // Create merged summary array
      const mergedSummaryArray = Array.isArray(mergedSummary) ? mergedSummary : [mergedSummary];

      // Create new merged record
      const { data: mergedTask, error: createError } = await supabase
        .from('major_tasks')
        .insert({
          user_id: taskA.user_id,
          major_task_title: mergedName,
          major_task_summary: mergedSummaryArray,
          subtask_ids: combinedSubtaskIds,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error(`❌ Failed to create merged major task:`, createError);
        throw createError;
      }

      // Archive the old tasks by adding a prefix to their titles
      const archivePrefix = '[MERGED] ';
      
      // Archive task A
      await supabase
        .from('major_tasks')
        .update({
          major_task_title: archivePrefix + taskA.major_task_title,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskA.id);

      // Archive task B
      await supabase
        .from('major_tasks')
        .update({
          major_task_title: archivePrefix + taskB.major_task_title,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskB.id);

      console.log(`🔗 Merged major tasks: ${taskA.id} and ${taskB.id} → "${mergedName}"`);

      // Auto-generate embedding for the merged task (non-blocking)
      if (mergedTask?.id) {
        EmbeddingAutoGenerator.generateForMajorTask(mergedTask.id, taskA.user_id);
      }

    } catch (error) {
      console.error('❌ Error performing task merge:', error);
      throw error;
    }
  }

  /**
   * Classify subtasks into major tasks using semantic similarity and Gemini AI
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

      // Initialize embedding service
      const embeddingService = new EmbeddingService(process.env.GEMINI_API_KEY || '', supabase);
      
      // Process subtasks with semantic similarity layer
      const subtasksToProcess = [];
      const directlyLinkedSubtasks = [];

      for (const subtask of subtasks) {
        try {
          // Generate embedding for the subtask
          const subtaskForEmbedding = {
            ...subtask,
            id: subtask.id.toString() // Convert number to string for formatSubtaskContent
          };
          const subtaskContent = formatSubtaskContent(subtaskForEmbedding);
          const subtaskEmbedding = await embeddingService.generateEmbedding(subtaskContent);

          // Find most similar major task
          const { task: similarTask, similarity } = await this.getMostSimilarMajorTask(userId, subtaskEmbedding);

          if (similarity >= 0.85) {
            // High similarity - directly link to existing major task
            console.log(`🔍 Similar major task found: "${similarTask?.major_task_title}", similarity: ${similarity.toFixed(3)}`);
            
            if (similarTask) {
              // Update the major task to include this subtask
              const updatedSubtaskIds = [...(similarTask.subtask_ids || []), subtask.id];
              const updatedSummary = [...(similarTask.major_task_summary || [])];
              
              // Add subtask summary to major task summary if not already present
              const subtaskSummary = `• ${subtask.subtask_name}: ${subtask.subtask_summary}`;
              if (!updatedSummary.some(summary => summary.includes(subtask.subtask_name))) {
                updatedSummary.push(subtaskSummary);
              }

              const { error } = await supabase
                .from('major_tasks')
                .update({
                  major_task_summary: updatedSummary,
                  subtask_ids: updatedSubtaskIds,
                  updated_at: new Date().toISOString()
                })
                .eq('id', similarTask.id);

              if (error) {
                console.error(`❌ Failed to update major task with direct link:`, error);
                subtasksToProcess.push(subtask);
              } else {
                console.log(`✅ Directly linked subtask "${subtask.subtask_name}" to major task "${similarTask.major_task_title}"`);
                directlyLinkedSubtasks.push(subtask);
                
                // Auto-generate updated embedding for this major task (non-blocking)
                EmbeddingAutoGenerator.generateForMajorTask(similarTask.id!, userId);

                // Trigger merge check for similar major tasks (non-blocking)
                setImmediate(() => {
                  this.mergeSimilarMajorTasks(userId).catch(error => {
                    console.error('❌ Error in merge check after direct linking:', error);
                  });
                });
              }
            }
          } else if (similarity >= 0.7 && similarity < 0.85) {
            // Medium similarity - go through mutation flow
            console.log(`🔍 Medium similarity found: "${similarTask?.major_task_title}", similarity: ${similarity.toFixed(3)} - will process through mutation flow`);
            
            if (similarTask) {
              try {
                await this.mutateMajorTask(similarTask, subtask);
                console.log(`✅ Mutated major task "${similarTask.major_task_title}" with subtask "${subtask.subtask_name}"`);
                directlyLinkedSubtasks.push(subtask);

                // Trigger merge check for similar major tasks (non-blocking)
                setImmediate(() => {
                  this.mergeSimilarMajorTasks(userId).catch(error => {
                    console.error('❌ Error in merge check after mutation:', error);
                  });
                });
              } catch (error) {
                console.error(`❌ Failed to mutate major task for subtask ${subtask.id}:`, error);
                subtasksToProcess.push(subtask);
              }
            } else {
              subtasksToProcess.push(subtask);
            }
          } else {
            // Low similarity - continue to Gemini classification
            console.log(`🔍 Low similarity (${similarity.toFixed(3)}) - will process through Gemini classification`);
            subtasksToProcess.push(subtask);
          }

          // Generate embedding for the subtask (non-blocking)
          EmbeddingAutoGenerator.generateForSubtask(subtask.id, userId);

        } catch (error) {
          console.error(`❌ Error processing subtask ${subtask.id} for similarity:`, error);
          // If similarity check fails, add to processing queue
          subtasksToProcess.push(subtask);
        }
      }

      console.log(`📊 Semantic similarity results: ${directlyLinkedSubtasks.length} directly linked, ${subtasksToProcess.length} to process through Gemini`);

      // If no subtasks need Gemini processing, we're done
      if (subtasksToProcess.length === 0) {
        console.log('✅ All subtasks processed through semantic similarity - no Gemini classification needed');
        
        // Check and update defined task completion based on time spent
        console.log('🔍 Checking defined task completion status...');
        await this.checkAndUpdateTaskCompletion(userId, subtasks);

        return {
          success: true,
          message: `Processed ${subtasks.length} subtasks: ${directlyLinkedSubtasks.length} linked via similarity/mutation, 0 processed through Gemini. Merge check triggered.`,
          majorTasksCreated: 0,
          majorTasksUpdated: directlyLinkedSubtasks.length
        };
      }

      // Process remaining subtasks through Gemini
      const prompt = this.buildClassificationPrompt(subtasksToProcess, existingMajorTasks, definedTasks);

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
              EmbeddingAutoGenerator.generateForMajorTask(existingMajorTask.id, userId);
            }

            // Trigger merge check for similar major tasks (non-blocking)
            setImmediate(() => {
              this.mergeSimilarMajorTasks(userId).catch(error => {
                console.error('❌ Error in merge check after major task update:', error);
              });
            });
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
              EmbeddingAutoGenerator.generateForMajorTask(data.id, userId);
            }

            // Trigger merge check for similar major tasks (non-blocking)
            setImmediate(() => {
              this.mergeSimilarMajorTasks(userId).catch(error => {
                console.error('❌ Error in merge check after major task creation:', error);
              });
            });
          }
        }
      }

      // Check and update defined task completion based on time spent
      console.log('🔍 Checking defined task completion status...');
      await this.checkAndUpdateTaskCompletion(userId, subtasks);

      return {
        success: true,
        message: `Processed ${subtasks.length} subtasks: ${directlyLinkedSubtasks.length} linked via similarity/mutation, ${subtasksToProcess.length} processed through Gemini. Merge check triggered.`,
        majorTasksCreated: created,
        majorTasksUpdated: updated + directlyLinkedSubtasks.length
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