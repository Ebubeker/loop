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
  
  console.log('\n📝 Manual Activity Tracking:');
  console.log('   - Add activity: POST /api/activity/add');
  console.log('   - Get activities: GET /api/activity/raw');
  console.log('   - Get consolidated: GET /api/activity/consolidated');
  console.log('');
}); 