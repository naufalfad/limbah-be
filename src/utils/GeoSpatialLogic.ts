// src/utils/GeoSpatialLogic.ts
import * as turf from '@turf/turf';

export interface GeoCompany {
    id: string;
    companyName: string;
    lat: string | number;
    lng: string | number;
    [key: string]: any;
}

export class GeoSpatialLogic {

    public static filterUpwindCompanies(
        targetLat: number,
        targetLng: number,
        windDirection: number,
        companies: GeoCompany[],
        radiusKm: number = 5,
        spreadAngle: number = 60
    ): GeoCompany[] {

        if (isNaN(targetLat) || isNaN(targetLng)) {
            console.warn("[GIS_WARN] Koordinat target tidak valid.");
            return [];
        }

        if (companies.length === 0) return [];

        const centerPoint = turf.point([targetLng, targetLat]);

        // 1. HITUNG ARAH SEKTOR ANGIN (Cone of Danger)
        const bearing1 = (windDirection - (spreadAngle / 2)) % 360;
        const bearing2 = (windDirection + (spreadAngle / 2)) % 360;

        try {
            const dangerSector = turf.sector(centerPoint, radiusKm, bearing1, bearing2);

            // 2. PENYARINGAN DENGAN ZERO-DISTANCE GUARD
            const upwindCompanies = companies.filter(company => {
                const compLat = parseFloat(String(company.lat));
                const compLng = parseFloat(String(company.lng));

                if (isNaN(compLat) || isNaN(compLng)) return false;

                const compPoint = turf.point([compLng, compLat]);

                // Hitung jarak absolut antara titik klik dan lokasi pabrik
                const distance = turf.distance(centerPoint, compPoint, { units: 'kilometers' });

                // RULE BARU (PROXIMITY GUARD):
                // Jika jarak pabrik sangat dekat (<= 1.2 KM) dari titik klik, 
                // masukkan langsung sebagai tersangka tanpa peduli arah angin!
                if (distance <= 1.2) {
                    return true;
                }

                // Jika jaraknya jauh (> 1.2 KM s.d 5 KM), gunakan saringan arah angin murni
                if (distance <= radiusKm) {
                    return turf.booleanPointInPolygon(compPoint, dangerSector);
                }

                return false;
            });

            return upwindCompanies;

        } catch (error) {
            console.error("[GIS_ERROR] Gagal mengkalkulasi sektor spasial:", error);
            return this.filterByRadius(targetLat, targetLng, companies, radiusKm);
        }
    }

    private static filterByRadius(
        targetLat: number,
        targetLng: number,
        companies: GeoCompany[],
        radiusKm: number
    ): GeoCompany[] {
        const centerPoint = turf.point([targetLng, targetLat]);

        return companies.filter(company => {
            const compLat = parseFloat(String(company.lat));
            const compLng = parseFloat(String(company.lng));
            if (isNaN(compLat) || isNaN(compLng)) return false;

            const compPoint = turf.point([compLng, compLat]);
            const distance = turf.distance(centerPoint, compPoint, { units: 'kilometers' });
            return distance <= radiusKm;
        });
    }
}