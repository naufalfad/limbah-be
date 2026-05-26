import { Router } from 'express';
import {
  createUser,
  getTransporters,
  getAllUsers,
  updateUserRole
} from '../controllers/adminController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

// Membuat User Baru (Tersedia untuk Super Admin & Admin DLH)
router.post(
  '/users',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  createUser
);

// Mengambil Data Transporter (Tersedia untuk Super Admin & Admin DLH)
router.get(
  '/transporters',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  getTransporters
);

// FUNGSI BARU: Mengambil Semua Data Pengguna (STRICT: Hanya Super Admin)
router.get(
  '/users',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN),
  getAllUsers
);

// FUNGSI BARU: Mengubah Hak Akses/Role Pengguna (STRICT: Hanya Super Admin)
router.patch(
  '/users/:id/role',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN),
  updateUserRole
);

export default router;