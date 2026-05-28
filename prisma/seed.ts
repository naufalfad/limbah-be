import {
  PrismaClient,
  UserRole,
  CompanyStatus,
  DocType,
  WasteLogStatus,
  PickupStatus,
  InvoiceType,
  InvoiceStatus,
  InspectionStatus,
  NotificationType
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');
  // Pengosongan data diatur berurutan untuk menghindari kegagalan integritas referensi (Foreign Key Constraint)
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
  const superAdmin = await prisma.user.create({
    data: {
      name: 'Super Administrator',
      email: 'sa@geocitra.com',
      password: superPassword,
      role: UserRole.SUPER_ADMIN,
    },
  });

  const adminDlh = await prisma.user.create({
    data: {
      name: 'Admin Verifikator DLH',
      email: 'dlh@geocitra.com',
      password: adminPassword,
      role: UserRole.ADMIN_DLH,
    },
  });

  const auditor = await prisma.user.create({
    data: {
      name: 'Kepala Dinas Lingkungan Hidup',
      email: 'auditor@geocitra.com',
      password: auditorPassword,
      role: UserRole.AUDITOR,
    },
  });

  const officer = await prisma.user.create({
    data: {
      name: 'Heryanto, S.T.',
      email: 'petugas@geocitra.com',
      password: officerPassword,
      role: UserRole.PETUGAS_LAPANGAN,
      officerId: 'OFF-001',
    },
  });

  const budi = await prisma.user.create({
    data: {
      id: 'USER-005',
      name: 'Budi (PT. Tekstil)',
      email: 'user@geocitra.com',
      password: budiPassword,
      role: UserRole.PERUSAHAAN,
      companyId: 'COM-001', // singular fallback
    },
  });

  const transporter = await prisma.user.create({
    data: {
      name: 'PT. Transport Limbah Indonesia',
      email: 'transporter@geocitra.com',
      password: transporterPassword,
      role: UserRole.PENGANGKUT,
    },
  });

  console.log('Seeding companies and placeholder entities...');

  // 2. SEED ENTITAS TIRUAN: Null Object Pattern (COM-UNKNOWN) [3]
  // Digunakan sebagai penampung sementara bagi penugasan inspeksi yang titik koordinatnya 
  // dilaporkan oleh warga tanpa diketahui nama perusahaannya saat proses triage [3].
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
      lat: '-6.9147',
      lng: '107.6098',
      address: 'Lokasi Belum Teridentifikasi',
      docType: DocType.SPPL,
      status: CompanyStatus.APPROVED,
    },
  });

  // 3. SEED PERUSAHAAN BUDI: PT. Tekstil Sejahtera (COM-001)
  // Berfungsi untuk sinkronisasi data master operasional antara FE dan BE
  await prisma.company.create({
    data: {
      id: 'COM-001',
      companyName: 'PT. Tekstil Sejahtera',
      nib: '9120301294821',
      npwp: '01.234.567.8-401.000',
      picName: 'Budi Santoso',
      picPhone: '08123456789',
      picRole: 'Direktur',
      investmentType: 'PMDN',
      yearBuilt: '2018',
      buildingArea: 2500.0,
      operationalHours: '24 Jam',
      rawMaterials: 'Kapas, Zat Pewarna Kimia',
      waterSource: 'PDAM & Sumur Bor',
      powerSource: 'PLN 150 kVA',
      kbli: '13111',
      investment: 8500000000.0,
      landArea: 6000.0,
      employees: 120,
      lat: '-6.9147',
      lng: '107.6098',
      address: 'Jl. Rancaekek KM 15, Kec. Cicadas, Bandung',
      docType: DocType.UKL_UPL,
      status: CompanyStatus.APPROVED,
      score: 85.0,
      picId: 'USER-005', // Terikat ke akun pengguna Budi (USER-005)
    },
  });

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