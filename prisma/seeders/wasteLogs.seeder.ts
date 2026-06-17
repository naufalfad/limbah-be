import { PrismaClient } from '@prisma/client';

export async function seedWasteLogs(prisma: PrismaClient) {
  console.log('Seeding waste logs...');
  await prisma.wasteLog.createMany({
    data: [
      { companyId: 'COM-001', type: 'Oli Bekas Mesin Sintering', volume: 200.0, unit: 'L', date: '2026-06-05', method: 'Dinas', status: 'Terverifikasi', note: 'Telah dimasukkan ke dalam drum steel TPS B3' },
      { companyId: 'COM-001', type: 'Sludge IPAL Pabrik', volume: 1.5, unit: 'm³', date: '2026-06-10', method: 'Dinas', status: 'Proses_Verifikasi', note: 'Limbah cake kering dari filter press IPAL' },
      { companyId: 'COM-003', type: 'Aki Bekas Forklift', volume: 120.0, unit: 'kg', date: '2026-06-02', method: 'Mandiri', status: 'Terverifikasi', note: 'Penyimpanan di rak khusus limbah korosif' },
      { companyId: 'COM-003', type: 'Kemasan Bekas Bahan Kimia', volume: 50.0, unit: 'kg', date: '2026-06-12', method: 'Dinas', status: 'Terjadwal_Pickup', note: 'Drum plastik kosong kontaminan kimia' }
    ]
  });
}
