import { Router } from 'express';
import { ActivityController } from '../controllers/activityController';

const router: Router = Router();

// NEW: Add activity manually
router.post('/add', ActivityController.addActivity);

// Raw activities from database
router.get('/raw', ActivityController.getRawActivities);
router.get('/consolidated', ActivityController.getConsolidatedActivities);

// Task processing endpoints
router.post('/addProcessedTask', ActivityController.addProcessedTask);
router.post('/process/:userId', ActivityController.processUserTasks);
router.get('/status/:userId', ActivityController.getCurrentTaskStatus);
router.get('/tasks/:userId', ActivityController.getProcessedTasks);
router.post('/check-inactive/:userId', ActivityController.checkInactiveTasks);

// Task processing worker endpoints
router.post('/worker/start', ActivityController.startTaskWorker);
router.post('/worker/stop', ActivityController.stopTaskWorker);
router.get('/worker/status', ActivityController.getTaskWorkerStatus);
router.post('/worker/add/:userId', ActivityController.addUserToWorker);

export default router; 