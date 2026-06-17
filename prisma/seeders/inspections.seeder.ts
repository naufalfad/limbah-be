import { PrismaClient, InspectionStatus } from '@prisma/client';

export async function seedInspections(prisma: PrismaClient) {
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
}
