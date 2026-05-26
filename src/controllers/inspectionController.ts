import { Request, Response } from 'express';
import { PrismaClient, InspectionStatus, UserRole, NotificationType } from '@prisma/client';
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

const submitInspectionSchema = z.object({
  score: z.number().min(0).max(100),
  notes: z.string().optional(),
  photo: z.string().optional(),
  checklist: z.object({
    tpsB3: z.boolean(),
    ipal: z.boolean(),
    apar: z.boolean(),
    noise: z.boolean(),
    safetyEquipment: z.boolean(),
  }),
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

    const { score, notes, photo, checklist } = parsed.data;

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: { company: true }
    });

    if (!inspection) {
      return res.status(404).json({ success: false, error: 'Inspection not found' });
    }

    // Update inspection details
    const updatedInspection = await prisma.inspection.update({
      where: { id },
      data: {
        score,
        notes,
        photo,
        checklist,
        status: InspectionStatus.Selesai,
        bapSigned: true,
        // Override inspector UUID and Name to whoever actually submitted the audit
        inspectorId: req.user.id,
        inspectorName: req.user.name,
      },
    });

    // Compliance Sync: Update the company's ESG score
    await prisma.company.update({
      where: { id: inspection.companyId },
      data: { score }
    });

    // EWS Warning: If score < 60, send danger alert
    if (score < 60) {
      await prisma.systemNotification.create({
        data: {
          title: 'EWS: Tingkat Kepatuhan Kritis',
          message: `Hasil inspeksi di ${inspection.company.companyName} menujukkan skor kritis (${score}/100).`,
          type: NotificationType.WARNING,
        },
      });
    } else {
      // Regular success notification
      await prisma.systemNotification.create({
        data: {
          title: 'Hasil Evaluasi Kepatuhan',
          message: `Inspeksi selesai di ${inspection.company.companyName} dengan skor kepatuhan ${score}/100.`,
          type: NotificationType.SUCCESS,
        },
      });
    }

    // Write audit log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Mengirimkan hasil BAP inspeksi ${id} untuk ${inspection.company.companyName} dengan nilai ${score}`,
      },
    });

    return res.status(200).json({ success: true, inspection: updatedInspection });
  } catch (error) {
    console.error('Submit inspection error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
