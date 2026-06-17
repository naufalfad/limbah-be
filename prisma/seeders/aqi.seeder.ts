// prisma/seeders/aqi.seeder.ts
import { PrismaClient } from '@prisma/client';

export async function seedAqiCaches(prisma: PrismaClient) {
  console.log('Seeding AQI simulation caches for Kotawaringin Timur...');

  // Menggunakan clusterId yang sama untuk menjaga kestabilan relasi API iqairService
  // namun merubah nama, koordinat, dan parameter cuaca ke wilayah KWT/Sampit [3]
  await prisma.aqiCache.createMany({
    data: [
      {
        clusterId: 'cluster-citeureup',
        name: 'Kawasan Industri Baamang',
        lat: '-2.5120',
        lng: '112.9310',
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
        name: 'Zona Industri Pelabuhan Bagendang',
        lat: '-2.6950',
        lng: '112.9850',
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
        name: 'Kawasan Mentawa Baru Ketapang',
        lat: '-2.5350',
        lng: '112.9280',
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
  console.log('AQI caches for Kotawaringin Timur seeded successfully!');
}