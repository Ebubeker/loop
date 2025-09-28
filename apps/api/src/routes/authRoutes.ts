import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import organizationRoutes from './organizationRoutes';

const router: Router = Router();

// User account management
router.post('/create-account', AuthController.createAccount);
router.put('/user/:userId', AuthController.updateAccount);
router.delete('/user/:userId', AuthController.deleteAccount);

// Organization routes
router.use('/organization', organizationRoutes);

export default router; 