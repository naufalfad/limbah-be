// prisma/seed.ts
import {
  PrismaClient,
  UserRole,
  CompanyStatus,
  DocType,
  SourceType,
  StationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { companiesMasterData } from './data/companiesMaster';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');

  // =================================================================================
  // URUTAN PENGOSONGAN DATA (Integritas Konstrain):
  // 1. Bersihkan tabel log kualitas air dan stasiun air pemantau baru.
  // 2. CitizenReport di-decouple sepenuhnya, sehingga aman dihapus kapan saja.
  // 3. Inspection wajib dihapus SEBELUM Company karena ada aturan onDelete: Restrict.
  // 4. Seluruh detail transaksi (Invoice, PickupRequest, WasteLog) dibersihkan.
  // 5. Company dihapus sebelum User (PIC) dibersihkan.
  // =================================================================================
  await prisma.waterTelemetryLog.deleteMany();
  await prisma.waterStationBaseline.deleteMany(); // Bersihkan data baseline terlebih dahulu
  await prisma.waterStation.deleteMany();
  await prisma.citizenReport.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.pickupRequest.deleteMany();
  await prisma.wasteLog.deleteMany();
  await prisma.company.deleteMany();
  await prisma.systemNotification.deleteMany();
  await prisma.aqiCache.deleteMany(); // SINKRONISASI CACHE UDARA
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

  console.log('Seeding companies and spatial data (Kabupaten Bogor)...');

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
      lat: '-6.4816', // Relokasi pusat koordinat ke Cibinong
      lng: '106.8560',
      address: 'Lokasi Belum Teridentifikasi (Kabupaten Bogor)',
      docType: DocType.SPPL,
      status: CompanyStatus.APPROVED,
      companyPhotoUrl: null, // Skenario tak terpetakan tidak memiliki visualisasi foto bawaan
    },
  });

  // 3. Iterasi Injeksi Database via Modul Eksternal (Menyertakan companyPhotoUrl baru)
  for (const comp of companiesMasterData) {
    await prisma.company.create({
      data: comp,
    });
  }

  // =================================================================================
  // [NEW SEEDER INTEGRATION] PEMBACAAN DAN SINKRONISASI DATA RIIL JSON (BOD/COD/DO/pH) [3]
  // =================================================================================
  console.log('Reading and validating real-world hydrological baselines from JSON...');

  const normalsFilePath = path.join(__dirname, 'data', 'bogor-river-normals.json');
  if (!fs.existsSync(normalsFilePath)) {
    throw new Error(`CRITICAL DATABASE INITIALIZATION ERROR: Berkas data dasar spasial perairan "${normalsFilePath}" tidak ditemukan!`);
  }

  const rawJsonData = fs.readFileSync(normalsFilePath, 'utf-8');
  const stationsData = JSON.parse(rawJsonData);

  console.log(`Seeding ${stationsData.length} calibrated water quality stations and monthly baselines...`);

  for (const st of stationsData) {
    // 1. Buat master data stasiun pemantau air sungai
    await prisma.waterStation.create({
      data: {
        id: st.id,
        name: st.name,
        lat: st.lat,
        lng: st.lng,
        subdistrictCode: st.subdistrictCode,
        sourceType: st.sourceType as SourceType,
        status: st.status as StationStatus
      }
    });

    // 2. Suntikkan baseline dan log bulanan historis berbasis data laboratorium ilmiah riil
    for (const mData of st.months) {
      // A. Masukkan ke tabel penampung data baseline statis iklim & air (Henry's Law & Dilution Standards)
      await prisma.waterStationBaseline.create({
        data: {
          stationId: st.id,
          month: mData.month,
          bod: mData.bod,
          cod: mData.cod,
          do: mData.do,
          ph: mData.ph,
          avgTemperature: mData.avgTemperature,
          avgRainfallMm: mData.avgRainfallMm
        }
      });

      // B. Masukkan ke tabel logs pelaporan historis agar grafik Recharts terisi rapi secara dinamis
      await prisma.waterTelemetryLog.create({
        data: {
          stationId: st.id,
          month: mData.month,
          bod: mData.bod,
          cod: mData.cod,
          do: mData.do,
          ph: mData.ph
        }
      });
    }
  }

  console.log('Database seeding completed successfully with authenticated local baselines!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });