import { Router } from 'express';
import { getProfile, updateKyc } from '../controllers/userController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/:id', getProfile);
router.patch('/:id/kyc', updateKyc);

export default router;
