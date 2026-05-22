import { Router } from 'express';
import { createWasteLog, getWasteLogs, verifyWasteLog } from '../controllers/wasteController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.post('/', requireAuth, createWasteLog);
router.get('/', requireAuth, getWasteLogs);
router.patch(
  '/:id/verify',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  verifyWasteLog
);

export default router;
