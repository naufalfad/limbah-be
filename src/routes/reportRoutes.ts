// src/routes/reportRoutes.ts
import { Router } from 'express';
import {
    submitReport,
    trackReport,
    getReports,
    verifyAndCreateInspection,
    rejectReport
} from '../controllers/reportController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { citizenReportUpload } from '../middlewares/upload'; // INJEKSI MIDDLEWARE BARU (Multipart Handler)
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
// 2. PROTECTED ROUTES (Admin DLH / Verifikator)
// ==========================================

// Endpoint untuk mengambil seluruh daftar laporan di Dashboard (Bisa pakai query ?status=PENDING)
router.get(
    '/admin',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
    getReports
);

// Endpoint eksekusi: Mengonversi laporan valid menjadi Surat Tugas (Inspection)
router.post(
    '/admin/:id/verify',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
    verifyAndCreateInspection
);

// Endpoint eksekusi: Menandai laporan sebagai hoax/spam
router.post(
    '/admin/:id/reject',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
    rejectReport
);

export default router;