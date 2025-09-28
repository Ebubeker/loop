import { Request, Response } from 'express';
import { OrganizationService } from '../services/organizationService';

export class OrganizationController {
  /**
   * POST /api/auth/organization
   * Create new organization
   */
  static async createOrganization(req: Request, res: Response) {
    try {
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Organization name is required'
        });
      }

      console.log(`🏢 Creating organization: ${name}`);

      const result = await OrganizationService.createOrganization(name, description);

      if (result.success) {
        res.status(201).json({
          success: true,
          organization: result.organization,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Create organization error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * GET /api/auth/organization
   * Get all organizations
   */
  static async getAllOrganizations(req: Request, res: Response) {
    try {
      console.log('🏢 Getting all organizations');

      const result = await OrganizationService.getAllOrganizations();

      if (result.success) {
        res.json({
          success: true,
          organizations: result.organizations,
          count: result.count
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Get all organizations error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * GET /api/auth/organization/:organizationId
   * Get organization by ID
   */
  static async getOrganizationById(req: Request, res: Response) {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          error: 'Organization ID is required'
        });
      }

      console.log(`🏢 Getting organization: ${organizationId}`);

      const result = await OrganizationService.getOrganizationById(organizationId);

      if (result.success) {
        res.json({
          success: true,
          organization: result.organization
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Get organization by ID error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * PUT /api/auth/organization/:organizationId
   * Update organization
   */
  static async updateOrganization(req: Request, res: Response) {
    try {
      const { organizationId } = req.params;
      const { name, description } = req.body;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          error: 'Organization ID is required'
        });
      }

      if (!name && !description) {
        return res.status(400).json({
          success: false,
          error: 'At least one field (name or description) is required for update'
        });
      }

      console.log(`🏢 Updating organization: ${organizationId}`);

      const result = await OrganizationService.updateOrganization(organizationId, name, description);

      if (result.success) {
        res.json({
          success: true,
          organization: result.organization,
          message: result.message
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error
        });
      }

    } catch (error: any) {
      console.error('Update organization error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
} 