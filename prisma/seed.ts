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
  await prisma.waterStation.deleteMany();
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
    },
  });

  // 3. Iterasi Injeksi Database via Modul Eksternal
  for (const comp of companiesMasterData) {
    await prisma.company.create({
      data: comp,
    });
  }

  // =================================================================================
  // [NEW SEEDER INTEGRATION] SEED STASIUN PEMANTAU AIR & LOG BULANAN (PP 22/2021)
  // =================================================================================
  console.log('Seeding Water Quality Monitoring Stations (Kab. Bogor)...');

  const stationsData = [
    { id: "WS-01", name: "Stasiun Hulu Ciliwung (Cisarua)", lat: "-6.6986", lng: "106.9430" },
    { id: "WS-02", name: "Stasiun Tengah Ciliwung (Katulampa)", lat: "-6.6163", lng: "106.8325" },
    { id: "WS-03", name: "Stasiun Hilir Cileungsi (Klapanunggal)", lat: "-6.3986", lng: "106.9680" },
    { id: "WS-04", name: "Stasiun Aliran Citeureup (Mayor Oking)", lat: "-6.4786", lng: "106.8530" }
  ];

  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  for (const st of stationsData) {
    // 1. Buat stasiun pemantau air induk
    await prisma.waterStation.create({
      data: {
        id: st.id,
        name: st.name,
        lat: st.lat,
        lng: st.lng,
        sourceType: SourceType.SIMULATED,
        status: StationStatus.ACTIVE
      }
    });

    // 2. Hasilkan log 12 bulan secara otomatis menggunakan kalkulasi hidrologi musiman
    for (let mIdx = 0; mIdx < months.length; mIdx++) {
      const monthName = months[mIdx];

      // Bulan kering / Musim Kemarau (Mei - Oktober / mIdx: 4 s/d 9)
      const isDrySeason = mIdx >= 4 && mIdx <= 9;

      // Variabel pengali noise acak untuk keaslian data (seed-safe)
      const noise = parseFloat((Math.sin(mIdx) * 0.15).toFixed(2));

      let bod = 0;
      let cod = 0;
      let dissolvedOxygen = 0;
      let ph = 7.0;

      // Model Pemetaan Karakteristik Aliran Sungai dari Hulu ke Hilir
      if (st.id === "WS-01") {
        // Hulu Ciliwung (Puncak, Cisarua) — Sangat jernih sepanjang tahun, debit air terjaga
        bod = isDrySeason ? parseFloat((1.7 + noise).toFixed(1)) : parseFloat((1.3 + noise).toFixed(1));
        cod = isDrySeason ? parseFloat((12.0 + noise * 10).toFixed(1)) : parseFloat((9.5 + noise * 5).toFixed(1));
        dissolvedOxygen = isDrySeason ? parseFloat((6.7 + noise).toFixed(1)) : parseFloat((7.1 + noise).toFixed(1));
        ph = isDrySeason ? parseFloat((7.2 + noise).toFixed(1)) : parseFloat((7.0 + noise).toFixed(1));
      }
      else if (st.id === "WS-02") {
        // Tengah Ciliwung (Katulampa) — Mulai melewati aktivitas pertanian & limpasan domestik ringan
        bod = isDrySeason ? parseFloat((2.6 + noise).toFixed(1)) : parseFloat((2.0 + noise).toFixed(1));
        cod = isDrySeason ? parseFloat((20.5 + noise * 10).toFixed(1)) : parseFloat((16.0 + noise * 5).toFixed(1));
        dissolvedOxygen = isDrySeason ? parseFloat((5.4 + noise).toFixed(1)) : parseFloat((6.2 + noise).toFixed(1));
        ph = isDrySeason ? parseFloat((6.8 + noise).toFixed(1)) : parseFloat((6.9 + noise).toFixed(1));
      }
      else if (st.id === "WS-03") {
        // Hilir Cileungsi (Klapanunggal) — Kritis! Padat pabrik, kemarau debit drop drastis = polusi pekat
        bod = isDrySeason ? parseFloat((5.5 + noise).toFixed(1)) : parseFloat((3.3 + noise).toFixed(1)); // Melebihi limit PP (3.0)
        cod = isDrySeason ? parseFloat((39.0 + noise * 15).toFixed(1)) : parseFloat((26.5 + noise * 8).toFixed(1)); // Melebihi limit PP (25.0)
        dissolvedOxygen = isDrySeason ? parseFloat((2.7 + noise).toFixed(1)) : parseFloat((4.3 + noise).toFixed(1)); // Oksigen drop drastis di bawah 4.0
        ph = isDrySeason ? parseFloat((5.4 + noise).toFixed(1)) : parseFloat((6.2 + noise).toFixed(1)); // Sedikit asam di musim kering
      }
      else {
        // Aliran Citeureup (Mayor Oking) — Sedang ke kritis di musim kemarau
        bod = isDrySeason ? parseFloat((3.9 + noise).toFixed(1)) : parseFloat((2.8 + noise).toFixed(1));
        cod = isDrySeason ? parseFloat((29.5 + noise * 12).toFixed(1)) : parseFloat((22.0 + noise * 6).toFixed(1));
        dissolvedOxygen = isDrySeason ? parseFloat((3.6 + noise).toFixed(1)) : parseFloat((4.6 + noise).toFixed(1));
        ph = isDrySeason ? parseFloat((6.4 + noise).toFixed(1)) : parseFloat((6.6 + noise).toFixed(1));
      }

      // Pastikan DO tidak bernilai negatif
      dissolvedOxygen = Math.max(0.1, dissolvedOxygen);

      await prisma.waterTelemetryLog.create({
        data: {
          stationId: st.id,
          month: monthName,
          bod,
          cod,
          do: dissolvedOxygen,
          ph
        }
      });
    }
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