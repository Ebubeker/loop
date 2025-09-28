import { Router } from 'express';
import { OrganizationController } from '../controllers/organizationController';

const router: Router = Router();

// Organization management routes
router.post('/', OrganizationController.createOrganization);
router.get('/', OrganizationController.getAllOrganizations);
router.get('/:organizationId', OrganizationController.getOrganizationById);
router.put('/:organizationId', OrganizationController.updateOrganization);

export default router; 