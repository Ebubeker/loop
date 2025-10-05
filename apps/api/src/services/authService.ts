import { supabase } from './database';

export class AuthService {
  static async createUserProfile(id: string, email: string, name: string, role?: string, orgId?: string) {
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

    // If org_id is provided, verify the organization exists
    if (orgId) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', orgId)
        .single();

      if (orgError || !org) {
        throw new Error('Invalid organization ID');
      }
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        id: id,
        name: name,
        role: role || 'user',
        org_id: orgId || null
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
        role: role || 'user',
        org_id: orgId || null
      }
    };
  }

  /**
   * Update user profile
   * @param userId - User ID to update
   * @param name - Updated name
   * @param role - Updated role
   * @param orgId - Updated organization ID
   * @returns Updated user profile result
   */
  static async updateUserProfile(userId: string, name?: string, role?: string, orgId?: string | null) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (!name && !role && orgId === undefined) {
      throw new Error('At least one field (name, role, or org_id) is required for update');
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['user', 'admin', 'manager'];
      if (!validRoles.includes(role)) {
        throw new Error('Invalid role. Must be one of: user, admin, manager');
      }
    }

    // If org_id is provided (and not null), verify the organization exists
    if (orgId) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', orgId)
        .single();

      if (orgError || !org) {
        throw new Error('Invalid organization ID');
      }
    }

    // Check if user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('user_profiles')
      .select('id, name, role, org_id')
      .eq('id', userId)
      .single();

    if (checkError || !existingUser) {
      throw new Error('User not found');
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (orgId !== undefined) updateData.org_id = orgId;

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      throw new Error('Failed to update user profile');
    }

    return {
      message: 'User profile updated successfully',
      user: data
    };
  }

  /**
   * Delete user profile
   * @param userId - User ID to delete
   * @returns Deletion result
   */
  static async deleteUserProfile(userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Check if user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('user_profiles')
      .select('id, name')
      .eq('id', userId)
      .single();

    if (checkError || !existingUser) {
      throw new Error('User not found');
    }

    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error('Error deleting user profile:', error);
      throw new Error('Failed to delete user profile');
    }

    return {
      message: 'User profile deleted successfully',
      deletedUser: {
        id: userId,
        name: existingUser.name
      }
    };
  }

  static async getUserProfile(userId: string) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error('Failed to get user profile');
    }

    return {
      success: true,
      user: data
    };
  }

  /**
   * Get all user profiles with optional organization filtering
   * @param orgIds - Optional array of organization IDs to filter by
   * @returns Array of user profiles
   */
  static async getAllUsers(orgIds: string | undefined) {
    try {
      let query = supabase
        .from('user_profiles')
        .select('id, name, role, org_id, created_at, updated_at')
        .order('created_at', { ascending: false });

      // Apply organization filter if provided

      console.log('👥 Getting all users' + (orgIds ? ` filtered by organizations: ${orgIds}` : ''));

      if (orgIds && orgIds.length > 0) {
        query = query.eq('org_id', orgIds);
      }

      const { data: users, error } = await query;

      if (error) {
        console.error('Error fetching users:', error);
        throw new Error('Failed to fetch users');
      }

      return {
        success: true,
        message: 'Users fetched successfully',
        users: users || [],
        count: users?.length || 0
      };

    } catch (error: any) {
      console.error('Get all users error:', error);
      throw error;
    }
  }
} 