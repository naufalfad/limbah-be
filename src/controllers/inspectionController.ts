// src/controllers/inspectionController.ts
import { Request, Response } from 'express';
import {
  PrismaClient,
  Prisma, // Mengimpor namespace Prisma untuk penanganan Json Null (DbNull)
  InspectionStatus,
  UserRole,
  NotificationType
  // ReportStatus dihilangkan karena relasi eksternal dibongkar [3]
} from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createInspectionSchema = z.object({
  companyId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inspectorId: z.string(),
  inspectorName: z.string().min(2),
  location: z.string(), // Mampu menerima koordinat custom manual (contoh: "-2.5337, 112.9515")
  notes: z.string().optional(),
});

// Penerapan Payload Polymorphism
const submitInspectionSchema = z.object({
  score: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().optional(),
  photo: z.string().optional(),
  checklist: z.object({
    tpsB3: z.boolean(),
    ipal: z.boolean(),
    apar: z.boolean(),
    noise: z.boolean(),
    safetyEquipment: z.boolean(),
  }).nullable().optional(),
  correctedCompanyId: z.string().optional(), // Parameter Rebinding Pelanggar untuk COM-UNKNOWN
});

/**
 * [PROTECTED: ADMIN DLH / SUPER ADMIN] Membuat Jadwal Inspeksi (Surat Tugas Baru)
 * GRASP: Creator (DLH menciptakan Surat Tugas/Inspection)
 * 
 * Sesuai arsitektur baru, fungsi ini dipanggil langsung oleh Admin DLH 
 * untuk membuat Surat Tugas (Rutin Bulanan atau Ad-Hoc Penyelidikan Lapangan) [3].
 */
export async function createInspection(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parsed = createInspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { companyId, date, inspectorId, inspectorName, location, notes } = parsed.data;

    // Menarik target industri (Mendukung Null-Object 'COM-UNKNOWN' untuk kasus tanpa pelanggar terdaftar)
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company/Target entity not found' });
    }

    const inspection = await prisma.inspection.create({
      data: {
        companyId,
        date,
        inspectorId,
        inspectorName,
        location,
        notes,
        status: InspectionStatus.Terjadwal,
      },
    });

    // Kirim notifikasi ke PIC jika entitas industri valid (Bukan COM-UNKNOWN)
    if (company.picId) {
      await prisma.systemNotification.create({
        data: {
          title: 'Jadwal Inspeksi Baru',
          message: `Inspeksi lapangan dijadwalkan untuk perusahaan ${company.companyName} pada tanggal ${date}.`,
          type: NotificationType.INFO,
        },
      });
    }

    // Catat tindakan ke audit log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Menjadwalkan inspeksi baru untuk ${company.companyName} (${date})`,
      },
    });

    return res.status(201).json({ success: true, inspection });
  } catch (error) {
    console.error('Create inspection error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * [PROTECTED: ALL ROLES] Mengambil Data Riwayat Penugasan Inspeksi
 */
export async function getInspections(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let filter: any = {};
    if (req.user.role === UserRole.PERUSAHAAN) {
      filter.company = { picId: req.user.id };
    }

    const inspections = await prisma.inspection.findMany({
      where: filter,
      include: {
        company: {
          select: { id: true, companyName: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    return res.status(200).json({ success: true, inspections });
  } catch (error) {
    console.error('Get inspections error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * [PROTECTED: OFFICER / DLH / SUPER ADMIN] Submit Hasil BAP Lapangan
 * GRASP: Controller & Transactional Cohesion (Mengelola Data Integrity)
 * 
 * ARSITEKTUR UPDATE: Logika transaksi close-loop untuk meng-update CitizenReport 
 * telah dibuang total demi menjaga kebersihan core database perizinan [3].
 */
export async function submitInspection(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const parsed = submitInspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { score, notes, photo, checklist, correctedCompanyId } = parsed.data;

    // Membaca Surat Tugas (include: citizenReport dibuang karena relasi telah diputus) [3]
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: {
        company: true
      }
    });

    if (!inspection) {
      return res.status(404).json({ success: false, error: 'Inspection not found' });
    }

    // FASE 1 ARSITEKTUR: Logika Rebinding Target Perusahaan (Khusus COM-UNKNOWN)
    let finalCompanyId = inspection.companyId;
    let finalCompanyName = inspection.company.companyName;
    let isRebinded = false;

    if (correctedCompanyId && correctedCompanyId !== inspection.companyId) {
      const targetCompany = await prisma.company.findUnique({ where: { id: correctedCompanyId } });
      if (!targetCompany) {
        return res.status(404).json({ success: false, error: 'Entitas perusahaan target rebind tidak ditemukan di database.' });
      }
      finalCompanyId = targetCompany.id;
      finalCompanyName = targetCompany.companyName;
      isRebinded = true;
    }

    // FASE 1 ARSITEKTUR: Transaksi All-or-Nothing dengan Data Integrity Guard
    const result = await prisma.$transaction(async (tx) => {

      // 1. Perbarui detail data BAP Inspeksi (Sesuai parameter input fisik lapangan)
      const updatedInspection = await tx.inspection.update({
        where: { id },
        data: {
          score: score ?? null,
          notes,
          photo,
          // Menyetel kolom JSON menjadi DB NULL jika checklist kosong
          checklist: checklist ?? Prisma.DbNull,
          status: InspectionStatus.Selesai,
          bapSigned: true,
          companyId: finalCompanyId,
          inspectorId: req.user!.id,
          inspectorName: req.user!.name,
        },
      });

      // 2. Pemutakhiran ESG: Sinkronisasikan skor kepatuhan industri target
      // GUARD: Hanya di-update jika score benar-benar berupa angka (Bukan Penyelidikan Aduan)
      if (typeof score === 'number') {
        await tx.company.update({
          where: { id: finalCompanyId },
          data: { score }
        });
      }

      // --- LOGIKA UPDATE CITIZEN REPORT DIHAPUS TOTAL DI SINI UNTUK DECOUPLING ---

      return { updatedInspection };
    });

    // 3. Pengiriman Notifikasi EWS Sektoral berdasarkan tipe BAP
    if (typeof score === 'number') {
      if (score < 60) {
        await prisma.systemNotification.create({
          data: {
            title: 'EWS: Tingkat Kepatuhan Kritis',
            message: `Hasil inspeksi di ${finalCompanyName} menunjukkan skor kritis (${score}/100).`,
            type: NotificationType.WARNING,
          },
        });
      } else {
        await prisma.systemNotification.create({
          data: {
            title: 'Hasil Evaluasi Kepatuhan',
            message: `Inspeksi rutin selesai di ${finalCompanyName} dengan skor kepatuhan ${score}/100.`,
            type: NotificationType.SUCCESS,
          },
        });
      }
    } else {
      await prisma.systemNotification.create({
        data: {
          title: 'BAP Penindakan Terkirim',
          message: `Berita Acara Pemeriksaan Lapangan terhadap ${finalCompanyName} berhasil diamankan ke sistem.`,
          type: NotificationType.INFO,
        },
      });
    }

    // 4. Pencatatan Jejak Tindakan (Audit Log Security)
    let logAction = `Mengirimkan hasil BAP inspeksi ${id} untuk ${finalCompanyName}.`;
    if (typeof score === 'number') logAction += ` (Skor ESG: ${score}/100).`;
    if (isRebinded) logAction += ` (Melakukan Rebind ID dari ${inspection.companyId} ke ${finalCompanyId}).`;

    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: logAction,
      },
    });

    return res.status(200).json({
      success: true,
      inspection: result.updatedInspection,
      citizenReport: null // Mengirimkan null eksplisit demi menjaga kompatibilitas API client lama [3]
    });
  } catch (error) {
    console.error('Submit inspection error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}