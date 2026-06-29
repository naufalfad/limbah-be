import { PrismaClient, CompanyStatus, DocType } from '@prisma/client';
import { companiesMasterData } from '../data/companiesMaster';

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

export async function seedCompanies(prisma: PrismaClient) {
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
      address: 'Lokasi Belum Teridentifikasi (Kotawaringin Timur)',
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

    // Optional: dynamically set statuses to ensure diversity based on previous instructions
    let finalData: any = { ...compData };
    if (!finalData.certificateActiveUntil && finalData.status === CompanyStatus.APPROVED) {
      // dynamic assignment for demonstration purposes if not set
      const r = Math.random();
      if (r < 0.1) {
        finalData.status = CompanyStatus.SUSPENDED;
      } else if (r < 0.6) {
        finalData.certificateActiveUntil = '2027-12-31'; // Active
      } else if (r < 0.8) {
        finalData.certificateActiveUntil = '2024-01-01'; // Expired
      }
      // Remaining 20% will stay APPROVED but without certificateActiveUntil -> INACTIVE (Belum Verifikasi)
    }

    await prisma.company.create({
      data: {
        ...finalData,
        ...extraFields,
        companyPhotoUrl,
        picId: comp.docType === DocType.AMDAL && comp.id !== 'COM-000' ? null : 'USER-005',
      },
    });
  }
}
