// src/routes/analyticsRoutes.ts
import { Router } from 'express';
import {
    getExecutiveAnalytics,
    getPerformanceAnalytics,
    getAqiTelemetry,
    getBatchAqiTelemetry, // IMPOR BARU: Kontroler penarik data batch telemetri kualitas udara
    getWaterStations,     // [NEW IMPOR] Kontroler penarik stasiun kualitas air sungai
    getWaterStationLogs   // [NEW IMPOR] Kontroler penarik log historis stasiun air
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

// ============================================================================
// [NEW ROUTES] API ENDPOINTS KEPATUHAN LIMBAH AIR SUNGAI (PHASE 1)
// ============================================================================

// Mengambil seluruh stasiun air Bogor lengkap dengan payload koordinat WGS84 ter-parsing desimal
router.get(
    '/water-stations',
    requireAuth,
    getWaterStations
);

// Mengambil log historis parameter air 12 bulan dari satu stasiun air spesifik
router.get(
    '/water-stations/:id/logs',
    requireAuth,
    getWaterStationLogs
);

export default router;