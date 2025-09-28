import { supabase } from './database';

interface Organization {
  id?: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export class OrganizationService {
  /**
   * Create a new organization
   * @param name - Organization name
   * @param description - Organization description
   * @returns Created organization
   */
  static async createOrganization(name: string, description?: string): Promise<any> {
    try {
      if (!name) {
        return {
          success: false,
          error: 'Organization name is required'
        };
      }

      // Check if organization name already exists
      const { data: existing, error: checkError } = await supabase
        .from('organizations')
        .select('name')
        .eq('name', name)
        .single();

      if (existing) {
        return {
          success: false,
          error: 'Organization name already exists'
        };
      }

      const { data, error } = await supabase
        .from('organizations')
        .insert({
          name: name,
          description: description,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error creating organization:', error);
        return {
          success: false,
          error: 'Failed to create organization'
        };
      }

      console.log(`✅ Created organization: ${data.name} (ID: ${data.id})`);

      return {
        success: true,
        organization: data,
        message: 'Organization created successfully'
      };

    } catch (error: any) {
      console.error('Create organization error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }

  /**
   * Get all organizations
   * @returns Array of organizations
   */
  static async getAllOrganizations(): Promise<any> {
    try {
      const { data: organizations, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching organizations:', error);
        return {
          success: false,
          error: 'Failed to fetch organizations'
        };
      }

      return {
        success: true,
        organizations: organizations || [],
        count: organizations?.length || 0
      };

    } catch (error: any) {
      console.error('Get all organizations error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }

  /**
   * Get organization by ID
   * @param organizationId - Organization ID
   * @returns Organization details
   */
  static async getOrganizationById(organizationId: string): Promise<any> {
    try {
      if (!organizationId) {
        return {
          success: false,
          error: 'Organization ID is required'
        };
      }

      const { data: organization, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (error) {
        console.error('Error fetching organization:', error);
        return {
          success: false,
          error: 'Organization not found'
        };
      }

      return {
        success: true,
        organization: organization
      };

    } catch (error: any) {
      console.error('Get organization by ID error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }

  /**
   * Update organization
   * @param organizationId - Organization ID
   * @param name - Updated name
   * @param description - Updated description
   * @returns Updated organization
   */
  static async updateOrganization(organizationId: string, name?: string, description?: string): Promise<any> {
    try {
      if (!organizationId) {
        return {
          success: false,
          error: 'Organization ID is required'
        };
      }

      if (!name && !description) {
        return {
          success: false,
          error: 'At least one field (name or description) is required for update'
        };
      }

      // Check if organization exists
      const { data: existing, error: checkError } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', organizationId)
        .single();

      if (checkError || !existing) {
        return {
          success: false,
          error: 'Organization not found'
        };
      }

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      const { data, error } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('id', organizationId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating organization:', error);
        return {
          success: false,
          error: 'Failed to update organization'
        };
      }

      console.log(`✅ Updated organization: ${data.name} (ID: ${data.id})`);

      return {
        success: true,
        organization: data,
        message: 'Organization updated successfully'
      };

    } catch (error: any) {
      console.error('Update organization error:', error);
      return {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }
} 