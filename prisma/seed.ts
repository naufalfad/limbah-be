// prisma/seed.ts
import {
  PrismaClient,
  UserRole,
  CompanyStatus,
  DocType,
  SourceType,
  StationStatus,
  ReportStatus,
  InspectionStatus,
  PickupStatus,
  InvoiceType,
  InvoiceStatus,
  NotificationType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { companiesMasterData } from './data/companiesMaster';

const prisma = new PrismaClient();

const dummyRklData = [
  {
    name: "Rencana Pengelolaan Lingkungan (RKL)",
    headers: ["No", "Sumber Dampak", "Jenis Dampak", "Tolak Ukur Pengelolaan", "Upaya Pengelolaan", "Lokasi Pengelolaan", "Periode Pengelolaan"],
    rows: [
      ["1", "Operasional Mesin Utama & Pabrik", "Kebisingan & Getaran", "Kebisingan maksimal 70 dB(A)", "Pemasangan peredam suara (silencer) pada mesin utama", "Area utilitas pabrik dan ruang genset", "Terus menerus selama operasional"],
      ["2", "Penyimpanan Bahan Kimia B3", "Ceceran Zat Kimia Korosif", "Nihil kontaminasi tanah", "Pembuatan tanggul penahan (bundwall) dan penyediaan spill kit", "Gudang penyimpanan B3 utama", "Setiap hari sebelum shift dimulai"],
      ["3", "Mobilisasi Truk Raw Material", "Debu di Akses Jalan Raya", "Debu TSP < 150 ug/Nm3", "Penyiraman jalan masuk pabrik & penutupan bak truk dengan terpal", "Jalan utama akses pemukiman Citeureup", "Pagi pukul 08:00 & sore pukul 16:00"]
    ]
  }
];

const dummyRplData = [
  {
    name: "Rencana Pemantauan Lingkungan (RPL)",
    headers: ["No", "Jenis Dampak Dipantau", "Indikator Kunci Pemantauan", "Metode & Parameter Pemantauan", "Lokasi Pemantauan", "Frekuensi Pemantauan", "Institusi Pengawas"],
    rows: [
      ["1", "Kebisingan area pemukiman warga", "Tingkat kebisingan dB(A)", "Pengukuran langsung menggunakan Sound Level Meter", "Batas pagar pabrik terdekat pemukiman", "Setiap 6 bulan sekali (Semester)", "DLH Kabupaten Bogor & Lab Mitra"],
      ["2", "Kualitas air limpasan drainase", "Kadar pH, COD, BOD, dan TSS", "Pengambilan sampel air outlet drainase utama", "Kolam retensi & titik pembuangan akhir", "Tiap 3 bulan sekali (Triwulan)", "DLH Kabupaten Bogor"],
      ["3", "Timbulan Limbah Medis B3", "Berat limbah medis (kg)", "Pencatatan manifes manifes manifest limbah B3", "Klinik K3 internal pabrik", "Setiap minggu (Logbook mingguan)", "Dinas Kesehatan & DLH Bogor"]
    ]
  }
];

const dummyTemplateData = [
  {
    name: "Matriks UKL-UPL",
    headers: ["No", "Sumber Dampak", "Upaya Pengelolaan (UKL)", "Upaya Pemantauan (UPL)", "Lokasi Pengelolaan & Pemantauan", "Institusi Penerima Laporan"],
    rows: [
      ["1", "Limbah Domestik Karyawan Kantor", "Pengolahan tangki septik bio-filter berkapasitas 5m3", "Pengecekan kualitas air efluen secara visual harian", "Area sanitasi gedung kantor utama", "Kecamatan & Puskesmas Citeureup"],
      ["2", "Limbah Oli Bekas Bengkel Rawat", "Penyimpanan di TPS Limbah B3 ber-izin resmi", "Pencatatan neraca logbook limbah B3 secara berkala", "TPS Limbah B3 internal pabrik", "DLH Kabupaten Bogor"],
      ["3", "Debu Bongkar Muat Semen", "Penyiraman air berkala dan pemakaian masker K3", "Pemantauan visual debu harian oleh pengawas lapangan", "Halaman pergudangan utama", "DLH & Dinas Perindustrian"]
    ]
  }
];

async function main() {
  console.log('Clearing database...');

  // URUTAN PENGOSONGAN DATA (Integritas Konstrain)
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
  await prisma.aqiCache.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding roles and users with fixed IDs...');
  const saltRounds = 10;
  const hashPassword = await bcrypt.hash('password123', saltRounds);

  // 1. Seed Akun Pengguna (System Users)
  await prisma.user.create({
    data: {
      id: 'USER-001',
      name: 'Super Administrator',
      email: 'sa@geocitra.com',
      password: hashPassword,
      role: UserRole.SUPER_ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      id: 'USER-002',
      name: 'Admin Verifikator DLH',
      email: 'dlh@geocitra.com',
      password: hashPassword,
      role: UserRole.ADMIN_DLH,
    },
  });

  await prisma.user.create({
    data: {
      id: 'USER-003',
      name: 'Kepala Dinas Lingkungan Hidup',
      email: 'auditor@geocitra.com',
      password: hashPassword,
      role: UserRole.AUDITOR,
    },
  });

  await prisma.user.create({
    data: {
      id: 'USER-004',
      name: 'Heryanto, S.T.',
      email: 'petugas@geocitra.com',
      password: hashPassword,
      role: UserRole.PETUGAS_LAPANGAN,
      officerId: 'OFF-001',
    },
  });

  await prisma.user.create({
    data: {
      id: 'USER-005',
      name: 'Budi Santoso',
      email: 'user@geocitra.com',
      password: hashPassword,
      role: UserRole.PERUSAHAAN,
      companyId: 'COM-001',
    },
  });

  await prisma.user.create({
    data: {
      id: 'USER-006',
      name: 'PT. Transport Limbah Indonesia',
      email: 'transporter@geocitra.com',
      password: hashPassword,
      role: UserRole.PENGANGKUT,
      transporterId: 'TRANS-001',
    },
  });

  console.log('Seeding null-object company...');
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
      lat: '-6.4816',
      lng: '106.8560',
      address: 'Lokasi Belum Teridentifikasi (Kabupaten Bogor)',
      docType: DocType.SPPL,
      status: CompanyStatus.APPROVED,
    },
  });

  console.log('Seeding enhanced companies with document paths and parsed matrices...');
  for (const comp of companiesMasterData) {
    let extraFields = {};
    if (comp.docType === DocType.AMDAL) {
      extraFields = {
        docAndalUrl: '/uploads/companies/andal-example.pdf',
        docRklUrl: '/uploads/companies/rkl-example.xlsx',
        docRplUrl: '/uploads/companies/rpl-example.xlsx',
        docSkKelayakanUrl: '/uploads/companies/sk-kelayakan-example.pdf',
        docPersetujuanUrl: '/uploads/companies/persetujuan-example.pdf',
        parsedRklData: dummyRklData,
        parsedRplData: dummyRplData,
      };
    } else {
      extraFields = {
        docTemplateUrl: '/uploads/companies/matrix-example.xlsx',
        parsedTemplateData: dummyTemplateData,
      };
    }

    // Default company photo fallback if missing
    const companyPhotoUrl = comp.companyPhotoUrl || '/uploads/companies/companyPhoto-example.jpg';

    // Remove direct picId/companyPhotoUrl overrides to avoid collision
    const { picId, ...compData } = comp;

    await prisma.company.create({
      data: {
        ...compData,
        ...extraFields,
        companyPhotoUrl,
        picId: 'USER-005', // Hubungkan PIC default ke Budi Santoso
      },
    });
  }

  console.log('Seeding citizen reports (Arsip Pengaduan)...');
  await prisma.citizenReport.createMany({
    data: [
      {
        id: 'CR-001',
        trackingId: 'REP-2026-001',
        reporterName: 'Dian Anggraeni',
        reporterContact: '081299887766',
        incidentType: 'Pembuangan Limbah Cair Hitam di Sungai Cileungsi',
        description: 'Melihat adanya saluran siluman dari arah kawasan industri yang membuang limbah berwarna hitam pekat dan berbau menyengat ke Sungai Cileungsi pada malam hari sekitar jam 23:00.',
        lat: '-6.3986',
        lng: '106.9680',
        evidencePhoto: '["/uploads/reports/citizen-report-example.jpg"]',
        status: ReportStatus.VERIFIED,
        adminNotes: 'Laporan valid, terverifikasi oleh tim DLH melalui foto. Sudah dijadwalkan surat perintah inspeksi.',
      },
      {
        id: 'CR-002',
        trackingId: 'REP-2026-002',
        reporterName: 'Hasan Basri',
        reporterContact: '087788990011',
        incidentType: 'Pembakaran Terbuka Limbah Plastik / Karet',
        description: 'Pembakaran sisa kemasan plastik dan karet di area belakang pabrik yang menimbulkan asap hitam tebal dan mengganggu pernapasan warga perumahan sekitar.',
        lat: '-6.4950',
        lng: '106.8710',
        evidencePhoto: '["/uploads/reports/citizen-report-example.jpg"]',
        status: ReportStatus.INVESTIGATING,
        adminNotes: 'Sedang ditindaklanjuti oleh petugas lapangan Heryanto, S.T. untuk BAP di lokasi.',
      },
      {
        id: 'CR-003',
        trackingId: 'REP-2026-003',
        reporterName: 'Anonim',
        reporterContact: '-',
        incidentType: 'Penumpukan Drum Limbah B3 di Lahan Terbuka',
        description: 'Ada penumpukan puluhan drum besi berkarat dengan simbol tengkorak (Limbah B3) diletakkan di tanah kosong tanpa atap dan tanpa pengaman bundwall.',
        lat: '-6.4520',
        lng: '106.9210',
        evidencePhoto: '["/uploads/reports/citizen-report-example.jpg"]',
        status: ReportStatus.RESOLVED,
        adminNotes: 'Inspeksi sudah dilakukan, perusahaan diberikan sanksi denda administrasi dan diperintahkan memindahkan drum ke TPS B3 berizin resmi.',
      },
      {
        id: 'CR-004',
        trackingId: 'REP-2026-004',
        reporterName: 'Budi Harto',
        reporterContact: '085522334455',
        incidentType: 'Tumpahan Oli Bekas di Selokan Drainase Umum',
        description: 'Terdapat ceceran oli bekas pelumas dari bengkel industri yang masuk ke saluran air hujan warga.',
        lat: '-6.4020',
        lng: '106.9180',
        evidencePhoto: '["/uploads/reports/citizen-report-example.jpg"]',
        status: ReportStatus.PENDING,
        adminNotes: null,
      }
    ]
  });

  console.log('Seeding inspections...');
  await prisma.inspection.createMany({
    data: [
      {
        id: 'INSP-001',
        companyId: 'COM-001',
        inspectorId: 'USER-004',
        inspectorName: 'Heryanto, S.T.',
        date: '2026-05-10',
        score: 85.0,
        status: InspectionStatus.Selesai,
        location: 'Kawasan Pabrik Indocement',
        notes: 'Pengelolaan limbah B3 sangat baik. TPS B3 memiliki bundwall yang memadai, pencatatan logbook tertib, dan IPAL beroperasi dengan parameter di bawah baku mutu.',
        photo: '/uploads/inspections/inspect-example.jpg',
        bapSigned: true,
        checklist: { tpsB3: true, ipal: true, apar: true, noise: true, safetyEquipment: true },
      },
      {
        id: 'INSP-002',
        companyId: 'COM-003',
        inspectorId: 'USER-004',
        inspectorName: 'Heryanto, S.T.',
        date: '2026-06-01',
        score: 45.0,
        status: InspectionStatus.Selesai,
        location: 'Gudang Belakang & TPS Argha Karya',
        notes: 'TPS B3 penuh sesak melebihi kapasitas (overload). Terjadi ceceran oli bekas di tanah tanpa penanganan cepat, APAR kedaluwarsa, dan logbook neraca limbah kosong sejak 2 bulan terakhir.',
        photo: '/uploads/inspections/inspect-example.jpg',
        bapSigned: true,
        checklist: { tpsB3: false, ipal: true, apar: false, noise: true, safetyEquipment: false },
      },
      {
        id: 'INSP-003',
        companyId: 'COM-012',
        inspectorId: 'USER-004',
        inspectorName: 'Heryanto, S.T.',
        date: '2026-06-25',
        score: null,
        status: InspectionStatus.Terjadwal,
        location: 'Area IPAL & TPS Aspex Kumbong',
        notes: 'Inspeksi rutin berkala peninjauan pembuangan air limbah sungai Cileungsi.',
        photo: null,
        bapSigned: false,
      }
    ]
  });

  console.log('Seeding waste logs...');
  await prisma.wasteLog.createMany({
    data: [
      {
        companyId: 'COM-001',
        type: 'Oli Bekas Mesin Sintering',
        volume: 200.0,
        unit: 'L',
        date: '2026-06-05',
        method: 'Dinas',
        status: 'Terverifikasi',
        note: 'Telah dimasukkan ke dalam drum steel TPS B3',
      },
      {
        companyId: 'COM-001',
        type: 'Sludge IPAL Pabrik',
        volume: 1.5,
        unit: 'm³',
        date: '2026-06-10',
        method: 'Dinas',
        status: 'Proses_Verifikasi',
        note: 'Limbah cake kering dari filter press IPAL',
      },
      {
        companyId: 'COM-003',
        type: 'Aki Bekas Forklift',
        volume: 120.0,
        unit: 'kg',
        date: '2026-06-02',
        method: 'Mandiri',
        status: 'Terverifikasi',
        note: 'Penyimpanan di rak khusus limbah korosif',
      },
      {
        companyId: 'COM-003',
        type: 'Kemasan Bekas Bahan Kimia',
        volume: 50.0,
        unit: 'kg',
        date: '2026-06-12',
        method: 'Dinas',
        status: 'Terjadwal_Pickup',
        note: 'Drum plastik kosong kontaminan kimia',
      }
    ]
  });

  console.log('Seeding pickup requests...');
  await prisma.pickupRequest.createMany({
    data: [
      {
        id: 'REQ-001',
        companyId: 'COM-001',
        wasteType: 'Oli Bekas Mesin Sintering',
        volume: '200 L',
        date: '2026-06-08',
        status: PickupStatus.COMPLETED,
        transporterId: 'USER-006',
        transporterName: 'PT. Transport Limbah Indonesia',
        cost: 450000.0,
        plateNo: 'B 9123 SFY',
        driverName: 'Ahmad Rifai',
        evidencePhoto: '/uploads/pickups/pickup-example.jpg',
        invoiceId: 'INV-2026-001',
        address: 'Jl. Mayor Oking No. 1, Citeureup, Kabupaten Bogor',
        actualVolume: '200 L',
        transportReport: 'Limbah terangkut penuh, tidak ada kebocoran selama perjalanan.',
      },
      {
        id: 'REQ-002',
        companyId: 'COM-003',
        wasteType: 'Kemasan Bekas Bahan Kimia',
        volume: '50 kg',
        date: '2026-06-15',
        status: PickupStatus.ON_THE_ROAD,
        transporterId: 'USER-006',
        transporterName: 'PT. Transport Limbah Indonesia',
        cost: 150000.0,
        plateNo: 'B 9845 TUI',
        driverName: 'Slamet Santoso',
        evidencePhoto: null,
        invoiceId: 'INV-2026-002',
        address: 'Jl. Pahlawan, Karang Asem Barat, Citeureup, Kabupaten Bogor',
        actualVolume: null,
        transportReport: null,
      },
      {
        id: 'REQ-003',
        companyId: 'COM-005',
        wasteType: 'Sludge Cat Oven',
        volume: '1.2 m³',
        date: '2026-06-20',
        status: PickupStatus.PENDING,
        transporterId: null,
        transporterName: null,
        cost: null,
        plateNo: null,
        driverName: null,
        evidencePhoto: null,
        invoiceId: null,
        address: 'Jl. Mercedes-Benz, Cicadas, Gunung Putri, Kabupaten Bogor',
        actualVolume: null,
        transportReport: null,
      }
    ]
  });

  console.log('Seeding invoices...');
  await prisma.invoice.createMany({
    data: [
      {
        id: 'INV-2026-001',
        companyId: 'COM-001',
        type: InvoiceType.Pengangkutan,
        amount: 450000.0,
        date: '2026-06-08',
        status: InvoiceStatus.SETTLED,
      },
      {
        id: 'INV-2026-002',
        companyId: 'COM-003',
        type: InvoiceType.Pengangkutan,
        amount: 150000.0,
        date: '2026-06-15',
        status: InvoiceStatus.UNPAID,
      },
      {
        id: 'INV-2026-003',
        companyId: 'COM-009',
        type: InvoiceType.Retribusi_SPPL,
        amount: 250000.0,
        date: '2026-06-10',
        status: InvoiceStatus.UNPAID,
      }
    ]
  });

  console.log('Seeding system notifications...');
  await prisma.systemNotification.createMany({
    data: [
      {
        title: 'Inspeksi Baru Ditugaskan',
        message: 'Petugas Heryanto, S.T. telah ditugaskan untuk melakukan inspeksi di PT. Aspex Kumbong pada 25 Juni 2026.',
        type: NotificationType.INFO,
        read: false,
      },
      {
        title: 'Laporan Pengaduan Terverifikasi',
        message: 'Laporan warga Dian Anggraeni tentang pencemaran air sungai Cileungsi telah diverifikasi oleh Admin DLH.',
        type: NotificationType.SUCCESS,
        read: true,
      },
      {
        title: 'Skor ESG Rendah Terdeteksi',
        message: 'PT. Argha Karya Prima Industry Tbk mendapatkan skor inspeksi 45.0 (di bawah batas aman 60). Diperlukan inspeksi ulang!',
        type: NotificationType.WARNING,
        read: false,
      }
    ]
  });

  console.log('Seeding audit logs...');
  await prisma.auditLog.createMany({
    data: [
      {
        user: 'sa@geocitra.com',
        role: 'SUPER_ADMIN',
        action: 'Mengaktifkan kembali sertifikat izin PT. Coates Indonesia',
      },
      {
        user: 'dlh@geocitra.com',
        role: 'ADMIN_DLH',
        action: 'Menyetujui pendaftaran dokumen UKL-UPL PT. Ricky Putra Globalindo Tbk',
      },
      {
        user: 'petugas@geocitra.com',
        role: 'PETUGAS_LAPANGAN',
        action: 'Mengunggah Berita Acara Pemeriksaan (BAP) Inspeksi PT. Argha Karya Prima Industry Tbk',
      }
    ]
  });

  console.log('Seeding AQI simulation caches...');
  await prisma.aqiCache.createMany({
    data: [
      {
        clusterId: 'cluster-citeureup',
        name: 'Kawasan Industri Citeureup',
        lat: '-6.4862',
        lng: '106.8833',
        aqi: 142,
        weather: { temp: 31, humidity: 68, wind: 12, pressure: 1010 },
        source: 'simulation',
      },
      {
        clusterId: 'cluster-cileungsi',
        name: 'Zona Manufaktur Cileungsi',
        lat: '-6.3919',
        lng: '106.9558',
        aqi: 158,
        weather: { temp: 32, humidity: 65, wind: 14, pressure: 1009 },
        source: 'simulation',
      },
      {
        clusterId: 'cluster-sentul',
        name: 'Sentul & Babakan Madang',
        lat: '-6.5096',
        lng: '106.8552',
        aqi: 85,
        weather: { temp: 29, humidity: 72, wind: 10, pressure: 1011 },
        source: 'simulation',
      }
    ]
  });

  console.log('Seeding Water Quality Monitoring Stations (Kab. Bogor)...');
  const stationsData = [
    { id: "WS-01", name: "Stasiun Hulu Ciliwung (Cisarua)", lat: "-6.6986", lng: "106.9430" },
    { id: "WS-02", name: "Stasiun Tengah Ciliwung (Katulampa)", lat: "-6.6163", lng: "106.8325" },
    { id: "WS-03", name: "Stasiun Hilir Cileungsi (Klapanunggal)", lat: "-6.3986", lng: "106.9680" },
    { id: "WS-04", name: "Stasiun Aliran Citeureup (Mayor Oking)", lat: "-6.4786", lng: "106.8530" }
  ];

  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  for (const st of stationsData) {
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

    for (let mIdx = 0; mIdx < months.length; mIdx++) {
      const monthName = months[mIdx];
      const isDrySeason = mIdx >= 4 && mIdx <= 9;
      const noise = parseFloat((Math.sin(mIdx) * 0.15).toFixed(2));

      let bod = 0;
      let cod = 0;
      let dissolvedOxygen = 0;
      let ph = 7.0;

      if (st.id === "WS-01") {
        bod = isDrySeason ? parseFloat((1.7 + noise).toFixed(1)) : parseFloat((1.3 + noise).toFixed(1));
        cod = isDrySeason ? parseFloat((12.0 + noise * 10).toFixed(1)) : parseFloat((9.5 + noise * 5).toFixed(1));
        dissolvedOxygen = isDrySeason ? parseFloat((6.7 + noise).toFixed(1)) : parseFloat((7.1 + noise).toFixed(1));
        ph = isDrySeason ? parseFloat((7.0 + noise).toFixed(1)) : parseFloat((7.0 + noise).toFixed(1));
      }
      else if (st.id === "WS-02") {
        bod = isDrySeason ? parseFloat((2.6 + noise).toFixed(1)) : parseFloat((2.0 + noise).toFixed(1));
        cod = isDrySeason ? parseFloat((20.5 + noise * 10).toFixed(1)) : parseFloat((16.0 + noise * 5).toFixed(1));
        dissolvedOxygen = isDrySeason ? parseFloat((5.4 + noise).toFixed(1)) : parseFloat((6.2 + noise).toFixed(1));
        ph = isDrySeason ? parseFloat((6.8 + noise).toFixed(1)) : parseFloat((6.9 + noise).toFixed(1));
      }
      else if (st.id === "WS-03") {
        bod = isDrySeason ? parseFloat((5.5 + noise).toFixed(1)) : parseFloat((3.3 + noise).toFixed(1));
        cod = isDrySeason ? parseFloat((39.0 + noise * 15).toFixed(1)) : parseFloat((26.5 + noise * 8).toFixed(1));
        dissolvedOxygen = isDrySeason ? parseFloat((2.7 + noise).toFixed(1)) : parseFloat((4.3 + noise).toFixed(1));
        ph = isDrySeason ? parseFloat((5.4 + noise).toFixed(1)) : parseFloat((6.2 + noise).toFixed(1));
      }
      else {
        bod = isDrySeason ? parseFloat((3.9 + noise).toFixed(1)) : parseFloat((2.8 + noise).toFixed(1));
        cod = isDrySeason ? parseFloat((29.5 + noise * 12).toFixed(1)) : parseFloat((22.0 + noise * 6).toFixed(1));
        dissolvedOxygen = isDrySeason ? parseFloat((3.6 + noise).toFixed(1)) : parseFloat((4.6 + noise).toFixed(1));
        ph = isDrySeason ? parseFloat((6.4 + noise).toFixed(1)) : parseFloat((6.6 + noise).toFixed(1));
      }

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