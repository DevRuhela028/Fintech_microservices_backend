import { Router } from 'express';
import { 
  createTransaction, 
  getTransaction, 
  refundTransaction, 
  updateTransactionStatus 
} from '../controllers/transactionController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Internal route for status updates, no JWT required, handled by X-Internal-Secret inside controller
router.patch('/:id/status', updateTransactionStatus);

// All other routes require JWT
router.use(authenticate);

router.post('/', createTransaction);
router.get('/:id', getTransaction);
router.post('/:id/refund', refundTransaction);

export default router;
