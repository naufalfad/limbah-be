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

  // =================================================================================
  // URUTAN PENGOSONGAN DATA (Integritas Konstrain):
  // 
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
      name: 'Budi Santoso',
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
      // Titik Pusat Kota Sampit (Default)
      lat: '-2.5337',
      lng: '112.9515',
      address: 'Lokasi Belum Teridentifikasi (Kotawaringin Timur)',
      docType: DocType.SPPL,
      status: CompanyStatus.APPROVED,
    },
  });

  // 3. SEED PERUSAHAAN 1: Area Mentawa Baru Ketapang (Skor Bagus)
  await prisma.company.create({
    data: {
      id: 'COM-001',
      companyName: 'PT. Tekstil Mentaya',
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
      lat: '-2.5800',  // Koordinat area Telaga Baru / MB Ketapang
      lng: '112.9900',
      address: 'Jl. HM Arsyad KM 3, Mentawa Baru Ketapang, Kotawaringin Timur',
      docType: DocType.UKL_UPL,
      status: CompanyStatus.APPROVED,
      score: 85.0, // PATUH
      picId: 'USER-005',
    },
  });

  // 4. SEED PERUSAHAAN 2: Area Cempaga (Skor Kritis) - Agar Peta Auditor Punya Titik Merah
  await prisma.company.create({
    data: {
      id: 'COM-002',
      companyName: 'PT. Agro Sawit Lestari',
      nib: '8820301294112',
      npwp: '02.345.678.9-402.000',
      picName: 'Budi Santoso',
      picPhone: '08129876543',
      picRole: 'Manajer Pabrik',
      investmentType: 'PMA',
      yearBuilt: '2015',
      buildingArea: 15000.0,
      operationalHours: '24 Jam',
      rawMaterials: 'Kelapa Sawit (CPO)',
      waterSource: 'Sungai',
      powerSource: 'Genset Industri',
      kbli: '10431',
      investment: 25000000000.0,
      landArea: 50000.0,
      employees: 450,
      lat: '-2.2500',  // Koordinat area Cempaga
      lng: '113.0500',
      address: 'Jl. Tjilik Riwut KM 35, Kec. Cempaga, Kotawaringin Timur',
      docType: DocType.UKL_UPL, // Akan di-render kuning oleh Admin
      status: CompanyStatus.APPROVED,
      score: 45.0, // KRITIS (Akan di-render merah oleh Auditor)
      picId: 'USER-005',
    },
  });

  // 5. SEED PERUSAHAAN 3: Area Baamang (Skor Menengah)
  await prisma.company.create({
    data: {
      id: 'COM-003',
      companyName: 'Pabrik Kayu Lapis Jaya',
      nib: '7720301294553',
      npwp: '03.456.789.0-403.000',
      picName: 'Budi Santoso',
      picPhone: '08771234567',
      picRole: 'Pemilik',
      investmentType: 'PMDN',
      yearBuilt: '2020',
      buildingArea: 4000.0,
      operationalHours: '08:00 - 17:00',
      rawMaterials: 'Kayu Sengon, Lem Kimia',
      waterSource: 'Sumur Bor',
      powerSource: 'PLN 5500 VA',
      kbli: '16211',
      investment: 3000000000.0,
      landArea: 8000.0,
      employees: 85,
      lat: '-2.4900',  // Koordinat area Baamang (Dekat Bandara)
      lng: '112.9300',
      address: 'Jl. Tjilik Riwut KM 5, Kec. Baamang, Kotawaringin Timur',
      docType: DocType.SPPL,
      status: CompanyStatus.APPROVED,
      score: 68.0, // PERINGATAN (Akan di-render kuning oleh Auditor)
      picId: 'USER-005',
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