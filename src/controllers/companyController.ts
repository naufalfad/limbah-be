// src/controllers/companyController.ts
import { Request, Response } from 'express';
import { PrismaClient, CompanyStatus, DocType, UserRole, NotificationType, InvoiceType, InvoiceStatus } from '@prisma/client';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { parseExcelBuffer } from '../utils/excelParser';
import fs from 'fs';
import path from 'path';

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
    const docTemplateUrl = files?.['docTemplate']?.[0]
      ? `/uploads/companies/${files['docTemplate'][0].filename}`
      : null;
    const companyPhotoUrl = files?.['companyPhoto']?.[0]
      ? `/uploads/companies/${files['companyPhoto'][0].filename}`
      : null;

    let parsedTemplateData: any = null;
    if (docType === DocType.UKL_UPL && files?.['docTemplate']?.[0]) {
      try {
        const fileBuffer = fs.readFileSync(files['docTemplate'][0].path);
        parsedTemplateData = await parseExcelBuffer(fileBuffer);
      } catch (parseErr) {
        console.error('Gagal mengurai template Excel pada saat upload:', parseErr);
      }
    }

    const company = await prisma.company.create({
      data: {
        ...data,
        docType,
        status: CompanyStatus.PENDING,
        picId: req.user.id,
        ...(docNibUrl && { docNibUrl }),
        ...(docNpwpUrl && { docNpwpUrl }),
        ...(docSiteplanUrl && { docSiteplanUrl }),
        ...(docTemplateUrl && { docTemplateUrl }),
        ...(companyPhotoUrl && { companyPhotoUrl }), // Menyimpan lokasi path foto industri ke database
        ...(parsedTemplateData && { parsedTemplateData }),
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

    let certificateActiveUntil = company.certificateActiveUntil;
    if (status === CompanyStatus.APPROVED && company.status !== CompanyStatus.APPROVED) {
      // Calculate active period (1 year from now)
      const activeUntilDate = new Date();
      activeUntilDate.setFullYear(activeUntilDate.getFullYear() + 1);
      certificateActiveUntil = activeUntilDate.toISOString().split('T')[0];
    }

    const updatedCompany = await prisma.company.update({
      where: { id },
      data: {
        status,
        ...(certificateActiveUntil && { certificateActiveUntil })
      },
    });

    if (status === CompanyStatus.APPROVED && company.status !== CompanyStatus.APPROVED) {
      // Auto-generate retribusi invoice
      const isUklUpl = updatedCompany.docType === DocType.UKL_UPL;
      const invoiceAmount = isUklUpl ? 1500000 : 750000;
      const invoiceType = isUklUpl ? InvoiceType.Retribusi_UKL_UPL : InvoiceType.Retribusi_SPPL;

      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          companyId: id,
          type: invoiceType,
          status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.SETTLED] }
        }
      });

      if (!existingInvoice) {
        await prisma.invoice.create({
          data: {
            companyId: id,
            amount: invoiceAmount,
            type: invoiceType,
            status: InvoiceStatus.UNPAID,
            date: new Date().toISOString().split('T')[0],
          }
        });
      }
    }

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

    // Validasi Pembayaran Retribusi (Dihapus sesuai permintaan user)
    // Perusahaan dapat mengunduh sertifikat meskipun belum membayar tagihan.

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

export async function createRetribusiInvoice(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: { id }
    });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Strict ownership validation for PERUSAHAAN role
    if (req.user.role === UserRole.PERUSAHAAN && company.picId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this company' });
    }

    if (company.status !== CompanyStatus.APPROVED) {
      return res.status(400).json({ success: false, error: 'Company is not approved yet' });
    }

    const isUklUpl = company.docType === DocType.UKL_UPL;
    const invoiceType = isUklUpl ? InvoiceType.Retribusi_UKL_UPL : InvoiceType.Retribusi_SPPL;
    const amount = isUklUpl ? 1500000 : 500000;

    // Check if there is already an UNPAID retribusi invoice
    const existingUnpaidInvoice = await prisma.invoice.findFirst({
      where: {
        companyId: company.id,
        type: invoiceType,
        status: InvoiceStatus.UNPAID
      }
    });

    if (existingUnpaidInvoice) {
      return res.status(200).json({ success: true, invoice: existingUnpaidInvoice });
    }

    // Otherwise, create a new invoice
    const newInvoice = await prisma.invoice.create({
      data: {
        companyId: company.id,
        type: invoiceType,
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        status: InvoiceStatus.UNPAID
      }
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Membuat invoice retribusi baru untuk perusahaan ${company.companyName} (${id})`,
      },
    });

    return res.status(201).json({ success: true, invoice: newInvoice });
  } catch (error) {
    console.error('Create retribusi invoice error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function updateCompany(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // PIC validation
    if (req.user.role === UserRole.PERUSAHAAN && company.picId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this company' });
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

    // Extract uploaded files from Multer
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const docNibUrl = files?.['nibDoc']?.[0]
      ? `/uploads/companies/${files['nibDoc'][0].filename}`
      : company.docNibUrl; // keep old file if no new upload
    const docNpwpUrl = files?.['npwpDoc']?.[0]
      ? `/uploads/companies/${files['npwpDoc'][0].filename}`
      : company.docNpwpUrl; // keep old file if no new upload
    const docSiteplanUrl = files?.['siteplanDoc']?.[0]
      ? `/uploads/companies/${files['siteplanDoc'][0].filename}`
      : company.docSiteplanUrl; // keep old file if no new upload
    const docTemplateUrl = files?.['docTemplate']?.[0]
      ? `/uploads/companies/${files['docTemplate'][0].filename}`
      : company.docTemplateUrl; // keep old file if no new upload
    const companyPhotoUrl = files?.['companyPhoto']?.[0]
      ? `/uploads/companies/${files['companyPhoto'][0].filename}`
      : company.companyPhotoUrl; // keep old photo if no new upload

    let parsedTemplateData: any = company.parsedTemplateData;
    if (docType === DocType.UKL_UPL) {
      if (files?.['docTemplate']?.[0]) {
        try {
          const fileBuffer = fs.readFileSync(files['docTemplate'][0].path);
          parsedTemplateData = await parseExcelBuffer(fileBuffer);
        } catch (parseErr) {
          console.error('Gagal mengurai template Excel pada saat upload revisi:', parseErr);
        }
      }
    } else {
      parsedTemplateData = null;
    }

    const updatedCompany = await prisma.company.update({
      where: { id },
      data: {
        ...data,
        docType,
        status: CompanyStatus.PENDING, // Reset status to PENDING
        docNibUrl,
        docNpwpUrl,
        docSiteplanUrl,
        docTemplateUrl,
        companyPhotoUrl, // Melakukan update path foto profil industri
        parsedTemplateData,
      },
    });

    // Create system notification for Admin DLH
    await prisma.systemNotification.create({
      data: {
        title: 'Revisi Registrasi Perusahaan',
        message: `Perusahaan ${updatedCompany.companyName} telah mengirimkan revisi dokumen lingkungan ${docType} untuk diverifikasi ulang.`,
        type: NotificationType.INFO,
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Mengirimkan revisi data perusahaan: ${updatedCompany.companyName} (${id})`,
      },
    });

    return res.status(200).json({ success: true, company: updatedCompany });
  } catch (error: any) {
    console.error('Update company error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'NIB already registered' });
    }
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

const createManualAmdalSchema = z.object({
  companyName: z.string().min(2),
  activityName: z.string().min(2),
  address: z.string().min(5),
  lat: z.string(),
  lng: z.string(),
  envApprovalNo: z.string().min(2),
  envApprovalDate: z.string(),
  amdalNo: z.string().min(2),
  amdalYear: z.string().min(4),
  businessSector: z.string().min(2),
  status: z.string().optional(),
  nib: z.string().optional(),
  npwp: z.string().optional(),
});

export async function createManualAmdalCompany(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parsed = createManualAmdalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const data = parsed.data;

    // Extract uploaded files from Multer
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const docAndalUrl = files?.['andalDoc']?.[0]
      ? `/uploads/companies/${files['andalDoc'][0].filename}`
      : null;
    const docRklUrl = files?.['rklDoc']?.[0]
      ? `/uploads/companies/${files['rklDoc'][0].filename}`
      : null;
    const docRplUrl = files?.['rplDoc']?.[0]
      ? `/uploads/companies/${files['rplDoc'][0].filename}`
      : null;
    const docSkKelayakanUrl = files?.['skKelayakanDoc']?.[0]
      ? `/uploads/companies/${files['skKelayakanDoc'][0].filename}`
      : null;
    const docPersetujuanUrl = files?.['persetujuanDoc']?.[0]
      ? `/uploads/companies/${files['persetujuanDoc'][0].filename}`
      : null;
    const companyPhotoUrl = files?.['companyPhoto']?.[0]
      ? `/uploads/companies/${files['companyPhoto'][0].filename}`
      : null;

    // Strict File Validation
    if (!files || !files['andalDoc']?.[0] || !files['rklDoc']?.[0] || !files['rplDoc']?.[0]) {
      return res.status(400).json({ success: false, error: 'File ANDAL (PDF), Matriks RKL (Excel), dan Matriks RPL (Excel) wajib diunggah.' });
    }

    if (!docAndalUrl) {
      return res.status(400).json({ success: false, error: 'File ANDAL (PDF) wajib diunggah.' });
    }
    if (!docRklUrl) {
      return res.status(400).json({ success: false, error: 'File Matriks RKL (Excel) wajib diunggah.' });
    }
    if (!docRplUrl) {
      return res.status(400).json({ success: false, error: 'File Matriks RPL (Excel) wajib diunggah.' });
    }

    const isExcelMime = (mime: string) => [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ].includes(mime);

    if (!isExcelMime(files['rklDoc'][0].mimetype) || !isExcelMime(files['rplDoc'][0].mimetype)) {
      return res.status(400).json({ success: false, error: 'File Matriks RKL dan RPL harus berupa berkas Excel (.xlsx / .xls).' });
    }

    // Parse Excel matrices (RKL & RPL)
    let parsedRklData: any = null;
    try {
      const fileBuffer = fs.readFileSync(files['rklDoc'][0].path);
      parsedRklData = await parseExcelBuffer(fileBuffer);
    } catch (parseErr) {
      console.error('Gagal mengurai RKL Excel:', parseErr);
    }

    let parsedRplData: any = null;
    try {
      const fileBuffer = fs.readFileSync(files['rplDoc'][0].path);
      parsedRplData = await parseExcelBuffer(fileBuffer);
    } catch (parseErr) {
      console.error('Gagal mengurai RPL Excel:', parseErr);
    }

    // Set certificate validity period (1 year from now)
    const activeUntilDate = new Date();
    activeUntilDate.setFullYear(activeUntilDate.getFullYear() + 1);
    const certificateActiveUntil = activeUntilDate.toISOString().split('T')[0];

    // Auto-generate NIB if not provided
    const nib = data.nib || `NIB-AMD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const company = await prisma.company.create({
      data: {
        companyName: data.companyName,
        activityName: data.activityName,
        nib,
        npwp: data.npwp || '-',
        lat: data.lat,
        lng: data.lng,
        address: data.address,
        envApprovalNo: data.envApprovalNo,
        envApprovalDate: data.envApprovalDate,
        amdalNo: data.amdalNo,
        amdalYear: data.amdalYear,
        businessSector: data.businessSector,
        docType: DocType.AMDAL,
        status: (data.status as CompanyStatus) || CompanyStatus.APPROVED,
        certificateActiveUntil,

        docAndalUrl,
        docRklUrl,
        docRplUrl,
        docSkKelayakanUrl,
        docPersetujuanUrl,
        companyPhotoUrl,

        parsedRklData: parsedRklData ? (parsedRklData as any) : null,
        parsedRplData: parsedRplData ? (parsedRplData as any) : null,

        // Manual AMDAL fallbacks for required fields
        picName: 'Admin DLH Manual',
        picPhone: '-',
        picRole: 'Admin',
        investmentType: 'PMDN',
        yearBuilt: data.amdalYear || String(new Date().getFullYear()),
        buildingArea: 0,
        operationalHours: '-',
        rawMaterials: '-',
        waterSource: '-',
        powerSource: '-',
        kbli: '00000',
        investment: 0,
        landArea: 0,
        employees: 0,
      },
    });

    // Create system notification
    await prisma.systemNotification.create({
      data: {
        title: 'Registrasi AMDAL Manual',
        message: `Admin DLH telah mendaftarkan koordinat wajib AMDAL untuk ${company.companyName} secara manual.`,
        type: NotificationType.SUCCESS,
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        user: req.user.email,
        role: req.user.role,
        action: `Mendaftarkan perusahaan wajib AMDAL secara manual: ${company.companyName} (${company.id})`,
      },
    });

    return res.status(201).json({ success: true, company });
  } catch (error: any) {
    console.error('Create manual AMDAL company error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'NIB already registered' });
    }
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getCompanyPreview(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { type } = req.query; // 'rkl' or 'rpl'

    const company = await prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        companyName: true,
        docType: true,
        docTemplateUrl: true,
        docRklUrl: true,
        docRplUrl: true,
        parsedTemplateData: true,
        parsedRklData: true,
        parsedRplData: true,
        picId: true
      }
    });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Hubungkan isolasi multi-tenant bagi perwakilan perusahaan
    if (req.user.role === UserRole.PERUSAHAAN && company.picId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (company.docType === DocType.AMDAL) {
      if (type === 'rkl') {
        if (company.parsedRklData) {
          return res.status(200).json({ success: true, data: company.parsedRklData });
        }
        if (!company.docRklUrl) {
          return res.status(404).json({ success: false, error: 'Berkas RKL belum diunggah.' });
        }
        const filePath = path.join(process.cwd(), company.docRklUrl);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ success: false, error: 'Berkas RKL fisik tidak ditemukan di server.' });
        }
        const fileBuffer = fs.readFileSync(filePath);
        const parsedData = await parseExcelBuffer(fileBuffer);
        await prisma.company.update({
          where: { id },
          data: { parsedRklData: parsedData as any }
        });
        return res.status(200).json({ success: true, data: parsedData });
      } else if (type === 'rpl') {
        if (company.parsedRplData) {
          return res.status(200).json({ success: true, data: company.parsedRplData });
        }
        if (!company.docRplUrl) {
          return res.status(404).json({ success: false, error: 'Berkas RPL belum diunggah.' });
        }
        const filePath = path.join(process.cwd(), company.docRplUrl);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ success: false, error: 'Berkas RPL fisik tidak ditemukan di server.' });
        }
        const fileBuffer = fs.readFileSync(filePath);
        const parsedData = await parseExcelBuffer(fileBuffer);
        await prisma.company.update({
          where: { id },
          data: { parsedRplData: parsedData as any }
        });
        return res.status(200).json({ success: true, data: parsedData });
      } else {
        return res.status(400).json({ success: false, error: 'Spesifikasi matriks AMDAL (?type=rkl atau ?type=rpl) wajib ditentukan.' });
      }
    }

    if (company.docType !== DocType.UKL_UPL) {
      return res.status(400).json({ success: false, error: 'Preview terstruktur hanya didukung untuk berkas UKL-UPL (Excel).' });
    }

    // Cek jika data pratinjau sudah terurai di database
    if (company.parsedTemplateData) {
      return res.status(200).json({ success: true, data: company.parsedTemplateData });
    }

    // Skenario Fallback: Lazy Parsing untuk Berkas Lama (Legacy File)
    if (!company.docTemplateUrl) {
      return res.status(404).json({ success: false, error: 'Berkas template belum diunggah oleh perusahaan.' });
    }

    const absoluteFilePath = path.join(process.cwd(), company.docTemplateUrl);
    if (!fs.existsSync(absoluteFilePath)) {
      return res.status(404).json({ success: false, error: 'File Excel fisik tidak ditemukan di server.' });
    }

    // Lakukan parsing on-the-fly
    const fileBuffer = fs.readFileSync(absoluteFilePath);
    const parsedData = await parseExcelBuffer(fileBuffer);

    // Lakukan self-healing: Update database agar request berikutnya berjalan sangat cepat
    await prisma.company.update({
      where: { id },
      data: { parsedTemplateData: parsedData as any }
    });

    return res.status(200).json({ success: true, data: parsedData });
  } catch (error) {
    console.error('Get company preview error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}