import { Router } from 'express';
import { createInspection, getInspections, submitInspection } from '../controllers/inspectionController';
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

export default router;
