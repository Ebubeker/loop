import { Router } from 'express';
import { ActivityController } from '../controllers/activityController';

const router: Router = Router();

// Current activity
router.get('/current', ActivityController.getCurrentActivity);
router.get('/detailed', ActivityController.getDetailedActivity);

// Activity monitoring endpoints (for the frontend /api/start call)
router.post('/monitoring/start', ActivityController.startActivityMonitoring);
router.post('/monitoring/stop', ActivityController.stopActivityMonitoring);
router.get('/monitoring/status/:userId', ActivityController.getActivityMonitoringStatus);
router.get('/monitoring/sessions', ActivityController.getAllActiveMonitoringSessions);

// Bucket information
router.get('/buckets', ActivityController.getAllBucketTypes);
router.get('/web', ActivityController.getWebActivity);
router.get('/apps', ActivityController.getAppsCategories);
router.get('/recent', ActivityController.getRecentEvents);

// Raw activities
router.get('/raw', ActivityController.getRawActivities);

// Task processing endpoints
router.post('/process/:userId', ActivityController.processUserTasks);
router.get('/status/:userId', ActivityController.getCurrentTaskStatus);
router.get('/tasks/:userId', ActivityController.getProcessedTasks);

// Task processing worker endpoints
router.post('/worker/start', ActivityController.startTaskWorker);
router.post('/worker/stop', ActivityController.stopTaskWorker);
router.get('/worker/status', ActivityController.getTaskWorkerStatus);
router.post('/worker/add/:userId', ActivityController.addUserToWorker);

export default router; 