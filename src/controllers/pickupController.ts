import { Request, Response } from 'express';
import { PrismaClient, PickupStatus, InvoiceStatus, InvoiceType, UserRole, NotificationType } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createPickupSchema = z.object({
  companyId: z.string(),
  wasteType: z.string().min(2),
  volume: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.string().min(5),
});

const pricePickupSchema = z.object({
  cost: z.number().positive(),
  driverName: z.string().min(2),
  plateNo: z.string().min(3),
});

const updateStatusSchema = z.object({
  status: z.enum([PickupStatus.ON_THE_ROAD, PickupStatus.LOADED, PickupStatus.COMPLETED]),
  evidencePhoto: z.string().optional(),
});

export async function createPickup(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parsed = createPickupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { companyId, wasteType, volume, date, address } = parsed.data;

    // Check company and ownership validation
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (req.user.role === UserRole.PERUSAHAAN && company.picId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this company' });
    }

    const pickup = await prisma.pickupRequest.create({
      data: {
        companyId,
        wasteType,
        volume,
        date,
        address,
        status: PickupStatus.PENDING,
        transporterId: 'TRANS-001', // Default mock transporter
        transporterName: 'PT. Transport Limbah Indonesia',
      },
    });

    // Write system notification
    await prisma.systemNotification.create({
      data: {
        title: 'Pengajuan Penjemputan Limbah',
        message: `Pengajuan penjemputan limbah ${wasteType} dari ${company.companyName} telah didaftarkan.`,
        type: NotificationType.INFO,
      },
    });

    return res.status(201).json({ success: true, pickup });
  } catch (error) {
    console.error('Create pickup error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getPickups(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const queryCompanyId = req.query.companyId as string | undefined;
    let filter: any = {};

    if (req.user.role === UserRole.PERUSAHAAN) {
      if (queryCompanyId) {
        const company = await prisma.company.findUnique({ where: { id: queryCompanyId } });
        if (!company || company.picId !== req.user.id) {
          return res.status(403).json({ success: false, error: 'Forbidden: You do not own this company' });
        }
        filter.companyId = queryCompanyId;
      } else {
        filter.company = { picId: req.user.id };
      }
    } else {
      if (queryCompanyId) {
        filter.companyId = queryCompanyId;
      }
    }

    const pickups = await prisma.pickupRequest.findMany({
      where: filter,
      include: {
        company: {
          select: { id: true, companyName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, pickups });
  } catch (error) {
    console.error('Get pickups error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function pricePickup(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const parsed = pricePickupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { cost, driverName, plateNo } = parsed.data;

    const pickup = await prisma.pickupRequest.findUnique({
      where: { id },
      include: { company: true }
    });

    if (!pickup) {
      return res.status(404).json({ success: false, error: 'Pickup request not found' });
    }

    // Generate Invoice with UNPAID status
    const invoice = await prisma.invoice.create({
      data: {
        companyId: pickup.companyId,
        type: InvoiceType.Pengangkutan,
        amount: cost,
        date: new Date().toISOString().split('T')[0],
        status: InvoiceStatus.UNPAID,
      },
    });

    // Update pickup with price and driver detail
    const updatedPickup = await prisma.pickupRequest.update({
      where: { id },
      data: {
        status: PickupStatus.PRICED,
        cost,
        driverName,
        plateNo,
        invoiceId: invoice.id,
      },
    });

    // Notify PIC
    if (pickup.company.picId) {
      await prisma.systemNotification.create({
        data: {
          title: 'Biaya Pengangkutan Ditetapkan',
          message: `Biaya penjemputan limbah untuk ${pickup.company.companyName} adalah Rp ${cost.toLocaleString()}. Silakan lakukan pembayaran.`,
          type: NotificationType.INFO,
        },
      });
    }

    return res.status(200).json({ success: true, pickup: updatedPickup, invoice });
  } catch (error) {
    console.error('Price pickup error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getInvoices(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const queryCompanyId = req.query.companyId as string | undefined;
    let filter: any = {};

    if (req.user.role === UserRole.PERUSAHAAN) {
      if (queryCompanyId) {
        const company = await prisma.company.findUnique({ where: { id: queryCompanyId } });
        if (!company || company.picId !== req.user.id) {
          return res.status(403).json({ success: false, error: 'Forbidden: You do not own this company' });
        }
        filter.companyId = queryCompanyId;
      } else {
        filter.company = { picId: req.user.id };
      }
    } else {
      if (queryCompanyId) {
        filter.companyId = queryCompanyId;
      }
    }

    const invoices = await prisma.invoice.findMany({
      where: filter,
      include: {
        company: {
          select: { id: true, companyName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, invoices });
  } catch (error) {
    console.error('Get invoices error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function payInvoice(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { company: true }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    if (invoice.status !== InvoiceStatus.UNPAID) {
      return res.status(400).json({ success: false, error: 'Invoice is already paid or settled' });
    }

    // Direct Billing simulator: settle immediately to local government RKUD, bypass ESCROW
    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SETTLED }
    });

    // If there is an associated pickup request, set it to PAID
    const associatedPickup = await prisma.pickupRequest.findFirst({
      where: { invoiceId: id }
    });

    if (associatedPickup) {
      await prisma.pickupRequest.update({
        where: { id: associatedPickup.id },
        data: { status: PickupStatus.PAID }
      });
    }

    // Notify PIC
    if (invoice.company.picId) {
      await prisma.systemNotification.create({
        data: {
          title: 'Pembayaran Diterima (Settled)',
          message: `Pembayaran tagihan ${id} sebesar Rp ${invoice.amount.toLocaleString()} berhasil disetorkan langsung ke Kas Umum Daerah (RKUD).`,
          type: NotificationType.SUCCESS,
        },
      });
    }

    // Write audit log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Melakukan pembayaran langsung Kas Daerah (Direct Billing settled) untuk invoice ${id}`,
      },
    });

    return res.status(200).json({ success: true, invoice: updatedInvoice });
  } catch (error) {
    console.error('Pay invoice error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function updatePickupStatus(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { status, evidencePhoto } = parsed.data;

    const pickup = await prisma.pickupRequest.findUnique({
      where: { id },
      include: { company: true }
    });

    if (!pickup) {
      return res.status(404).json({ success: false, error: 'Pickup request not found' });
    }

    const updatedPickup = await prisma.pickupRequest.update({
      where: { id },
      data: {
        status,
        evidencePhoto,
      },
    });

    // Write Audit Log and System Notifications
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Mengubah status pickup ${id} menjadi ${status}`,
      },
    });

    if (pickup.company.picId) {
      await prisma.systemNotification.create({
        data: {
          title: `Status Pengangkutan: ${status}`,
          message: `Penjemputan limbah ${pickup.wasteType} untuk ${pickup.company.companyName} sekarang berstatus ${status}.`,
          type: status === PickupStatus.COMPLETED ? NotificationType.SUCCESS : NotificationType.INFO,
        },
      });
    }

    return res.status(200).json({ success: true, pickup: updatedPickup });
  } catch (error) {
    console.error('Update pickup status error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
