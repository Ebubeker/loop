import { Router } from 'express';
import { AuthController } from '../controllers/authController';

const router: Router = Router();

router.post('/create-account', AuthController.createAccount);

export default router; 