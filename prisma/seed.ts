// prisma/seed.ts
import {
  PrismaClient,
  UserRole,
  CompanyStatus,
  DocType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { companiesMasterData } from './data/companiesMaster';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');

  // =================================================================================
  // URUTAN PENGOSONGAN DATA (Integritas Konstrain):
  // 1. CitizenReport di-decouple sepenuhnya, sehingga aman dihapus kapan saja.
  // 2. Inspection wajib dihapus SEBELUM Company karena ada aturan onDelete: Restrict.
  // 3. Seluruh detail transaksi (Invoice, PickupRequest, WasteLog) dibersihkan.
  // 4. Company dihapus sebelum User (PIC) dibersihkan.
  // =================================================================================
  await prisma.citizenReport.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.pickupRequest.deleteMany();
  await prisma.wasteLog.deleteMany();
  await prisma.company.deleteMany();
  await prisma.systemNotification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding roles and users...');
  const saltRounds = 10;

  const superPassword = await bcrypt.hash('password123', saltRounds);
  const adminPassword = await bcrypt.hash('password123', saltRounds);
  const auditorPassword = await bcrypt.hash('password123', saltRounds);
  const officerPassword = await bcrypt.hash('password123', saltRounds);
  const budiPassword = await bcrypt.hash('password123', saltRounds);
  const transporterPassword = await bcrypt.hash('password123', saltRounds);

  // 1. Seed Akun Pengguna (System Users)
  await prisma.user.create({
    data: {
      name: 'Super Administrator',
      email: 'sa@geocitra.com',
      password: superPassword,
      role: UserRole.SUPER_ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      name: 'Admin Verifikator DLH',
      email: 'dlh@geocitra.com',
      password: adminPassword,
      role: UserRole.ADMIN_DLH,
    },
  });

  await prisma.user.create({
    data: {
      name: 'Kepala Dinas Lingkungan Hidup',
      email: 'auditor@geocitra.com',
      password: auditorPassword,
      role: UserRole.AUDITOR,
    },
  });

  await prisma.user.create({
    data: {
      name: 'Heryanto, S.T.',
      email: 'petugas@geocitra.com',
      password: officerPassword,
      role: UserRole.PETUGAS_LAPANGAN,
      officerId: 'OFF-001',
    },
  });

  await prisma.user.create({
    data: {
      id: 'USER-005',
      name: 'Budi Santoso',
      email: 'user@geocitra.com',
      password: budiPassword,
      role: UserRole.PERUSAHAAN,
      companyId: 'COM-001', // singular fallback
    },
  });

  await prisma.user.create({
    data: {
      name: 'PT. Transport Limbah Indonesia',
      email: 'transporter@geocitra.com',
      password: transporterPassword,
      role: UserRole.PENGANGKUT,
    },
  });

  console.log('Seeding companies and spatial data (Kotawaringin Timur)...');

  // 2. SEED ENTITAS TIRUAN: Null Object Pattern (COM-UNKNOWN)
  await prisma.company.create({
    data: {
      id: 'COM-UNKNOWN',
      companyName: 'Penyelidikan Lapangan (Pelanggar Belum Diketahui)',
      nib: '0000000000000',
      npwp: '00.000.000.0-000.000',
      picName: 'Dinas Lingkungan Hidup',
      picPhone: '00000000000',
      picRole: 'Dinas',
      investmentType: 'PMDN',
      yearBuilt: '2026',
      buildingArea: 0.0,
      operationalHours: '24 Jam',
      rawMaterials: '-',
      waterSource: '-',
      powerSource: '-',
      kbli: '00000',
      investment: 0.0,
      landArea: 0.0,
      employees: 0,
      lat: '-2.5337',
      lng: '112.9515',
      address: 'Lokasi Belum Teridentifikasi (Kotawaringin Timur)',
      docType: DocType.SPPL,
      status: CompanyStatus.APPROVED,
    },
  });

  // 3. Iterasi Injeksi Database via Modul Eksternal
  for (const comp of companiesMasterData) {
    await prisma.company.create({
      data: comp,
    });
  }

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });