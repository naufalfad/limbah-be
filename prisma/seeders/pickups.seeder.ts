import { PrismaClient, PickupStatus } from '@prisma/client';

export async function seedPickups(prisma: PrismaClient) {
  console.log('Seeding pickup requests...');
  await prisma.pickupRequest.createMany({
    data: [
      { id: 'REQ-001', companyId: 'COM-001', wasteType: 'Oli Bekas Mesin Sintering', volume: '200 L', date: '2026-06-08', status: PickupStatus.COMPLETED, transporterId: 'USER-006', transporterName: 'PT. Transport Limbah Indonesia', cost: 450000.0, plateNo: 'B 9123 SFY', driverName: 'Ahmad Rifai', evidencePhoto: '/uploads/pickups/pickup-example.jpg', invoiceId: 'INV-2026-001', address: 'Jl. Mayor Oking No. 1, Citeureup, Kabupaten Bogor', actualVolume: '200 L', transportReport: 'Limbah terangkut penuh, tidak ada kebocoran selama perjalanan.' },
      { id: 'REQ-002', companyId: 'COM-003', wasteType: 'Kemasan Bekas Bahan Kimia', volume: '50 kg', date: '2026-06-15', status: PickupStatus.ON_THE_ROAD, transporterId: 'USER-006', transporterName: 'PT. Transport Limbah Indonesia', cost: 150000.0, plateNo: 'B 9845 TUI', driverName: 'Slamet Santoso', evidencePhoto: null, invoiceId: 'INV-2026-002', address: 'Jl. Pahlawan, Karang Asem Barat, Citeureup, Kabupaten Bogor', actualVolume: null, transportReport: null },
      { id: 'REQ-003', companyId: 'COM-005', wasteType: 'Sludge Cat Oven', volume: '1.2 m³', date: '2026-06-20', status: PickupStatus.PENDING, transporterId: null, transporterName: null, cost: null, plateNo: null, driverName: null, evidencePhoto: null, invoiceId: null, address: 'Jl. Mercedes-Benz, Cicadas, Gunung Putri, Kabupaten Bogor', actualVolume: null, transportReport: null }
    ]
  });
}
