// src/controllers/reportController.ts
import { Request, Response } from 'express';
import { PrismaClient, ReportStatus, UserRole } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Helper: Generator ID Pelacakan Unik (Frictionless UX)
 * Format: RPT-YYYYMMDD-XXXX (contoh: RPT-20260526-A8F2)
 */
const generateTrackingId = (): string => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `RPT-${date}-${randomStr}`;
};

/**
 * [PUBLIC] Submit Laporan Baru
 * GRASP: Creator (Menginstansiasi objek CitizenReport baru)
 */
export const submitReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { incidentType, description, lat, lng, reporterName, reporterContact } = req.body;

        // Membaca array file biner yang diunggah via Multer (Pilihan B)
        const files = req.files as Express.Multer.File[] | undefined;

        // 1. Validasi Payload Teks Inti
        if (!incidentType || !description || !lat || !lng) {
            res.status(400).json({
                success: false,
                message: 'Data wajib (klasifikasi insiden, deskripsi, lokasi) tidak lengkap.'
            });
            return;
        }

        // 2. Validasi File Bukti Visual (Anti-Hoax Layer)
        if (!files || files.length === 0) {
            res.status(400).json({
                success: false,
                message: 'Bukti visual kejadian (minimal 1 foto) wajib diunggah.'
            });
            return;
        }

        // 3. Pemetaan Path File Penyimpanan Biner & Serialisasi ke JSON Array
        const photoPaths = files.map(file => `/uploads/reports/${file.filename}`);
        const evidencePhotoJson = JSON.stringify(photoPaths);

        let trackingId = generateTrackingId();
        let isUnique = false;

        // Pastikan trackingId benar-benar unik di database
        while (!isUnique) {
            const existing = await prisma.citizenReport.findUnique({ where: { trackingId } });
            if (!existing) {
                isUnique = true;
            } else {
                trackingId = generateTrackingId();
            }
        }

        const report = await prisma.citizenReport.create({
            data: {
                trackingId,
                incidentType,
                description,
                lat: String(lat),
                lng: String(lng),
                evidencePhoto: evidencePhotoJson, // Menyimpan string JSON array path foto
                reporterName: reporterName || null,
                reporterContact: reporterContact || null,
                status: ReportStatus.PENDING,
            }
        });

        res.status(201).json({
            success: true,
            message: 'Laporan berhasil disubmit.',
            data: { trackingId: report.trackingId }
        });
    } catch (error: any) {
        console.error('Error in submitReport:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
};

/**
 * [PUBLIC] Lacak Status Laporan
 * GRASP: Information Expert (Mengambil data spesifik tanpa mengekspos ID internal)
 */
export const trackReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { trackingId } = req.params;

        const report = await prisma.citizenReport.findUnique({
            where: { trackingId },
            select: {
                trackingId: true,
                incidentType: true,
                description: true,
                status: true,
                adminNotes: true,
                evidencePhoto: true,
                lat: true,
                lng: true,
                createdAt: true,
            }
        });

        if (!report) {
            res.status(404).json({ success: false, message: 'Laporan dengan Tracking ID tersebut tidak ditemukan.' });
            return;
        }

        res.status(200).json({ success: true, data: report });
    } catch (error: any) {
        console.error('Error in trackReport:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
};

/**
 * [PROTECTED: ADMIN / OFFICER / AUDITOR] Ambil Semua Laporan Spasial
 * PERUBAHAN ARSITEKTURAL: Data Isolation via Switch-Case [3]
 */
export const getReports = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const { status } = req.query;
        let filter: any = {};

        // Dasar filter: status dinamis dari query parameter (jika ada)
        if (status) {
            filter.status = status as ReportStatus;
        }

        // ISOLASI DATA BERBASIS PERAN (Information Expert) [3]
        switch (req.user.role) {
            case UserRole.PETUGAS_LAPANGAN:
                // FASE 1: Perbaikan Filter Otorisasi Identitas (Menghindari Filter Mismatch)
                // Mengumpulkan UUID asli (req.user.id) dan ID Petugas fallback jika ada
                const validInspectorIds = [req.user.id];
                if (req.user.officerId) {
                    validInspectorIds.push(req.user.officerId);
                }

                // Prisma akan mencari laporan yang inspektur-nya cocok dengan salah satu dari ID tersebut
                filter.inspection = {
                    inspectorId: { in: validInspectorIds }
                };
                break;

            case UserRole.AUDITOR:
                // Pimpinan/Auditor HANYA bisa menarik data laporan yang sedang diselidiki
                // atau sudah selesai (memfilter data PENDING/REJECTED/VERIFIED).
                filter.status = { in: [ReportStatus.INVESTIGATING, ReportStatus.RESOLVED] };
                break;

            case UserRole.ADMIN_DLH:
            case UserRole.SUPER_ADMIN:
            default:
                // Admin & Super Admin melihat semua data secara global.
                break;
        }

        const reports = await prisma.citizenReport.findMany({
            where: filter,
            orderBy: { createdAt: 'desc' },
            include: {
                inspection: true // Bawa data surat tugas jika sudah diverifikasi
            }
        });

        res.status(200).json({ success: true, data: reports });
    } catch (error: any) {
        console.error('Error in getReports:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
};

/**
 * [PROTECTED: ADMIN] Verifikasi dan Konversi menjadi Surat Tugas
 * GRASP: Controller & Transactional Cohesion
 */
export const verifyAndCreateInspection = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { inspectorId, inspectorName, date, companyId, adminNotes } = req.body;

        if (!inspectorId || !inspectorName || !date) {
            res.status(400).json({ success: false, message: 'Data penugasan inspeksi (petugas, tanggal) wajib diisi.' });
            return;
        }

        const report = await prisma.citizenReport.findUnique({ where: { id } });
        if (!report) {
            res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
            return;
        }

        if (report.status !== ReportStatus.PENDING) {
            res.status(400).json({ success: false, message: `Laporan tidak bisa diverifikasi karena status saat ini: ${report.status}` });
            return;
        }

        // Penerapan Null Object Pattern: Jika companyId kosong, otomatis dialokasikan ke COM-UNKNOWN [3]
        const finalCompanyId = companyId && companyId.trim() !== '' ? companyId : 'COM-UNKNOWN';

        // Menggunakan Prisma Transaction agar data konsisten (All or Nothing)
        const result = await prisma.$transaction(async (tx) => {
            // 1. Buat surat tugas Inspeksi baru
            const newInspection = await tx.inspection.create({
                data: {
                    companyId: finalCompanyId,
                    inspectorId,
                    inspectorName,
                    date,
                    location: `${report.lat},${report.lng}`,
                    notes: `Inspeksi berdasarkan Pengaduan Masyarakat (ID: ${report.trackingId}). Keluhan: ${report.incidentType}`,
                    status: 'Terjadwal',
                }
            });

            // 2. Update status Laporan Masyarakat ke VERIFIED dan ikatkan ID inspeksi
            const updatedReport = await tx.citizenReport.update({
                where: { id },
                data: {
                    status: ReportStatus.VERIFIED,
                    adminNotes: adminNotes || 'Laporan valid. Surat Tugas diterbitkan, menunggu keberangkatan petugas.',
                    inspectionId: newInspection.id
                }
            });

            return { newInspection, updatedReport };
        });

        // Catat aktivitas verifikasi ke Audit Log jika admin terautentikasi
        if (req.user) {
            await prisma.auditLog.create({
                data: {
                    user: req.user.email,
                    role: req.user.role,
                    action: `Memverifikasi pengaduan ${report.trackingId} dan menerbitkan Surat Tugas Inspeksi ${result.newInspection.id}`,
                },
            });
        }

        res.status(200).json({
            success: true,
            message: 'Laporan berhasil diverifikasi dan Surat Tugas Inspeksi telah diterbitkan.',
            data: result
        });
    } catch (error: any) {
        console.error('Error in verifyAndCreateInspection:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
};

/**
 * [PROTECTED: OFFICER/ADMIN] Memulai Penyelidikan di Lapangan (Sidak/Patroli)
 * GRASP: Controller & State Pattern (Mengatur perpindahan status ke INVESTIGATING)
 */
export const startInvestigation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const report = await prisma.citizenReport.findUnique({ where: { id } });
        if (!report) {
            res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
            return;
        }

        if (report.status !== ReportStatus.VERIFIED) {
            res.status(400).json({
                success: false,
                message: `Penyelidikan tidak dapat dimulai karena status laporan saat ini: ${report.status}`
            });
            return;
        }

        // Ubah status ke INVESTIGATING
        const updatedReport = await prisma.citizenReport.update({
            where: { id },
            data: {
                status: ReportStatus.INVESTIGATING,
                adminNotes: 'Petugas lapangan sedang mengarah dan melakukan sidak ke titik pengaduan.'
            }
        });

        // Catat pergerakan petugas ke Audit Log
        if (req.user) {
            await prisma.auditLog.create({
                data: {
                    user: req.user.email,
                    role: req.user.role,
                    action: `Memulai inspeksi fisik di lapangan atas laporan warga ${report.trackingId}`,
                },
            });
        }

        res.status(200).json({
            success: true,
            message: 'Status laporan berhasil diperbarui menjadi INVESTIGATING. Patroli diaktifkan.',
            data: updatedReport
        });
    } catch (error: any) {
        console.error('Error in startInvestigation:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
};

/**
 * [PROTECTED: ADMIN] Tolak Laporan (Spam/Hoax)
 */
export const rejectReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { adminNotes } = req.body;

        if (!adminNotes) {
            res.status(400).json({ success: false, message: 'Alasan penolakan (adminNotes) wajib diisi.' });
            return;
        }

        const report = await prisma.citizenReport.update({
            where: { id },
            data: {
                status: ReportStatus.REJECTED,
                adminNotes
            }
        });

        // Catat penolakan ke Audit Log
        if (req.user) {
            await prisma.auditLog.create({
                data: {
                    user: req.user.email,
                    role: req.user.role,
                    action: `Menolak pengaduan warga ${report.trackingId} dengan alasan: ${adminNotes}`,
                },
            });
        }

        res.status(200).json({
            success: true,
            message: 'Laporan ditolak dan diarsipkan sebagai tidak valid.',
            data: report
        });
    } catch (error: any) {
        console.error('Error in rejectReport:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
};