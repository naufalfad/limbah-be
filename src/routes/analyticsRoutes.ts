import { Router } from 'express';
import {
    getExecutiveAnalytics,
    getPerformanceAnalytics,
    getAqiTelemetry // IMPOR BARU: Kontroler penarik data telemetri kualitas udara
} from '../controllers/analyticsController';
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

// Rute Baru: Mengambil telemetri kualitas udara & cuaca real-time berdasarkan koordinat GIS.
// Diproteksi oleh requireAuth agar API key aman dan data hanya dapat dikonsumsi oleh pengguna sistem yang sah.
router.get(
    '/aqi',
    requireAuth,
    getAqiTelemetry
);

export default router;