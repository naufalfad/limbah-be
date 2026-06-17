// prisma/seeders/waterStations.seeder.ts
import { PrismaClient, SourceType, StationStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export async function seedWaterStations(prisma: PrismaClient) {
  console.log('Reading and validating real-world hydrological baselines from JSON (Kotim)...');

  // Mengubah rujukan ke kotim-river-normals.json untuk isolasi data wilayah [3]
  const normalsFilePath = path.join(__dirname, '..', 'data', 'kotim-river-normals.json');
  if (!fs.existsSync(normalsFilePath)) {
    throw new Error(`CRITICAL DATABASE INITIALIZATION ERROR: Berkas data dasar spasial perairan "${normalsFilePath}" tidak ditemukan!`);
  }

  const rawJsonData = fs.readFileSync(normalsFilePath, 'utf-8');
  const stationsData = JSON.parse(rawJsonData);

  console.log(`Seeding ${stationsData.length} calibrated KWT water quality stations and monthly baselines...`);

  for (const st of stationsData) {
    // Menulis entitas stasiun pemantau air Sungai Mentaya
    await prisma.waterStation.create({
      data: {
        id: st.id,
        name: st.name,
        lat: st.lat,
        lng: st.lng,
        subdistrictCode: st.subdistrictCode,
        sourceType: st.sourceType as SourceType,
        status: st.status as StationStatus
      }
    });

    for (const mData of st.months) {
      // Menyimpan data rata-rata bulanan klimatologi sungai (Ground Truth)
      await prisma.waterStationBaseline.create({
        data: {
          stationId: st.id,
          month: mData.month,
          bod: mData.bod,
          cod: mData.cod,
          do: mData.do,
          ph: mData.ph,
          avgTemperature: mData.avgTemperature,
          avgRainfallMm: mData.avgRainfallMm
        }
      });

      // Menyimpan log histori data telemetri 12-bulan untuk visualisasi chart
      await prisma.waterTelemetryLog.create({
        data: {
          stationId: st.id,
          month: mData.month,
          bod: mData.bod,
          cod: mData.cod,
          do: mData.do,
          ph: mData.ph
        }
      });
    }
  }
  console.log('Water stations and monthly baselines seeded successfully!');
}