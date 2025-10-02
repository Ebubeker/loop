import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { TaskProcessingWorker } from './services/taskProcessingWorker';

dotenv.config({ path: '../../.env' });

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(routes);

// Start task processing worker if enabled
if (process.env.AUTO_START_TASK_PROCESSING === 'true') {
  console.log('🤖 Auto-starting Task Processing Worker...');
  setTimeout(() => {
    try {
      TaskProcessingWorker.start();
    } catch (error) {
      console.error('Failed to start Task Processing Worker:', error);
    }
  }, 3000); // Wait 3 seconds for server to be ready
}

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📊 Supabase connected: ${process.env.SUPABASE_URL ? 'Yes' : 'No'}`);
  console.log(`🤖 Gemini AI configured: ${process.env.GEMINI_API_KEY ? 'Yes' : 'No'}`);
  
  console.log('\n🎯 Task Processing Worker Management:');
  console.log(`   - Auto-start: ${process.env.AUTO_START_TASK_PROCESSING === 'true' ? 'Enabled' : 'Disabled'}`);
  console.log(`   - Manual control: POST /api/activity/worker/start|stop`);
  console.log(`   - Status check: GET /api/activity/worker/status`);
  console.log(`   - Process user: POST /api/activity/process/{userId}`);
  
  console.log('\n📝 Activity Tracking:');
  console.log('   - Add activity: POST /api/activity/add');
  console.log('   - Note: Auto-classifies to tasks after 20 activities');
  console.log('');
  console.log('📊 Personalized Tasks (Clusters):');
  console.log('   - Get tasks: GET /api/activity/tasks/:userId');
  console.log('');
  console.log('🧩 Subtasks (Work Streams):');
  console.log('   - Get subtasks: GET /api/activity/subtasks/:userId');
  console.log('   - Force classify: POST /api/activity/subtasks/classify/:userId');
  console.log('   - Note: Auto-groups tasks into subtasks (4+ tasks needed)');
  console.log('');
  console.log('🏗️ Major Tasks (Projects):');
  console.log('   - Get major tasks: GET /api/activity/major-tasks/:userId');
  console.log('   - Force classify: POST /api/activity/major-tasks/classify/:userId');
  console.log('   - Note: Triggered on new subtasks or after 10 subtask updates');
  console.log('');
  console.log('💬 Chat LLM (Ask Questions About Your Work):');
  console.log('   - Ask question: POST /api/activity/chat/ask/:userId');
  console.log('   - Get history: GET /api/activity/chat/history/:userId');
  console.log('   - Get suggestions: GET /api/activity/chat/suggestions/:userId');
  console.log('   - Generate embeddings: POST /api/activity/chat/embeddings/generate/:userId');
  console.log('   - Note: Uses RAG with pgvector for semantic search');
  console.log('');
}); 