import { Router } from 'express';
import { createCompany, getCompanies, getCompanyById, updateCompanyStatus, downloadCertificatePdf, createRetribusiInvoice, updateCompany, createManualAmdalCompany, getCompanyPreview } from '../controllers/companyController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { companyDocUpload } from '../middlewares/upload';
import { UserRole } from '@prisma/client';

const router = Router();

// POST /api/companies — uses Multer middleware before the controller
router.post('/', requireAuth, companyDocUpload, createCompany);
router.post(
  '/manual-amdal',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  createManualAmdalCompany
);
router.get('/', requireAuth, getCompanies);
router.get('/:id/preview', requireAuth, getCompanyPreview);
router.get('/:id', requireAuth, getCompanyById);
router.get('/:id/certificate/pdf', requireAuth, downloadCertificatePdf);
router.post('/:id/retribusi-invoice', requireAuth, createRetribusiInvoice);
router.put('/:id', requireAuth, companyDocUpload, updateCompany);
router.patch(
  '/:id/status',
  requireAuth,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
  updateCompanyStatus
);

export default router;
