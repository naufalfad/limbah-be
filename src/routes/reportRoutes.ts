// src/routes/reportRoutes.ts
import { Router } from 'express';
import {
    submitReport,
    trackReport,
    getReports,
    // verifyAndCreateInspection & startInvestigation DIHAPUS karena modul di-decouple [3]
    rejectReport
} from '../controllers/reportController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { citizenReportUpload } from '../middlewares/upload';
import { UserRole } from '@prisma/client';

const router = Router();

// ==========================================
// 1. PUBLIC ROUTES (Masyarakat Tanpa Login)
// ==========================================

// Endpoint untuk warga mengirimkan laporan (DILENGKAPI HANDLING MULTIPART FILE UPLOAD)
router.post('/public/submit', citizenReportUpload, submitReport);

// Endpoint untuk warga melacak status via Tracking ID
router.get('/public/track/:trackingId', trackReport);


// ==========================================
// 2. PROTECTED ROUTES (Admin DLH / Super Admin)
// ==========================================

// Endpoint untuk mengambil daftar laporan spasial (Arsip Statis)
// HAK AKSES DIPERKETAT: Hanya untuk Super Admin dan Admin DLH [3]
router.get(
    '/admin',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
    getReports
);

// =========================================================================
// DEPRECATED & REMOVED ROUTES (FASE 1 DECOUPLING):
// 
// Rute konversi aduan menjadi Surat Tugas (verify) dan inisiasi investigasi
// patroli (investigate) dihapus total demi integritas core system [3].
// =========================================================================

/*
router.post(
    '/admin/:id/verify',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
    verifyAndCreateInspection
);

router.patch(
    '/admin/:id/investigate',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH, UserRole.PETUGAS_LAPANGAN),
    startInvestigation
);
*/

// Endpoint eksekusi: Menandai laporan arsip sebagai hoax/spam
router.post(
    '/admin/:id/reject',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
    rejectReport
);

export default router;