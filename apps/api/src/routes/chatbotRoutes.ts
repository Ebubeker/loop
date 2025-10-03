import { Router } from 'express';
import { ChatbotController } from '../controllers/chatbotController';

const router: Router = Router();

// Chat endpoints
router.post('/chat', ChatbotController.chat);
router.post('/search', ChatbotController.searchSimilar);

// Summaries and insights
router.get('/summary/:userId', ChatbotController.getActivitySummary);
router.get('/insights/:userId', ChatbotController.getProductivityInsights);

// Chat history
router.get('/history/:userId', ChatbotController.getHistory);
router.delete('/history/:userId', ChatbotController.clearHistory);

// Suggestions
router.get('/suggestions/:userId', ChatbotController.getSuggestedQuestions);

// Embeddings management
router.post('/embeddings', ChatbotController.storeEmbedding);
router.post('/embeddings/batch', ChatbotController.batchStoreEmbeddings);
router.get('/embeddings/stats/:userId', ChatbotController.getEmbeddingStats);

export default router; 