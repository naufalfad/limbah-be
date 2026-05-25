import { Router } from 'express';
import { createPickup, getPickups, pricePickup, updatePickupStatus, assignTransporter } from '../controllers/pickupController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.post('/', requireAuth, createPickup);
router.get('/', requireAuth, getPickups);
router.post(
  '/:id/price',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH, UserRole.PENGANGKUT),
  pricePickup
);
router.patch(
  '/:id/status',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH, UserRole.PENGANGKUT),
  updatePickupStatus
);
router.patch(
  '/:id/assign',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  assignTransporter
);

export default router;
