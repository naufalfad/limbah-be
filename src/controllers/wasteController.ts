import { Request, Response } from 'express';
import { PrismaClient, WasteLogStatus, UserRole, NotificationType } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createWasteLogSchema = z.object({
  companyId: z.string(),
  type: z.string().min(2),
  volume: z.number().positive(),
  unit: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  method: z.enum(['Dinas', 'Mandiri']),
  note: z.string().optional(),
});

export async function createWasteLog(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parsed = createWasteLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { companyId, type, volume, unit, date, method, note } = parsed.data;

    // Check company existence & ownership validation
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (req.user.role === UserRole.PERUSAHAAN && company.picId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this company' });
    }

    // Default status logic based on pickup method
    const status = method === 'Dinas' ? WasteLogStatus.Terjadwal_Pickup : WasteLogStatus.Proses_Verifikasi;

    const log = await prisma.wasteLog.create({
      data: {
        companyId,
        type,
        volume,
        unit,
        date,
        method,
        status,
        note,
      },
    });

    // Early Warning System AI Anomaly Detection
    // Volume over 100 triggers warning notification
    if (volume > 100) {
      await prisma.systemNotification.create({
        data: {
          title: 'EWS: Deteksi Volume Limbah Anomali',
          message: `Volume limbah ${type} di ${company.companyName} terdeteksi berlebih (${volume} ${unit}). Potensi kebocoran / over kapasitas.`,
          type: NotificationType.DANGER,
        },
      });
    }

    // Audit Log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Melaporkan limbah ${type} volume ${volume} ${unit} untuk ${company.companyName}`,
      },
    });

    return res.status(201).json({ success: true, log });
  } catch (error) {
    console.error('Create waste log error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getWasteLogs(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const queryCompanyId = req.query.companyId as string | undefined;

    let filter: any = {};

    if (req.user.role === UserRole.PERUSAHAAN) {
      if (queryCompanyId) {
        // Verify ownership of the queried company
        const company = await prisma.company.findUnique({ where: { id: queryCompanyId } });
        if (!company || company.picId !== req.user.id) {
          return res.status(403).json({ success: false, error: 'Forbidden: You do not own this company' });
        }
        filter.companyId = queryCompanyId;
      } else {
        // Restrict to all companies owned by this PIC
        filter.company = { picId: req.user.id };
      }
    } else {
      if (queryCompanyId) {
        filter.companyId = queryCompanyId;
      }
    }

    const logs = await prisma.wasteLog.findMany({
      where: filter,
      include: {
        company: {
          select: { id: true, companyName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, logs });
  } catch (error) {
    console.error('Get waste logs error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function verifyWasteLog(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (![WasteLogStatus.Terverifikasi, WasteLogStatus.Ditolak].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid verification status' });
    }

    const log = await prisma.wasteLog.findUnique({
      where: { id },
      include: { company: true }
    });

    if (!log) {
      return res.status(404).json({ success: false, error: 'Waste log not found' });
    }

    const updatedLog = await prisma.wasteLog.update({
      where: { id },
      data: { status },
    });

    // Notify PIC
    if (log.company.picId) {
      const type = status === WasteLogStatus.Terverifikasi ? NotificationType.SUCCESS : NotificationType.WARNING;
      await prisma.systemNotification.create({
        data: {
          title: `Laporan Limbah ${status}`,
          message: `Laporan limbah ${log.type} (${log.volume} ${log.unit}) untuk perusahaan ${log.company.companyName} telah ${status.toLowerCase()} oleh DLH.`,
          type,
        },
      });
    }

    // Write audit log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Melakukan verifikasi laporan limbah ${log.id} sebagai ${status}`,
      },
    });

    return res.status(200).json({ success: true, log: updatedLog });
  } catch (error) {
    console.error('Verify waste log error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
