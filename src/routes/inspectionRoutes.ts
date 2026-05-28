import { Router } from 'express';
import { createInspection, getInspections, submitInspection, followUpInspection } from '../controllers/inspectionController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.get('/', requireAuth, getInspections);
router.post(
  '/',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH, UserRole.PETUGAS_LAPANGAN),
  createInspection
);
router.post(
  '/:id/submit',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH, UserRole.PETUGAS_LAPANGAN),
  submitInspection
);
router.post(
  '/:id/follow-up',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  followUpInspection
);

export default router;
