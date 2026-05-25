import { Router } from 'express';
import { createUser, getTransporters } from '../controllers/adminController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.post(
  '/users',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  createUser
);

router.get(
  '/transporters',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  getTransporters
);

export default router;
