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
 * [PUBLIC] Submit Laporan Baru (Arsip Statis / Formalitas)
 * GRASP: Creator (Menginstansiasi objek CitizenReport baru)
 * 
 * Sesuai pembaruan arsitektural, data ini murni disimpan sebagai arsip masukan publik
 * tanpa memicu transisi state machine penugasan apa pun di core system [3].
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
 * [PUBLIC] Lacak Status Laporan (Untuk Kebutuhan Tampilan Pengaduan)
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
 * [PROTECTED: ADMIN DLH / SUPER ADMIN ONLY] Ambil Semua Laporan Spasial
 * 
 * ARSITEKTUR UPDATE: Logika filter relasi 'inspection' dan peran Inspektur/Auditor dihapus
 * karena modul pengaduan masyarakat telah sepenuhnya di-decouple (terisolasi) menjadi arsip statis [3].
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

        // PROTEKSI OTORISASI: Hanya Admin DLH dan Super Admin yang diizinkan mengakses data arsip aduan warga
        if (req.user.role !== UserRole.ADMIN_DLH && req.user.role !== UserRole.SUPER_ADMIN) {
            res.status(403).json({
                success: false,
                message: 'Forbidden: Akses ditolak. Hanya Admin verifikator yang diizinkan membuka arsip pengaduan publik.'
            });
            return;
        }

        // Melakukan penarikan data mentah pengaduan
        const reports = await prisma.citizenReport.findMany({
            where: filter,
            orderBy: { createdAt: 'desc' }
            // include: { inspection: true } DIHAPUS karena relasi fisik telah diputus di schema.prisma [3]
        });

        res.status(200).json({ success: true, data: reports });
    } catch (error: any) {
        console.error('Error in getReports:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
};

/**
 * [PROTECTED: ADMIN] Tolak Laporan / Arsipkan sebagai Spam (Spam/Hoax)
 * Membantu Admin menyaring/mengarsipkan laporan statis yang terbukti palsu.
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