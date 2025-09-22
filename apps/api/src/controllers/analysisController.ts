import { Request, Response } from 'express';
import { GeminiService } from '../services/geminiService';

export class AnalysisController {
  static async getWorkAnalysis(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const timeRange = req.query.timeRange as string;

      // Validate userId parameter
      if (!userId) {
        return res.status(400).json({ 
          error: 'User ID is required',
          message: 'Please provide a valid user ID in the URL parameters' 
        });
      }

      // Get user activities
      console.log(`📊 Getting activities for user: ${userId}`);
      const result = await GeminiService.getUserActivities(userId, limit, timeRange);

      // Return the result
      res.json({
        success: result.success,
        user_id: userId,
        ...result,
        generated_at: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Get user activities error:', error);
      
      // Generic error response
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred while fetching user activities'
      });
    }
  }

  static async getOneMinuteSummary(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      // Validate userId parameter
      if (!userId) {
        return res.status(400).json({ 
          success: false,
          error: 'User ID is required',
          message: 'Please provide a valid user ID in the URL parameters' 
        });
      }

      // Check if Gemini is configured
      if (!GeminiService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Service unavailable',
          message: 'Gemini AI service is not configured. Please add GEMINI_API_KEY to environment variables.'
        });
      }

      // Generate 1-minute summary
      console.log(`🤖 Generating 1-minute summary for user: ${userId}`);
      const result = await GeminiService.generateOneMinuteSummary(userId);

      // Return the result
      res.json(result);

    } catch (error: any) {
      console.error('Generate 1-minute summary error:', error);
      
      // Generic error response
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred while generating the summary'
      });
    }
  }

  static async getLastOneMinuteSummary(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      // Validate userId parameter
      if (!userId) {
        return res.status(400).json({ 
          success: false,
          error: 'User ID is required',
          message: 'Please provide a valid user ID in the URL parameters' 
        });
      }

      // Check if Gemini is configured
      if (!GeminiService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Service unavailable',
          message: 'Gemini AI service is not configured. Please add GEMINI_API_KEY to environment variables.'
        });
      }

      // Generate 1-minute summary from last recorded activity
      console.log(`🤖 Generating last 1-minute summary for user: ${userId}`);
      const result = await GeminiService.generateLastOneMinuteSummary(userId);

      // Return the result
      res.json(result);

    } catch (error: any) {
      console.error('Generate last 1-minute summary error:', error);
      
      // Generic error response
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred while generating the last activity summary'
      });
    }
  }

  static async getSampleData(req: Request, res: Response) {
    try {
      // Check if Gemini is configured
      if (!GeminiService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Service unavailable',
          message: 'Gemini AI service is not configured. Please add GEMINI_API_KEY to environment variables.',
          note: 'This sample endpoint actually calls the AI service to demonstrate real functionality'
        });
      }

      console.log(`🧪 Testing AI with sample data...`);
      
      // Use the actual AI service with sample data
      const result = await GeminiService.generateSummaryWithSampleData();

      res.json({
        success: true,
        message: "Sample endpoint - using real AI with sample data",
        note: "This actually calls Gemini AI with sample activities to demonstrate real functionality",
        endpoints_info: {
          raw_activities: "GET /api/analysis/{userId} - Gets activities from database",
          one_minute_summary: "GET /api/analysis/{userId}/summary - Gets real activities + AI summary for 1 minute",
          last_one_minute_summary: "GET /api/analysis/{userId}/last-summary - Gets 1-minute summary from last recorded activity",
          sample_test: "GET /api/analysis/sample - This endpoint (real AI with sample data)"
        },
        ...result
      });

    } catch (error: any) {
      console.error('Sample data error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate sample AI summary',
        details: error.message
      });
    }
  }
} 