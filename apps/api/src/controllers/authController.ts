import { Request, Response } from 'express';
import { AuthService } from '../services/authService';

export class AuthController {
  static async createAccount(req: Request, res: Response) {
    try {
      const { id, email, name, role } = req.body;

      const result = await AuthService.createUserProfile(id, email, name, role);
      
      res.status(201).json(result);

    } catch (error: any) {
      console.error('Create account error:', error);
      
      if (error.message === 'User profile already exists') {
        return res.status(409).json({ error: error.message });
      }
      
      if (error.message.includes('Missing required fields') || 
          error.message.includes('Invalid email format') || 
          error.message.includes('Invalid role')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Internal server error' });
    }
  }
} 