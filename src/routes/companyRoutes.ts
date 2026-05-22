import { Router } from 'express';
import { createCompany, getCompanies, getCompanyById, updateCompanyStatus } from '../controllers/companyController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.post('/', requireAuth, createCompany);
router.get('/', requireAuth, getCompanies);
router.get('/:id', requireAuth, getCompanyById);
router.patch(
  '/:id/status',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  updateCompanyStatus
);

export default router;
