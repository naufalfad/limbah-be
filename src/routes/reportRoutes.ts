// src/routes/reportRoutes.ts
import { Router } from 'express';
import {
    submitReport,
    trackReport,
    getReports,
    verifyAndCreateInspection,
    startInvestigation,
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
// 2. PROTECTED ROUTES (Admin DLH / Verifikator / Petugas Lapangan / Auditor)
// ==========================================

// Endpoint untuk mengambil daftar laporan spasial
// PERUBAHAN ARSITEKTUR: Membuka gembok otorisasi rute spasial untuk Petugas & Auditor [3]
router.get(
    '/admin',
    requireAuth,
    // INJEKSI: Memasukkan PETUGAS_LAPANGAN & AUDITOR agar tidak ditolak dengan 403 Forbidden [3]
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH, UserRole.PETUGAS_LAPANGAN, UserRole.AUDITOR),
    getReports
);

// Endpoint eksekusi: Mengonversi laporan valid menjadi Surat Tugas (Inspection)
router.post(
    '/admin/:id/verify',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
    verifyAndCreateInspection
);

// Endpoint eksekusi transisi status investigasi (INVESTIGATING)
router.patch(
    '/admin/:id/investigate',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH, UserRole.PETUGAS_LAPANGAN),
    startInvestigation
);

// Endpoint eksekusi: Menandai laporan sebagai hoax/spam
router.post(
    '/admin/:id/reject',
    requireAuth,
    requireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN_DLH),
    rejectReport
);

export default router;