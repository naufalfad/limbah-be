import { PrismaClient } from '@prisma/client';
import { seedUsers } from './seeders/users.seeder';
import { seedCompanies } from './seeders/companies.seeder';
import { seedCitizenReports } from './seeders/reports.seeder';
import { seedInspections } from './seeders/inspections.seeder';
import { seedWasteLogs } from './seeders/wasteLogs.seeder';
import { seedPickups } from './seeders/pickups.seeder';
import { seedInvoices } from './seeders/invoices.seeder';
import { seedNotifications } from './seeders/notifications.seeder';
import { seedAuditLogs } from './seeders/audits.seeder';
import { seedAqiCaches } from './seeders/aqi.seeder';
import { seedWaterStations } from './seeders/waterStations.seeder';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');
  await prisma.waterTelemetryLog.deleteMany();
  await prisma.waterStationBaseline.deleteMany();
  await prisma.waterStation.deleteMany();
  await prisma.citizenReport.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.pickupRequest.deleteMany();
  await prisma.wasteLog.deleteMany();
  await prisma.company.deleteMany();
  await prisma.systemNotification.deleteMany();
  await prisma.aqiCache.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  console.log('Starting modular database seeding...');
  
  await seedUsers(prisma);
  await seedCompanies(prisma);
  await seedCitizenReports(prisma);
  await seedInspections(prisma);
  await seedWasteLogs(prisma);
  await seedPickups(prisma);
  await seedInvoices(prisma);
  await seedNotifications(prisma);
  await seedAuditLogs(prisma);
  await seedAqiCaches(prisma);
  await seedWaterStations(prisma);

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