import { Router } from 'express';
import authRoutes from './authRoutes';
import activityRoutes from './activityRoutes';
import analysisRoutes from './analysisRoutes';
import { ActivityController } from '../controllers/activityController';

const router: Router = Router();

// Direct activity monitoring routes for frontend compatibility
router.post('/api/start', ActivityController.startActivityMonitoring);
router.post('/api/stop', ActivityController.stopActivityMonitoring);

// Main route groups
router.use('/api/auth', authRoutes);
router.use('/api/activity', activityRoutes);
router.use('/api/analysis', analysisRoutes);

export default router; 