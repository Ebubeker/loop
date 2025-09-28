import { Router } from 'express';
import { TimeTrackingController } from '../controllers/timeTrackingController';

const router: Router = Router();

// Time tracking session management
router.post('/session', TimeTrackingController.createSession);
router.put('/session/:sessionId', TimeTrackingController.updateSession);

// Statistics and history
router.get('/stats', TimeTrackingController.getAllStats);
router.get('/stats/:userId', TimeTrackingController.getStats);

router.get('/history/:userId', TimeTrackingController.getHistory);

// Additional helpful endpoint for active sessions
router.get('/active/:userId', TimeTrackingController.getActiveSessions);

export default router; 