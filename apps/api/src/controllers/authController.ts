import { Request, Response } from 'express';
import { AuthService } from '../services/authService';

export class AuthController {
  /**
   * GET /api/auth/users
   * Get all users with optional organization filtering
   */
  static async getAllUsers(req: Request, res: Response) {
    try {
      // Get org_ids from query parameters
      // Supports: ?org_ids=id1,id2,id3 or ?org_ids[]=id1&org_ids[]=id2
      const { org_ids } = req.query;

      console.log(org_ids);

      const result = await AuthService.getAllUsers(org_ids as string);
      
      res.json(result);

    } catch (error: any) {
      console.error('Get all users error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  static async getUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const result = await AuthService.getUserProfile(userId);
      res.json(result);
    } catch (error: any) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async createAccount(req: Request, res: Response) {
    try {
      const { id, email, name, role, org_id } = req.body;

      const result = await AuthService.createUserProfile(id, email, name, role, org_id);
      
      res.status(201).json(result);

    } catch (error: any) {
      console.error('Create account error:', error);
      
      if (error.message === 'User profile already exists') {
        return res.status(409).json({ error: error.message });
      }
      
      if (error.message.includes('Missing required fields') || 
          error.message.includes('Invalid email format') || 
          error.message.includes('Invalid role') ||
          error.message.includes('Invalid organization ID')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * PUT /api/auth/user/:userId
   * Update user account
   */
  static async updateAccount(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { name, role, org_id } = req.body;

      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }

      console.log(`👤 Updating user account: ${userId}`);

      const result = await AuthService.updateUserProfile(userId, name, role, org_id);
      
      res.json({
        success: true,
        ...result
      });

    } catch (error: any) {
      console.error('Update account error:', error);
      
      if (error.message === 'User not found') {
        return res.status(404).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      if (error.message.includes('At least one field') || 
          error.message.includes('Invalid role') ||
          error.message.includes('Invalid organization ID') ||
          error.message.includes('User ID is required')) {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }

  /**
   * DELETE /api/auth/user/:userId
   * Delete user account
   */
  static async deleteAccount(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }

      console.log(`🗑️ Deleting user account: ${userId}`);

      const result = await AuthService.deleteUserProfile(userId);
      
      res.json({
        success: true,
        ...result
      });

    } catch (error: any) {
      console.error('Delete account error:', error);
      
      if (error.message === 'User not found') {
        return res.status(404).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      if (error.message.includes('User ID is required')) {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
} 