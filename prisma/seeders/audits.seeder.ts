import { PrismaClient } from '@prisma/client';

export async function seedAuditLogs(prisma: PrismaClient) {
  console.log('Seeding audit logs...');
  await prisma.auditLog.createMany({
    data: [
      { user: 'sa@geocitra.com', role: 'SUPER_ADMIN', action: 'Mengaktifkan kembali sertifikat izin PT. Coates Indonesia' },
      { user: 'dlh@geocitra.com', role: 'ADMIN_DLH', action: 'Menyetujui pendaftaran dokumen UKL-UPL PT. Ricky Putra Globalindo Tbk' },
      { user: 'petugas@geocitra.com', role: 'PETUGAS_LAPANGAN', action: 'Mengunggah Berita Acara Pemeriksaan (BAP) Inspeksi PT. Argha Karya Prima Industry Tbk' }
    ]
  });
}
