import { Router } from 'express';
import authRoutes from './authRoutes';
import activityRoutes from './activityRoutes';
import analysisRoutes from './analysisRoutes';

const router: Router = Router();

// Main route groups
router.use('/api/auth', authRoutes);
router.use('/api/activity', activityRoutes);
router.use('/api/analysis', analysisRoutes);

export default router; 