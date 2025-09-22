import { supabase } from './database';

export class AuthService {
  static async createUserProfile(id: string, email: string, name: string, role?: string) {
    if (!id || !email || !name) {
      throw new Error('Missing required fields: id, email, and name are required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    const validRoles = ['user', 'admin', 'manager'];
    if (role && !validRoles.includes(role)) {
      throw new Error('Invalid role. Must be one of: user, admin, manager');
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        id: id,
        name: name,
        role: role || 'user'
      });

    if (error) {
      console.error('Error creating user profile:', error);
      
      if (error.code === '23505') {
        throw new Error('User profile already exists');
      }
      
      throw new Error('Failed to create user profile');
    }

    return {
      message: 'User profile created successfully',
      user: {
        id: id,
        email: email,
        name: name,
        role: role || 'user'
      }
    };
  }
} 