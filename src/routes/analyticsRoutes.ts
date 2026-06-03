import { Router } from 'express';
import {
    getExecutiveAnalytics,
    getPerformanceAnalytics,
    getAqiTelemetry,
    getBatchAqiTelemetry // IMPOR BARU: Kontroler penarik data batch telemetri kualitas udara
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

// Rute Baru: Mengambil data batch telemetri kualitas udara untuk seluruh 7 klaster industri Kabupaten Bogor.
// Diproteksi oleh requireAuth agar penggunaan API key hemat, aman dari kebocoran, dan terisolasi untuk internal sistem.
router.get(
    '/aqi-batch',
    requireAuth,
    getBatchAqiTelemetry
);

export default router;