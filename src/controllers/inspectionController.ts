// src/controllers/inspectionController.ts
import { Request, Response } from 'express';
import {
  PrismaClient,
  Prisma, // Mengimpor namespace Prisma untuk penanganan Json Null (DbNull)
  InspectionStatus,
  UserRole,
  NotificationType
} from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createInspectionSchema = z.object({
  companyId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inspectorId: z.string(),
  inspectorName: z.string().min(2),
  location: z.string(),
  notes: z.string().optional(),
});

// --- KODE REKAN ANDA: Menyimpan definisi Schema Checklist Baru ---
const uklUplChecklistSchema = z.object({
  sumberDampakStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  sumberDampakNotes: z.string().optional().nullable(),
  jenisDampakStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  jenisDampakNotes: z.string().optional().nullable(),
  besaranDampakStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  besaranDampakNotes: z.string().optional().nullable(),
  pengelolaanBentukStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  pengelolaanBentukNotes: z.string().optional().nullable(),
  pengelolaanLokasiStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  pengelolaanLokasiNotes: z.string().optional().nullable(),
  pengelolaanPeriodeStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  pengelolaanPeriodeNotes: z.string().optional().nullable(),
  pemantauanBentukStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  pemantauanBentukNotes: z.string().optional().nullable(),
  pemantauanLokasiStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  pemantauanLokasiNotes: z.string().optional().nullable(),
  pemantauanPeriodeStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  pemantauanPeriodeNotes: z.string().optional().nullable(),
  institusiStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  institusiNotes: z.string().optional().nullable(),
  keteranganStatus: z.enum(['SESUAI', 'TIDAK_SESUAI']).optional(),
  keteranganNotes: z.string().optional().nullable(),
});

const spplChecklistSchema = z.object({
  spplBersih: z.boolean(),
  spplBebasLimbah: z.boolean(),
  spplDrainase: z.boolean(),
  spplBebasBakar: z.boolean(),
  spplTempatSampah: z.boolean(),
});

// Skema utama diubah menjadi fleksibel (z.any) agar kompatibel dengan UI Anda dan UI teman Anda
const submitInspectionSchema = z.object({
  score: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().optional(),
  photo: z.string().optional(),
  checklist: z.any().nullable().optional(),
  correctedCompanyId: z.string().optional(), // Parameter Rebinding Pelanggar untuk COM-UNKNOWN
});

/**
 * [PROTECTED: ADMIN DLH / SUPER ADMIN] Membuat Jadwal Inspeksi (Surat Tugas Baru)
 * GRASP: Creator (DLH menciptakan Surat Tugas/Inspection)
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

    // Menarik target industri (Mendukung Null-Object 'COM-UNKNOWN')
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

    if (company.picId) {
      await prisma.systemNotification.create({
        data: {
          title: 'Jadwal Inspeksi Baru',
          message: `Inspeksi lapangan dijadwalkan untuk perusahaan ${company.companyName} pada tanggal ${date}.`,
          type: NotificationType.INFO,
        },
      });
    }

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
 * KODE ANDA: Logika Decoupling dipertahankan, tidak ada update ke CitizenReport.
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

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: { company: true }
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

    const result = await prisma.$transaction(async (tx) => {
      // 1. Perbarui detail data BAP Inspeksi
      const updatedInspection = await tx.inspection.update({
        where: { id },
        data: {
          score: score ?? null,
          notes,
          photo,
          checklist: checklist ?? Prisma.DbNull,
          status: InspectionStatus.Selesai,
          bapSigned: true,
          companyId: finalCompanyId,
          inspectorId: req.user!.id,
          inspectorName: req.user!.name,
        },
      });

      // 2. Pemutakhiran ESG: Sinkronisasikan skor kepatuhan industri target
      if (typeof score === 'number') {
        await tx.company.update({
          where: { id: finalCompanyId },
          data: { score }
        });
      }

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
      citizenReport: null // Mengirimkan null eksplisit demi menjaga kompatibilitas API client
    });
  } catch (error) {
    console.error('Submit inspection error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// --- KODE REKAN ANDA: Fitur Tindak Lanjut Admin DLH (DIPERTAHANKAN) ---
const followUpSchema = z.object({
  action: z.enum(['SESUAI', 'PERINGATAN', 'CABUT_IZIN']),
  notes: z.string().optional(),
});

export async function followUpInspection(req: Request, res: Response) {
  try {
    if (!req.user || (req.user.role !== UserRole.ADMIN_DLH && req.user.role !== UserRole.SUPER_ADMIN)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const parsed = followUpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { action, notes } = parsed.data;

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: { company: true }
    });

    if (!inspection) {
      return res.status(404).json({ success: false, error: 'Inspection not found' });
    }

    let notificationTitle = '';
    let notificationMessage = '';
    let notificationType: NotificationType = NotificationType.INFO;

    if (action === 'SESUAI') {
      notificationTitle = 'Inspeksi Tervalidasi Sesuai';
      notificationMessage = `Hasil inspeksi Anda telah divalidasi oleh Admin DLH. Catatan: ${notes || '-'}`;
      notificationType = NotificationType.SUCCESS;
    } else if (action === 'PERINGATAN') {
      notificationTitle = 'Peringatan Hasil Inspeksi';
      notificationMessage = `Terdapat teguran dari Admin DLH terkait hasil inspeksi. Catatan: ${notes || '-'}`;
      notificationType = NotificationType.WARNING;
    } else if (action === 'CABUT_IZIN') {
      notificationTitle = 'Pencabutan Izin Operasional';
      notificationMessage = `Berdasarkan hasil inspeksi, izin operasional perusahaan Anda dibekukan/dicabut. Catatan: ${notes || '-'}`;
      notificationType = NotificationType.DANGER;

      await prisma.company.update({
        where: { id: inspection.companyId },
        data: { status: 'SUSPENDED' }
      });
    }

    const updatedNotes = inspection.notes
      ? `${inspection.notes}\n\n[Tindak Lanjut Admin]: ${notes || 'Tidak ada catatan tambahan'}`
      : `[Tindak Lanjut Admin]: ${notes || 'Tidak ada catatan tambahan'}`;

    const updatedInspection = await prisma.inspection.update({
      where: { id },
      data: {
        notes: updatedNotes,
        status: InspectionStatus.Selesai
      }
    });

    await prisma.systemNotification.create({
      data: {
        title: notificationTitle,
        message: notificationMessage,
        type: notificationType,
      }
    });

    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Melakukan tindak lanjut (${action}) untuk inspeksi ${id} milik ${inspection.company.companyName}`,
      }
    });

    return res.status(200).json({ success: true, inspection: updatedInspection });
  } catch (error) {
    console.error('Follow-up inspection error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}