// src/controllers/reportController.ts
import { Request, Response } from 'express';
import { PrismaClient, ReportStatus } from '@prisma/client';
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
                lat: true, // << WAJIB DITAMBAHKAN!
                lng: true, // << WAJIB DITAMBAHKAN!
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
 * [PROTECTED: ADMIN] Ambil Semua Laporan untuk Dashboard Triage
 */
export const getReports = async (req: Request, res: Response): Promise<void> => {
    try {
        const { status } = req.query;

        // Filter dinamis berdasarkan tab (PENDING, VERIFIED, dll)
        const filter = status ? { status: status as ReportStatus } : {};

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
        // Admin harus menugaskan siapa yang turun ke lapangan dan kapan jadwalnya
        const { inspectorId, inspectorName, date, companyId, adminNotes } = req.body;

        if (!inspectorId || !inspectorName || !date || !companyId) {
            res.status(400).json({ success: false, message: 'Data penugasan inspeksi (petugas, tanggal, target pabrik) wajib diisi.' });
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

        // Menggunakan Prisma Transaction agar data konsisten (All or Nothing)
        const result = await prisma.$transaction(async (tx) => {
            // 1. Buat surat tugas Inspeksi baru
            const newInspection = await tx.inspection.create({
                data: {
                    companyId,
                    inspectorId,
                    inspectorName,
                    date,
                    location: `${report.lat},${report.lng}`, // Menggunakan titik koordinat dari warga
                    notes: `Inspeksi berdasarkan Pengaduan Masyarakat (ID: ${report.trackingId}). Keluhan: ${report.incidentType}`,
                    status: 'Terjadwal',
                }
            });

            // 2. Update status Laporan Masyarakat dan ikatkan ID inspeksi
            const updatedReport = await tx.citizenReport.update({
                where: { id },
                data: {
                    status: ReportStatus.VERIFIED,
                    adminNotes: adminNotes || 'Laporan valid. Menunggu eksekusi petugas lapangan.',
                    inspectionId: newInspection.id
                }
            });

            return { newInspection, updatedReport };
        });

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