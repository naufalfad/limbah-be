import { Router } from 'express';
import { createUser } from '../controllers/adminController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.post(
  '/users',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  createUser
);

export default router;
