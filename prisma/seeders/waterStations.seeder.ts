import { PrismaClient, SourceType, StationStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export async function seedWaterStations(prisma: PrismaClient) {
  console.log('Reading and validating real-world hydrological baselines from JSON...');

  // Pastikan path menunjuk ke data yang tepat. Karena file ini ada di prisma/seeders/,
  // JSON ada di prisma/data/bogor-river-normals.json
  const normalsFilePath = path.join(__dirname, '..', 'data', 'bogor-river-normals.json');
  if (!fs.existsSync(normalsFilePath)) {
    throw new Error(`CRITICAL DATABASE INITIALIZATION ERROR: Berkas data dasar spasial perairan "${normalsFilePath}" tidak ditemukan!`);
  }

  const rawJsonData = fs.readFileSync(normalsFilePath, 'utf-8');
  const stationsData = JSON.parse(rawJsonData);

  console.log(`Seeding ${stationsData.length} calibrated water quality stations and monthly baselines...`);

  for (const st of stationsData) {
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
}
