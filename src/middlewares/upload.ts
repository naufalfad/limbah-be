import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// --- DEFINISI DIREKTORI PENYIMPANAN (GRASP: High Cohesion) ---
const COMPANIES_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'companies');
const REPORTS_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'reports');

// Memastikan direktori penyimpanan tercipta secara otomatis saat server booting
if (!fs.existsSync(COMPANIES_UPLOAD_DIR)) {
  fs.mkdirSync(COMPANIES_UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(REPORTS_UPLOAD_DIR)) {
  fs.mkdirSync(REPORTS_UPLOAD_DIR, { recursive: true });
}

// --- CONFIG STORAGE 1: DOKUMEN PERUSAHAAN (LOW COUPLING) ---
const companyStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, COMPANIES_UPLOAD_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// --- CONFIG STORAGE 2: FOTO PENGADUAN WARGA (LOW COUPLING) ---
const reportStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, REPORTS_UPLOAD_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    // Hasil file: evidencePhotos-1716000000000-123456789.jpg
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// --- FILTER VALIDASI FORMAT (Anti-Hoax Security Layer) ---
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword' // .doc
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipe file tidak didukung: ${file.mimetype}. Hanya PDF, JPG, PNG, Excel (.xls/.xlsx), dan Word (.doc/.docx) yang diizinkan.`));
  }
};

// --- EXPORT MIDDLEWARE 1: DOKUMEN INDUSTRI (EXISTING) ---
export const companyDocUpload = multer({
  storage: companyStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
  },
}).fields([
  { name: 'nibDoc', maxCount: 1 },
  { name: 'npwpDoc', maxCount: 1 },
  { name: 'siteplanDoc', maxCount: 1 },
  { name: 'docTemplate', maxCount: 1 },
]);

// --- EXPORT MIDDLEWARE 2: MULTI-PHOTOS PENGADUAN WARGA (INJEKSI BARU) ---
// Menerima multiple files (array) dengan nama field 'evidencePhotos' maksimal 5 file.
export const citizenReportUpload = multer({
  storage: reportStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Pembatasan ketat 5 MB per berkas foto
  },
}).array('evidencePhotos', 5);