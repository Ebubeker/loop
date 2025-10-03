import { createClient } from '@supabase/supabase-js';
import EmbeddingService from '../services/embeddingService';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

interface ProcessedTask {
  id: string;
  user_id: string;
  task_title?: string;
  task_description?: string;
  duration_minutes?: number;
  status?: string;
  start_time?: string;
  end_time?: string;
  activity_summaries?: string[];
  created_at?: string;
}

interface Subtask {
  id: string;
  user_id: string;
  subtask_name?: string;
  subtask_summary?: string;
  personalized_task_ids?: number[];
  created_at?: string;
  updated_at?: string;
}

interface MajorTask {
  id: string;
  user_id: string;
  major_task_title?: string;
  major_task_summary?: any; // Can be string or array
  subtask_ids?: number[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Format processed task data for embedding
 */
function formatProcessedTaskContent(task: ProcessedTask): string {
  return `
Task: ${task.task_title || 'Untitled Task'}
Description: ${task.task_description || 'No description'}
Duration: ${task.duration_minutes || 0} minutes
Status: ${task.status || 'Unknown'}
Time: ${task.start_time ? new Date(task.start_time).toLocaleString() : 'N/A'}
${task.activity_summaries?.length ? `Activities: ${task.activity_summaries.join(', ')}` : ''}
  `.trim();
}

/**
 * Format subtask data for embedding
 */
function formatSubtaskContent(subtask: Subtask): string {
  return `
Subtask: ${subtask.subtask_name || 'Untitled Subtask'}
Summary: ${subtask.subtask_summary || 'No summary'}
Number of tasks: ${subtask.personalized_task_ids?.length || 0}
Last updated: ${subtask.updated_at ? new Date(subtask.updated_at).toLocaleString() : 'N/A'}
  `.trim();
}

/**
 * Format major task data for embedding
 */
function formatMajorTaskContent(majorTask: MajorTask): string {
  const summaryText = Array.isArray(majorTask.major_task_summary)
    ? majorTask.major_task_summary.map((bullet: string) => `• ${bullet}`).join('\n')
    : majorTask.major_task_summary || 'No summary';
    
  return `
Major Task: ${majorTask.major_task_title || 'Untitled Major Task'}
Summary:
${summaryText}
Number of subtasks: ${majorTask.subtask_ids?.length || 0}
Last updated: ${majorTask.updated_at ? new Date(majorTask.updated_at).toLocaleString() : 'N/A'}
  `.trim();
}

/**
 * Generate embeddings for all processed tasks of a user
 */
async function generateProcessedTaskEmbeddings(userId: string): Promise<number> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const embeddingService = new EmbeddingService(geminiApiKey, supabase);
  
  console.log('📝 Fetching processed tasks...');
  
  const { data: tasks, error } = await supabase
    .from('processed_tasks')
    .select('*')
    .eq('user_id', userId);
  
  if (error) {
    console.error('Error fetching processed tasks:', error);
    return 0;
  }
  
  if (!tasks || tasks.length === 0) {
    console.log('No processed tasks found');
    return 0;
  }
  
  console.log(`Found ${tasks.length} processed tasks`);
  
  const items = tasks.map(task => ({
    userId: task.user_id,
    sourceType: 'processed_task' as const,
    sourceId: task.id.toString(),
    content: formatProcessedTaskContent(task),
    metadata: {
      task_title: task.task_title,
      duration_minutes: task.duration_minutes,
      status: task.status,
      start_time: task.start_time,
    },
  }));
  
  console.log('🔄 Generating embeddings...');
  await embeddingService.batchStoreEmbeddings(items);
  
  return tasks.length;
}

/**
 * Generate embeddings for all subtasks of a user
 */
async function generateSubtaskEmbeddings(userId: string): Promise<number> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const embeddingService = new EmbeddingService(geminiApiKey, supabase);
  
  console.log('📝 Fetching subtasks...');
  
  const { data: subtasks, error } = await supabase
    .from('subtasks')
    .select('*')
    .eq('user_id', userId);
  
  if (error) {
    console.error('Error fetching subtasks:', error);
    return 0;
  }
  
  if (!subtasks || subtasks.length === 0) {
    console.log('No subtasks found');
    return 0;
  }
  
  console.log(`Found ${subtasks.length} subtasks`);
  
  const items = subtasks.map(subtask => ({
    userId: subtask.user_id,
    sourceType: 'subtask' as const,
    sourceId: subtask.id.toString(),
    content: formatSubtaskContent(subtask),
    metadata: {
      subtask_name: subtask.subtask_name,
      task_count: subtask.personalized_task_ids?.length || 0,
      created_at: subtask.created_at,
    },
  }));
  
  console.log('🔄 Generating embeddings...');
  await embeddingService.batchStoreEmbeddings(items);
  
  return subtasks.length;
}

/**
 * Generate embeddings for all major tasks of a user
 */
async function generateMajorTaskEmbeddings(userId: string): Promise<number> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const embeddingService = new EmbeddingService(geminiApiKey, supabase);
  
  console.log('📝 Fetching major tasks...');
  
  const { data: majorTasks, error } = await supabase
    .from('major_tasks')
    .select('*')
    .eq('user_id', userId);
  
  if (error) {
    console.error('Error fetching major tasks:', error);
    return 0;
  }
  
  if (!majorTasks || majorTasks.length === 0) {
    console.log('No major tasks found');
    return 0;
  }
  
  console.log(`Found ${majorTasks.length} major tasks`);
  
  const items = majorTasks.map(majorTask => ({
    userId: majorTask.user_id,
    sourceType: 'major_task' as const,
    sourceId: majorTask.id.toString(),
    content: formatMajorTaskContent(majorTask),
    metadata: {
      major_task_title: majorTask.major_task_title,
      subtask_count: majorTask.subtask_ids?.length || 0,
      created_at: majorTask.created_at,
      updated_at: majorTask.updated_at,
    },
  }));
  
  console.log('🔄 Generating embeddings...');
  await embeddingService.batchStoreEmbeddings(items);
  
  return majorTasks.length;
}

/**
 * Main function to generate all embeddings for a user
 */
async function generateAllEmbeddings(userId: string) {
  console.log(`\n🚀 Starting embedding generation for user: ${userId}\n`);
  
  const startTime = Date.now();
  
  try {
    let totalCount = 0;
    
    // Generate processed task embeddings
    console.log('\n--- PROCESSED TASKS ---');
    const taskCount = await generateProcessedTaskEmbeddings(userId);
    totalCount += taskCount;
    console.log(`✅ Generated ${taskCount} processed task embeddings\n`);
    
    // Generate subtask embeddings
    console.log('\n--- SUBTASKS ---');
    const subtaskCount = await generateSubtaskEmbeddings(userId);
    totalCount += subtaskCount;
    console.log(`✅ Generated ${subtaskCount} subtask embeddings\n`);
    
    // Generate major task embeddings
    console.log('\n--- MAJOR TASKS ---');
    const majorTaskCount = await generateMajorTaskEmbeddings(userId);
    totalCount += majorTaskCount;
    console.log(`✅ Generated ${majorTaskCount} major task embeddings\n`);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(50));
    console.log(`🎉 COMPLETE!`);
    console.log(`   Total embeddings: ${totalCount}`);
    console.log(`   Time taken: ${duration}s`);
    console.log('='.repeat(50) + '\n');
    
    // Show stats
    const supabase = createClient(supabaseUrl, supabaseKey);
    const embeddingService = new EmbeddingService(geminiApiKey, supabase);
    const stats = await embeddingService.getEmbeddingStats(userId);
    
    console.log('📊 Embedding Statistics:');
    console.log(`   Total: ${stats.total}`);
    Object.entries(stats.bySourceType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    
  } catch (error) {
    console.error('\n❌ Error generating embeddings:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const userId = process.argv[2];
  
  if (!userId) {
    console.error('Usage: ts-node generateEmbeddings.ts <user-id>');
    process.exit(1);
  }
  
  generateAllEmbeddings(userId)
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

export {
  generateAllEmbeddings,
  generateProcessedTaskEmbeddings,
  generateSubtaskEmbeddings,
  generateMajorTaskEmbeddings,
  formatProcessedTaskContent,
  formatSubtaskContent,
  formatMajorTaskContent,
}; 