import { Router } from 'express';
import { AnalysisController } from '../controllers/analysisController';

const router: Router = Router();

// Sample data endpoint for testing (no database/AI required)
router.get('/sample', AnalysisController.getSampleData);

// Get user activities (raw data)
router.get('/:userId', AnalysisController.getWorkAnalysis);

// Generate 1-minute summary using AI (from now)
router.get('/:userId/summary', AnalysisController.getOneMinuteSummary);

// Generate 1-minute summary from last recorded activity
router.get('/:userId/last-summary', AnalysisController.getLastOneMinuteSummary);

export default router; 