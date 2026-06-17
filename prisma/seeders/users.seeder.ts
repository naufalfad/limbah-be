import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedUsers(prisma: PrismaClient) {
  console.log('Seeding roles and users with fixed IDs...');
  const saltRounds = 10;
  const hashPassword = await bcrypt.hash('password123', saltRounds);

  await prisma.user.create({
    data: { id: 'USER-001', name: 'Super Administrator', email: 'sa@geocitra.com', password: hashPassword, role: UserRole.SUPER_ADMIN },
  });
  await prisma.user.create({
    data: { id: 'USER-002', name: 'Admin Verifikator DLH', email: 'dlh@geocitra.com', password: hashPassword, role: UserRole.ADMIN_DLH },
  });
  await prisma.user.create({
    data: { id: 'USER-003', name: 'Kepala Dinas Lingkungan Hidup', email: 'auditor@geocitra.com', password: hashPassword, role: UserRole.AUDITOR },
  });
  await prisma.user.create({
    data: { id: 'USER-004', name: 'Heryanto, S.T.', email: 'petugas@geocitra.com', password: hashPassword, role: UserRole.PETUGAS_LAPANGAN, officerId: 'OFF-001' },
  });
  await prisma.user.create({
    data: { id: 'USER-005', name: 'Budi Santoso', email: 'user@geocitra.com', password: hashPassword, role: UserRole.PERUSAHAAN, companyId: 'COM-001' },
  });
  await prisma.user.create({
    data: { id: 'USER-006', name: 'PT. Transport Limbah Indonesia', email: 'transporter@geocitra.com', password: hashPassword, role: UserRole.PENGANGKUT, transporterId: 'TRANS-001' },
  });
}
