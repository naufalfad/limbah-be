import { PrismaClient } from '@prisma/client';

export async function seedAqiCaches(prisma: PrismaClient) {
  console.log('Seeding AQI simulation caches...');
  await prisma.aqiCache.createMany({
    data: [
      { clusterId: 'cluster-citeureup', name: 'Kawasan Industri Citeureup', lat: '-6.4862', lng: '106.8833', aqi: 142, weather: { temp: 31, humidity: 68, wind: 12, pressure: 1010 }, source: 'simulation' },
      { clusterId: 'cluster-cileungsi', name: 'Zona Manufaktur Cileungsi', lat: '-6.3919', lng: '106.9558', aqi: 158, weather: { temp: 32, humidity: 65, wind: 14, pressure: 1009 }, source: 'simulation' },
      { clusterId: 'cluster-sentul', name: 'Sentul & Babakan Madang', lat: '-6.5096', lng: '106.8552', aqi: 85, weather: { temp: 29, humidity: 72, wind: 10, pressure: 1011 }, source: 'simulation' }
    ]
  });
}
