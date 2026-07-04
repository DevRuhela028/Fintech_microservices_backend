import { Router } from 'express';
import { createWalletController, getWalletController } from '../controllers/walletController';
import { authenticate } from '../middleware/auth';
import { verifyUser } from '../middleware/verifyUser';

const router = Router();

router.use(authenticate);

router.post('/', verifyUser, createWalletController);
router.get('/:userId', getWalletController);

export default router;
