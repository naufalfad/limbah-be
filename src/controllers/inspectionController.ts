// src/controllers/inspectionController.ts
import { Request, Response } from 'express';
import {
  PrismaClient,
  Prisma,
  InspectionStatus,
  UserRole,
  NotificationType,
  ReportStatus
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

// FASE 1 ARSITEKTUR: Penerapan Payload Polymorphism
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
  correctedCompanyId: z.string().optional(),
});

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

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
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

    // Notify company PIC
    if (company.picId) {
      await prisma.systemNotification.create({
        data: {
          title: 'Jadwal Inspeksi Baru',
          message: `Inspeksi lapangan dijadwalkan untuk perusahaan ${company.companyName} pada tanggal ${date}.`,
          type: NotificationType.INFO,
        },
      });
    }

    // Write audit log
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

// LOGIKA KITA (Fase 1 Arsitektur Terpadu)
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
      include: {
        company: true,
        citizenReport: true
      }
    });

    if (!inspection) {
      return res.status(404).json({ success: false, error: 'Inspection not found' });
    }

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

      if (typeof score === 'number') {
        await tx.company.update({
          where: { id: finalCompanyId },
          data: { score }
        });
      }

      let updatedReport = null;
      if (inspection.citizenReport) {

        let resolutionNote = notes || `Pengaduan diselesaikan secara tuntas berdasarkan hasil Berita Acara Pemeriksaan (BAP) lapangan oleh petugas ${req.user!.name}.`;
        if (isRebinded) {
          resolutionNote = `[IDENTIFIKASI PELANGGAR DITEMUKAN] Pelaku pembuangan limbah diarahkan ke entitas terdaftar: ${finalCompanyName}. ` + resolutionNote;
        }

        updatedReport = await tx.citizenReport.update({
          where: { id: inspection.citizenReport.id },
          data: {
            status: ReportStatus.RESOLVED,
            adminNotes: resolutionNote
          }
        });

        await tx.systemNotification.create({
          data: {
            title: 'Laporan Warga Selesai Ditindak',
            message: `Aduan warga (ID: ${inspection.citizenReport.trackingId}) telah berstatus RESOLVED setelah ditindak secara fisik oleh petugas di lokasi.`,
            type: NotificationType.SUCCESS,
          }
        });
      }

      return { updatedInspection, updatedReport };
    });

    if (typeof score === 'number') {
      if (score < 60) {
        await prisma.systemNotification.create({
          data: {
            title: 'EWS: Tingkat Kepatuhan Kritis',
            message: `Hasil inspeksi di ${finalCompanyName} menujukkan skor kritis (${score}/100).`,
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

    let logAction = `Mengirimkan hasil BAP inspeksi ${id} untuk ${finalCompanyName}.`;
    if (typeof score === 'number') logAction += ` (Skor ESG: ${score}/100).`;
    if (isRebinded) logAction += ` (Melakukan Rebind ID dari ${inspection.companyId} ke ${finalCompanyId}).`;
    if (result.updatedReport) logAction += ` (Menutup kasus pengaduan warga ${inspection.citizenReport!.trackingId} menjadi RESOLVED).`;

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
      citizenReport: result.updatedReport
    });
  } catch (error) {
    console.error('Submit inspection error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// LOGIKA TEMAN ANDA (Tindak Lanjut Admin DLH)
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

      // Suspend company
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