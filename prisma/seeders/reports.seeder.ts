import { PrismaClient, ReportStatus } from '@prisma/client';

export async function seedCitizenReports(prisma: PrismaClient) {
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
}
