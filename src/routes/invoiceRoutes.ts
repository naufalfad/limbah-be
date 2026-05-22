import { Router } from 'express';
import { getInvoices, payInvoice } from '../controllers/pickupController';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.get('/', requireAuth, getInvoices);
router.post('/:id/pay', requireAuth, payInvoice);

export default router;
