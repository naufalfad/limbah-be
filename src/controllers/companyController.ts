import { Request, Response } from 'express';
import { PrismaClient, CompanyStatus, DocType, UserRole, NotificationType } from '@prisma/client';
import { z } from 'zod';
import PDFDocument from 'pdfkit';

const prisma = new PrismaClient();

// Zod schema using coerce for numeric fields that come as strings from FormData
const createCompanySchema = z.object({
  companyName: z.string().min(2),
  nib: z.string().min(5),
  npwp: z.string().min(5),
  picName: z.string().min(2),
  picPhone: z.string().min(5),
  picRole: z.string().min(2),
  investmentType: z.string(),
  yearBuilt: z.string(),
  buildingArea: z.coerce.number().nonnegative(),
  operationalHours: z.string(),
  rawMaterials: z.string(),
  waterSource: z.string(),
  powerSource: z.string(),
  kbli: z.string(),
  investment: z.coerce.number().nonnegative(),
  landArea: z.coerce.number().nonnegative(),
  employees: z.coerce.number().int().nonnegative(),
  lat: z.string(),
  lng: z.string(),
  address: z.string(),
  wasteInfo: z.string().optional(),
  hasTps: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
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

    // Extract uploaded file paths from Multer (req.files is keyed by field name)
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const docNibUrl = files?.['nibDoc']?.[0]
      ? `/uploads/companies/${files['nibDoc'][0].filename}`
      : null;
    const docNpwpUrl = files?.['npwpDoc']?.[0]
      ? `/uploads/companies/${files['npwpDoc'][0].filename}`
      : null;
    const docSiteplanUrl = files?.['siteplanDoc']?.[0]
      ? `/uploads/companies/${files['siteplanDoc'][0].filename}`
      : null;

    const company = await prisma.company.create({
      data: {
        ...data,
        docType,
        status: CompanyStatus.PENDING,
        picId: req.user.id,
        ...(docNibUrl && { docNibUrl }),
        ...(docNpwpUrl && { docNpwpUrl }),
        ...(docSiteplanUrl && { docSiteplanUrl }),
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

export async function downloadCertificatePdf(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Strict ownership validation for PERUSAHAAN role
    if (req.user.role === UserRole.PERUSAHAAN && company.picId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this company' });
    }

    if (company.status !== CompanyStatus.APPROVED) {
      return res.status(400).json({ success: false, error: 'Certificate not available yet' });
    }

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Sertifikat_${company.companyName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);

    doc.pipe(res);

    // PDF Content (Official Layout)
    doc.fontSize(16).font('Helvetica-Bold').text('PEMERINTAH KABUPATEN / KOTA BANDUNG', { align: 'center' });
    doc.fontSize(20).text('DINAS LINGKUNGAN HIDUP', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text('Sertifikat Registrasi Lingkungan Digital', { align: 'center', characterSpacing: 2 });
    doc.moveDown(1);
    
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(2);

    doc.fontSize(14).font('Helvetica-Bold').text('SURAT BUKTI REGISTRASI LINGKUNGAN', { align: 'center', underline: true });
    doc.fontSize(10).font('Helvetica').text(`Nomor: REG/LH/${company.nib}/${new Date().getFullYear()}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11).text('Berdasarkan Undang-Undang Perlindungan dan Pengelolaan Lingkungan Hidup, Dinas Lingkungan Hidup menyatakan bahwa pelaku usaha di bawah ini:', { align: 'justify' });
    doc.moveDown(1);

    const startX = 50;
    const valueX = 200;

    const drawRow = (label: string, value: string) => {
      doc.font('Helvetica-Bold').text(label, startX, doc.y, { width: 140 });
      doc.font('Helvetica').text(`: ${value}`, valueX, doc.y - doc.currentLineHeight());
      doc.moveDown(0.5);
    };

    drawRow('Nama Perusahaan', company.companyName);
    drawRow('Nomor Induk Berusaha', company.nib);
    drawRow('Alamat Usaha', company.address);
    drawRow('Dokumen Lingkungan', `${company.docType} (Rekomendasi Penapisan)`);
    
    doc.moveDown(2);
    doc.font('Helvetica').text('Telah terdaftar dalam sistem pengawasan lingkungan PANTAU LIMBAH dengan kewajiban melakukan pelaporan logbook limbah berkala, mematuhi parameter kepatuhan TPS B3, dan bersedia dilakukan inspeksi berkala.', { align: 'justify' });

    doc.moveDown(4);

    const sigX = 300;
    doc.fontSize(10).font('Helvetica-Bold').text('Kepala Dinas Lingkungan Hidup', sigX, doc.y, { align: 'center', width: 245 });
    doc.moveDown(4);
    doc.fontSize(11).font('Helvetica-Bold').text('Dr. Ir. H. Ahmad Heryawan, M.Si.', sigX, doc.y, { align: 'center', underline: true, width: 245 });
    doc.fontSize(9).font('Helvetica').text('NIP. 19720315 199803 1 002', sigX, doc.y, { align: 'center', width: 245 });

    doc.end();

  } catch (error) {
    console.error('Download certificate error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
