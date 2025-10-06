import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import ChatbotService from '../services/chatbotService';
import EmbeddingService from '../services/embeddingService';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

export class ChatbotController {
  /**
   * Chat with the AI assistant
   * POST /api/chatbot/chat
   */
  static async chat(req: Request, res: Response): Promise<void> {
    try {
      const { message, userId, options } = req.body;

      if (!message || !userId) {
        res.status(400).json({ error: 'Message and userId are required' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const chatbot = new ChatbotService(geminiApiKey, supabase);

      // Use smarter default options if not provided
      const smartOptions = {
        includeHistory: true,
        contextLimit: 15,
        contextThreshold: 0.4, // Lower threshold for better results
        ...options
      };

      const response = await chatbot.chat(message, userId, smartOptions);

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error('Error in chat:', error);
      res.status(500).json({ 
        error: 'Failed to process chat message',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get activity summary
   * GET /api/chatbot/summary/:userId
   */
  static async getActivitySummary(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { timeframe = 'today' } = req.query;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      if (!['today', 'week', 'month'].includes(timeframe as string)) {
        res.status(400).json({ error: 'Invalid timeframe. Must be: today, week, or month' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const chatbot = new ChatbotService(geminiApiKey, supabase);

      const summary = await chatbot.getActivitySummary(
        userId, 
        timeframe as 'today' | 'week' | 'month'
      );

      res.json({
        success: true,
        data: {
          summary,
          timeframe,
          generated_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error getting activity summary:', error);
      res.status(500).json({ 
        error: 'Failed to get activity summary',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get productivity insights
   * GET /api/chatbot/insights/:userId
   */
  static async getProductivityInsights(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const chatbot = new ChatbotService(geminiApiKey, supabase);

      const insights = await chatbot.getProductivityInsights(userId);

      res.json({
        success: true,
        data: {
          insights,
          generated_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error getting productivity insights:', error);
      res.status(500).json({ 
        error: 'Failed to get productivity insights',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get chat history
   * GET /api/chatbot/history/:userId
   */
  static async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { limit = 20 } = req.query;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const chatbot = new ChatbotService(geminiApiKey, supabase);

      const history = await chatbot.getHistory(userId, Number(limit));

      res.json({
        success: true,
        data: {
          history,
          count: history.length,
        },
      });
    } catch (error) {
      console.error('Error getting chat history:', error);
      res.status(500).json({ 
        error: 'Failed to get chat history',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Clear chat history
   * DELETE /api/chatbot/history/:userId
   */
  static async clearHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const chatbot = new ChatbotService(geminiApiKey, supabase);

      await chatbot.clearHistory(userId);

      res.json({
        success: true,
        message: 'Chat history cleared successfully',
      });
    } catch (error) {
      console.error('Error clearing chat history:', error);
      res.status(500).json({ 
        error: 'Failed to clear chat history',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get suggested questions
   * GET /api/chatbot/suggestions/:userId
   */
  static async getSuggestedQuestions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const chatbot = new ChatbotService(geminiApiKey, supabase);

      const suggestions = await chatbot.getSuggestedQuestions(userId);

      res.json({
        success: true,
        data: {
          suggestions,
        },
      });
    } catch (error) {
      console.error('Error getting suggested questions:', error);
      res.status(500).json({ 
        error: 'Failed to get suggested questions',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Store embeddings for data
   * POST /api/chatbot/embeddings
   */
  static async storeEmbedding(req: Request, res: Response): Promise<void> {
    try {
      const { userId, sourceType, sourceId, content, metadata } = req.body;

      if (!userId || !sourceType || !sourceId || !content) {
        res.status(400).json({ 
          error: 'userId, sourceType, sourceId, and content are required' 
        });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const embeddingService = new EmbeddingService(geminiApiKey, supabase);

      await embeddingService.storeEmbedding({
        userId,
        sourceType,
        sourceId,
        content,
        metadata,
      });

      res.json({
        success: true,
        message: 'Embedding stored successfully',
      });
    } catch (error) {
      console.error('Error storing embedding:', error);
      res.status(500).json({ 
        error: 'Failed to store embedding',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Batch store embeddings
   * POST /api/chatbot/embeddings/batch
   */
  static async batchStoreEmbeddings(req: Request, res: Response): Promise<void> {
    try {
      const { items } = req.body;

      if (!items || !Array.isArray(items)) {
        res.status(400).json({ error: 'items array is required' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const embeddingService = new EmbeddingService(geminiApiKey, supabase);

      await embeddingService.batchStoreEmbeddings(items);

      res.json({
        success: true,
        message: `Successfully processed ${items.length} embeddings`,
        count: items.length,
      });
    } catch (error) {
      console.error('Error batch storing embeddings:', error);
      res.status(500).json({ 
        error: 'Failed to batch store embeddings',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get embedding statistics
   * GET /api/chatbot/embeddings/stats/:userId
   */
  static async getEmbeddingStats(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const embeddingService = new EmbeddingService(geminiApiKey, supabase);

      const stats = await embeddingService.getEmbeddingStats(userId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Error getting embedding stats:', error);
      res.status(500).json({ 
        error: 'Failed to get embedding stats',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Search similar activities
   * POST /api/chatbot/search
   */
  static async searchSimilar(req: Request, res: Response): Promise<void> {
    try {
      const { query, userId, options } = req.body;

      if (!query || !userId) {
        res.status(400).json({ error: 'query and userId are required' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const embeddingService = new EmbeddingService(geminiApiKey, supabase);

      const results = await embeddingService.searchSimilar(query, userId, options);

      res.json({
        success: true,
        data: {
          results,
          count: results.length,
        },
      });
    } catch (error) {
      console.error('Error searching similar activities:', error);
      res.status(500).json({ 
        error: 'Failed to search similar activities',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default ChatbotController; 