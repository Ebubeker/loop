import { Router } from 'express';
import authRoutes from './authRoutes';
import activityRoutes from './activityRoutes';
import analysisRoutes from './analysisRoutes';
import tasksRoutes from './tasks';
import timeTrackingRoutes from './timeTrackingRoutes';
import chatbotRoutes from './chatbotRoutes';

const router: Router = Router();

// Main route groups
router.use('/api/auth', authRoutes);
router.use('/api/activity', activityRoutes);
router.use('/api/analysis', analysisRoutes);
router.use('/api/tasks', tasksRoutes);
router.use('/api/time-tracking', timeTrackingRoutes);
router.use('/api/chatbot', chatbotRoutes);

export default router; 