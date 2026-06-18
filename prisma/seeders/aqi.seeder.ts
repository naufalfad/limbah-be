// prisma/seeders/aqi.seeder.ts
import { PrismaClient } from '@prisma/client';

export async function seedAqiCaches(prisma: PrismaClient) {
  console.log('Seeding AQI simulation caches for Kabupaten Bogor...');

  // Menggunakan clusterId yang sama untuk menjaga kestabilan relasi API iqairService
  // namun merubah nama, koordinat, dan parameter cuaca ke wilayah Bogor [3]
  await prisma.aqiCache.createMany({
    data: [
      {
        clusterId: 'cluster-citeureup',
        name: 'Kawasan Industri Citeureup',
        lat: '-6.4862',
        lng: '106.8835',
        aqi: 138,
        weather: {
          temperature: 31,
          humidity: 68,
          windSpeed: 10,
          windDirection: 135, // Arah Tenggara
          pressure: 1010
        },
        source: 'simulation'
      },
      {
        clusterId: 'cluster-cileungsi',
        name: 'Zona Industri Cileungsi',
        lat: '-6.4027',
        lng: '106.9582',
        aqi: 145,
        weather: {
          temperature: 32,
          humidity: 64,
          windSpeed: 12,
          windDirection: 140, // Embusan angin laut ke darat
          pressure: 1009
        },
        source: 'simulation'
      },
      {
        clusterId: 'cluster-sentul',
        name: 'Kawasan Sentul (Babakan Madang)',
        lat: '-6.5786',
        lng: '106.8686',
        aqi: 72,
        weather: {
          temperature: 29,
          humidity: 74,
          windSpeed: 8,
          windDirection: 130,
          pressure: 1011
        },
        source: 'simulation'
      }
    ]
  });
  console.log('AQI caches for Kabupaten Bogor seeded successfully!');
}