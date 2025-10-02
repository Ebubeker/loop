import { Router } from 'express';
import { ActivityController } from '../controllers/activityController';

const router: Router = Router();

// Add activity (buffers in memory, auto-classifies at 20 activities)
router.post('/add', ActivityController.addActivity);

// Raw activities from database
router.get('/raw', ActivityController.getRawActivities);
router.get('/consolidated', ActivityController.getConsolidatedActivities);

// Task processing endpoints
router.post('/addProcessedTask', ActivityController.addProcessedTask);
router.post('/process/:userId', ActivityController.processUserTasks);
router.get('/status/:userId', ActivityController.getCurrentTaskStatus);
router.get('/tasks/:userId', ActivityController.getProcessedTasks);
router.get('/no-focus/:userId', ActivityController.getNoFocusTasks);
router.post('/check-inactive/:userId', ActivityController.checkInactiveTasks);

// Task processing worker endpoints
router.post('/worker/start', ActivityController.startTaskWorker);
router.post('/worker/stop', ActivityController.stopTaskWorker);
router.get('/worker/status', ActivityController.getTaskWorkerStatus);
router.post('/worker/add/:userId', ActivityController.addUserToWorker);

// Subtask management endpoints
router.get('/subtasks/:userId', ActivityController.getSubtasks);
router.post('/subtasks/classify/:userId', ActivityController.forceSubtaskClassification);

// Major Task management endpoints
router.get('/major-tasks/:userId', ActivityController.getMajorTasks);
router.post('/major-tasks/classify/:userId', ActivityController.forceMajorTaskClassification);

// Chat/LLM endpoints (RAG-based Q&A)
router.post('/chat/ask/:userId', ActivityController.askQuestion);
router.get('/chat/history/:userId', ActivityController.getChatHistory);
router.delete('/chat/history/:userId', ActivityController.clearChatHistory);
router.get('/chat/suggestions/:userId', ActivityController.getSuggestedQuestions);
router.post('/chat/embeddings/generate/:userId', ActivityController.generateEmbeddings);

export default router; 