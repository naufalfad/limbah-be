import { Router } from 'express';
import { getExecutiveAnalytics, getPerformanceAnalytics } from '../controllers/analyticsController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

// Rute Eksekutif 1: KPI atas, Tren Limbah B3, & Sebaran Kepatuhan Spasial
router.get(
    '/executive',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.AUDITOR),
    getExecutiveAnalytics
);

// Rute Eksekutif 2: Kinerja DLH, Bottleneck Pengawasan, & Riwayat Inspeksi Selesai
router.get(
    '/performance',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.AUDITOR),
    getPerformanceAnalytics
);

export default router;