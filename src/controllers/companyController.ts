import { Request, Response } from 'express';
import { PrismaClient, CompanyStatus, DocType, UserRole, NotificationType } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createCompanySchema = z.object({
  companyName: z.string().min(2),
  nib: z.string().min(5),
  npwp: z.string().min(5),
  picName: z.string().min(2),
  picPhone: z.string().min(5),
  picRole: z.string().min(2),
  investmentType: z.string(),
  yearBuilt: z.string(),
  buildingArea: z.number().nonnegative(),
  operationalHours: z.string(),
  rawMaterials: z.string(),
  waterSource: z.string(),
  powerSource: z.string(),
  kbli: z.string(),
  investment: z.number().nonnegative(),
  landArea: z.number().nonnegative(),
  employees: z.number().int().nonnegative(),
  lat: z.string(),
  lng: z.string(),
  address: z.string(),
  wasteInfo: z.string().optional(),
  hasTps: z.boolean().optional(),
});

export async function createCompany(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const data = parsed.data;

    // Smart Assessment for environmental document category
    const docType = (data.investment >= 5000000000 || data.landArea >= 5000)
      ? DocType.UKL_UPL
      : DocType.SPPL;

    const company = await prisma.company.create({
      data: {
        ...data,
        docType,
        status: CompanyStatus.PENDING,
        picId: req.user.id,
      },
    });

    // Create system notification for Admin DLH
    await prisma.systemNotification.create({
      data: {
        title: 'Registrasi Perusahaan Baru',
        message: `Perusahaan ${company.companyName} telah didaftarkan dan memerlukan verifikasi dokumen ${docType}.`,
        type: NotificationType.INFO,
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Mendaftarkan perusahaan baru: ${company.companyName} (${company.id})`,
      },
    });

    return res.status(201).json({ success: true, company });
  } catch (error: any) {
    console.error('Create company error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'NIB already registered' });
    }
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getCompanies(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let filter = {};
    if (req.user.role === UserRole.PERUSAHAAN) {
      // Multi-tenant isolation for PIC
      filter = { picId: req.user.id };
    }

    const companies = await prisma.company.findMany({
      where: filter,
      include: {
        pic: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return res.status(200).json({ success: true, companies });
  } catch (error) {
    console.error('Get companies error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getCompanyById(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        pic: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Strict ownership validation for PERUSAHAAN role
    if (req.user.role === UserRole.PERUSAHAAN && company.picId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this company' });
    }

    return res.status(200).json({ success: true, company });
  } catch (error) {
    console.error('Get company by id error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function updateCompanyStatus(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!Object.values(CompanyStatus).includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value' });
    }

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const updatedCompany = await prisma.company.update({
      where: { id },
      data: { status },
    });

    // Notify the PIC of the company
    if (updatedCompany.picId) {
      const type = status === CompanyStatus.APPROVED ? NotificationType.SUCCESS : NotificationType.WARNING;
      await prisma.systemNotification.create({
        data: {
          title: `Status Dokumen Lingkungan ${status}`,
          message: `Dokumen lingkungan untuk perusahaan ${updatedCompany.companyName} telah diubah menjadi ${status}.`,
          type,
        },
      });
    }

    // Write audit log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Mengubah status perusahaan ${updatedCompany.companyName} (${id}) menjadi ${status}`,
      },
    });

    return res.status(200).json({ success: true, company: updatedCompany });
  } catch (error) {
    console.error('Update company status error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
