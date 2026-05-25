import { PrismaClient, UserRole, CompanyStatus, DocType, WasteLogStatus, PickupStatus, InvoiceType, InvoiceStatus, InspectionStatus, NotificationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');
  await prisma.auditLog.deleteMany();
  await prisma.systemNotification.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.pickupRequest.deleteMany();
  await prisma.wasteLog.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding roles and users...');
  const saltRounds = 10;

  const superPassword = await bcrypt.hash('password123', saltRounds);
  const adminPassword = await bcrypt.hash('password123', saltRounds);
  const auditorPassword = await bcrypt.hash('password123', saltRounds);
  const officerPassword = await bcrypt.hash('password123', saltRounds);
  const budiPassword = await bcrypt.hash('password123', saltRounds);
  const transporterPassword = await bcrypt.hash('password123', saltRounds);

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
      // Hapus transporterId: 'TRANS-001' karena kita full migrasi ke UUID bawaan (id)
    },
  });

  console.log('Seeding companies...');
  const com1 = await prisma.company.create({
    data: {
      id: 'COM-001',
      companyName: 'PT. Tekstil Sejahtera',
      nib: '9120301294821',
      npwp: '01.234.567.8-401.000',
      picName: 'Budi',
      picPhone: '081234567890',
      picRole: 'Direktur Utama',
      investmentType: 'PMDN',
      yearBuilt: '2015',
      buildingArea: 2500,
      operationalHours: '08:00 - 17:00',
      rawMaterials: 'Serat Kapas, Pewarna Tekstil',
      waterSource: 'PDAM',
      powerSource: 'PLN',
      kbli: '13121',
      investment: 6000000000, // 6 Billion -> UKL-UPL
      landArea: 6000,
      employees: 150,
      lat: '-6.9147',
      lng: '107.6098',
      address: 'Jl. Rancaekek No. 12, Bandung',
      docType: DocType.UKL_UPL,
      status: CompanyStatus.APPROVED,
      score: 85,
      hasTps: true,
      picId: budi.id,
    },
  });

  const com2 = await prisma.company.create({
    data: {
      id: 'COM-002',
      companyName: 'Bengkel Jaya Motor',
      nib: '9120301294112',
      npwp: '02.345.678.9-402.000',
      picName: 'Budi',
      picPhone: '081234567890',
      picRole: 'Pemilik',
      investmentType: 'PMDN',
      yearBuilt: '2020',
      buildingArea: 200,
      operationalHours: '09:00 - 19:00',
      rawMaterials: 'Sparepart Motor, Oli',
      waterSource: 'Sumur Bor',
      powerSource: 'PLN',
      kbli: '45404',
      investment: 300000000, // 300 Million -> SPPL
      landArea: 300,
      employees: 5,
      lat: '-6.9034',
      lng: '107.6189',
      address: 'Jl. Suropati No. 45, Bandung',
      docType: DocType.SPPL,
      status: CompanyStatus.REVIEW,
      picId: budi.id, // Budi owns this too!
    },
  });

  const com3 = await prisma.company.create({
    data: {
      id: 'COM-003',
      companyName: 'Restoran Sunda Nikmat',
      nib: '9120301294553',
      npwp: '03.456.789.0-403.000',
      picName: 'Asep',
      picPhone: '087823456789',
      picRole: 'Manajer Operasional',
      investmentType: 'PMDN',
      yearBuilt: '2018',
      buildingArea: 800,
      operationalHours: '10:00 - 22:00',
      rawMaterials: 'Bahan Pangan, Minyak Goreng',
      waterSource: 'PDAM',
      powerSource: 'PLN',
      kbli: '56101',
      investment: 1200000000, // 1.2 Billion -> SPPL
      landArea: 1000,
      employees: 24,
      lat: '-6.8245',
      lng: '107.6190',
      address: 'Jl. Lembang No. 102, Bandung Barat',
      docType: DocType.SPPL,
      status: CompanyStatus.APPROVED,
      score: 90,
      picId: budi.id, // Budi owns this too to allow him to view in mock dashboard!
    },
  });

  const com4 = await prisma.company.create({
    data: {
      id: 'COM-004',
      companyName: 'Pabrik Kimia Farma',
      nib: '9120301294001',
      npwp: '01.111.222.3-401.000',
      picName: 'Rudi',
      picPhone: '081122334455',
      picRole: 'Kepala Pabrik',
      investmentType: 'PMA',
      yearBuilt: '2005',
      buildingArea: 15000,
      operationalHours: '24 Jam',
      rawMaterials: 'Bahan Baku Farmasi',
      waterSource: 'PDAM & Deep Well',
      powerSource: 'PLN & Generator',
      kbli: '21012',
      investment: 45000000000, // 45 Billion -> UKL-UPL
      landArea: 20000,
      employees: 500,
      lat: '-6.9388',
      lng: '107.6255',
      address: 'Kawasan Industri Gede Bage, Bandung',
      docType: DocType.UKL_UPL,
      status: CompanyStatus.APPROVED,
      score: 65,
      hasTps: true,
    },
  });

  console.log('Seeding waste logs...');
  await prisma.wasteLog.create({
    data: {
      companyId: com2.id,
      type: 'Oli Bekas',
      volume: 45,
      unit: 'L',
      date: '2026-05-15',
      method: 'Dinas',
      status: WasteLogStatus.Terverifikasi,
      note: 'Rutin bulanan bengkel',
    },
  });

  await prisma.wasteLog.create({
    data: {
      companyId: com1.id,
      type: 'Limbah Cair Kimia',
      volume: 120,
      unit: 'm³',
      date: '2026-05-18',
      method: 'Mandiri',
      status: WasteLogStatus.Proses_Verifikasi,
      note: 'Hasil netralisasi IPAL',
    },
  });

  await prisma.wasteLog.create({
    data: {
      companyId: com3.id,
      type: 'Minyak Jelantah',
      volume: 15,
      unit: 'L',
      date: '2026-05-19',
      method: 'Dinas',
      status: WasteLogStatus.Terjadwal_Pickup,
      note: 'Limbah dapur restoran',
    },
  });

  console.log('Seeding pickups and invoices...');
  // Pickup & Invoice 1 (Settled direct billing)
  const pick1 = await prisma.pickupRequest.create({
    data: {
      id: 'PICK-001',
      companyId: com2.id,
      wasteType: 'Oli Bekas',
      volume: '45 L',
      date: '2026-05-15',
      status: PickupStatus.PAID,
      transporterId: transporter.id,
      transporterName: transporter.name,
      cost: 450000,
      plateNo: 'D 9901 AB',
      driverName: 'Supriadi',
      invoiceId: 'INV-001',
      address: com2.address,
    },
  });

  await prisma.invoice.create({
    data: {
      id: 'INV-001',
      companyId: com2.id,
      type: InvoiceType.Pengangkutan,
      amount: 450000,
      date: '2026-05-15',
      status: InvoiceStatus.SETTLED,
    },
  });

  // Pickup & Invoice 2 (Unpaid, transporter priced)
  const pick2 = await prisma.pickupRequest.create({
    data: {
      id: 'PICK-002',
      companyId: com3.id,
      wasteType: 'Minyak Jelantah',
      volume: '15 L',
      date: '2026-05-19',
      status: PickupStatus.PRICED,
      transporterId: transporter.id,
      transporterName: transporter.name,
      cost: 150000,
      plateNo: 'D 8812 XY',
      driverName: 'Mulyono',
      invoiceId: 'INV-003',
      address: com3.address,
    },
  });

  await prisma.invoice.create({
    data: {
      id: 'INV-003',
      companyId: com3.id,
      type: InvoiceType.Pengangkutan,
      amount: 150000,
      date: '2026-05-19',
      status: InvoiceStatus.UNPAID,
    },
  });

  console.log('Seeding inspections...');
  // Completed inspection
  await prisma.inspection.create({
    data: {
      companyId: com1.id,
      inspectorId: 'OFF-001',
      inspectorName: 'Heryanto, S.T.',
      date: '2026-05-10',
      score: 85,
      status: InspectionStatus.Selesai,
      location: com1.address,
      notes: 'TPS B3 dan IPAL berfungsi dengan baik. APAR tersedia lengkap.',
      bapSigned: true,
      checklist: {
        tpsB3: true,
        ipal: true,
        apar: true,
        noise: false,
        safetyEquipment: true,
      },
    },
  });

  // Scheduled inspection
  await prisma.inspection.create({
    data: {
      companyId: com2.id,
      inspectorId: 'OFF-001',
      inspectorName: 'Heryanto, S.T.',
      date: '2026-05-25',
      status: InspectionStatus.Terjadwal,
      location: com2.address,
      notes: 'Pemeriksaan kelayakan TPS B3 skala mikro.',
    },
  });

  console.log('Seeding system notifications & audit logs...');
  await prisma.systemNotification.create({
    data: {
      title: 'Dokumen Lingkungan Baru Masuk',
      message: 'Perusahaan PT. Tekstil Maju mendaftarkan izin lingkungan baru.',
      type: NotificationType.INFO,
    },
  });

  await prisma.systemNotification.create({
    data: {
      title: 'EWS: Kapasitas Berlebih',
      message: 'Limbah cair kimia di PT. Tekstil Sejahtera melebihi ambang batas toleransi.',
      type: NotificationType.DANGER,
    },
  });

  await prisma.auditLog.create({
    data: {
      user: 'admin@dlh.go.id',
      role: 'ADMIN_DLH',
      action: 'Mengevaluasi dokumen lingkungan COM-001',
    },
  });

  console.log('Database seeding complete successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
