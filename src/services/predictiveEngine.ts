// src/services/predictiveEngine.ts
import { PrismaClient, SourceType } from '@prisma/client';
import { BmkgWeatherService, BmkgWeatherForecast } from './bmkgWeatherService';

const prisma = new PrismaClient();

export interface CalculatedWaterTelemetry {
    stationId: string;
    stationName: string;
    lat: number;
    lng: number;
    bod: number;
    cod: number;
    do: number;
    ph: number;
    weather: {
        temperature: number;
        humidity: number;
        weatherDesc: string;
        windSpeed: number;
        windDirection: string;
        localTime: string;
        isSimulatedWeather: boolean;
    };
    source: 'LIVE_BMKG_CORRELATED' | 'HISTORICAL_BASELINE';
}

/**
 * ============================================================================
 * MAPPER HUBUNGAN SPASIAL PABRIK HULU - SENSOR HILIR (INFORMATION EXPERT)
 * ============================================================================
 * Menyimpan pemetaan konstan letak pabrik hulu (Upstream) untuk setiap stasiun sensor.
 * Karena Sungai Ciliwung mengalir dari Selatan (Hulu) ke Utara (Hilir),
 * seluruh buangan limbah cair industri di bagian hulu akan terakumulasi dan memperberat
 * beban pencemaran organik (BOD/COD) yang terbaca pada sensor di hilirnya [3].
 */
const UPSTREAM_COMPANIES_MAP: Record<string, string[]> = {
    // 1. Stasiun Hulu Cempaga: Tidak memiliki industri hulu berskala besar
    "WS-01": [],

    // 2. Stasiun Tengah: Terbawa dampak limpasan dari hulu
    "WS-02": [
        "COM-001", // PT. Ciliwung Sawit Mas (Cileungsi)
        "COM-024"  // PT. Aqua Ciliwung Sejahtera (Cibinong)
    ],

    // 3. Stasiun Hilir Pelabuhan Bagendang: Terbawa beban kumulatif perkotaan dan hulu
    "WS-03": [
        "COM-001", // PKS Cileungsi
        "COM-024", // Air Minum Cibinong
        "COM-003", // PT. Rimba Makmur Utama (Sentul Plywood)
        "COM-007", // PT. Ciliwung Kahayan Plywood (Gunung Putri)
        "COM-013", // PT. Tirta Ciliwung Sejahtera (Caringin)
        "COM-009", // PT. Gunung Putri Agro Lestari (Gunung Putri)
        "COM-018", // PT. Ciliwung Agro Kimia (Caringin)
        "COM-019"  // PT. Bogor Meat Processing (Cibinong)
    ],

    // 4. Stasiun Muara Samuda: Menerima akumulasi total seluruh industri hulu & hilir
    "WS-04": [
        "COM-001", "COM-024", "COM-003", "COM-007", "COM-013", "COM-009", "COM-018", "COM-019",
        "COM-004", // PT. Bogor Metal Industry (Gunung Putri)
        "COM-017", // PT. Klapanunggal Agro Industry (PKS Klapanunggal)
        "COM-005", // PT. Bogor CPO Refinery (Cileungsi)
        "COM-010", // PT. Ciliwung Palm Oil Refinery (Cileungsi)
        "COM-012", // PT. Pelindo Cileungsi
        "COM-014", // PT. Sumber Kahayan Sinergi (Cileungsi Biodiesel)
        "COM-022"  // PT. Citeureup Agro Industry (PKS Citeureup)
    ]
};

// Koefisien pembobotan beban pencemaran organik (BOD/COD) per liter limbah cair industri hulu
const CHEMICAL_LOADING_COEFFICIENT = 0.00035;

export class PredictiveHydrologicalEngine {

    /**
     * Menghitung kualitas air perairan secara dinamis.
     * Menggunakan model korelatif fisik-kimia sungai tropis (Empirical Rules Engine).
     */
    public static async calculateCurrentWaterQuality(stationId: string): Promise<CalculatedWaterTelemetry> {
        try {
            // 1. Ambil data stasiun pemantau air
            const station = await prisma.waterStation.findUnique({
                where: { id: stationId }
            });

            if (!station) {
                throw new Error(`Stasiun Air dengan ID ${stationId} tidak terdaftar.`);
            }

            // 2. Ambil data cuaca mikro real-time tingkat ADM4 Kelurahan dari BMKG [1]
            const subdistrictCode = station.subdistrictCode || "";
            const weather: BmkgWeatherForecast = await BmkgWeatherService.getWeatherBySubdistrict(subdistrictCode);

            // 3. AMBIL DATA BASELINE DARI DATABASE (Ground Truth DLH) [3]
            const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
            const currentMonthName = months[new Date().getMonth()];

            // Cari baseline statis bulanan stasiun bersangkutan
            let baseline = await prisma.waterStationBaseline.findUnique({
                where: {
                    stationId_month: {
                        stationId: stationId,
                        month: currentMonthName
                    }
                }
            });

            // Fallback aman jika database baseline kosong (mencegah crash)
            if (!baseline) {
                console.warn(`[VIRTUAL_SENSOR] Baseline bulanan ${currentMonthName} untuk stasiun ${stationId} tidak ditemukan. Menggunakan fallback terdekat.`);
                const firstBaseline = await prisma.waterStationBaseline.findFirst({
                    where: { stationId }
                });
                baseline = firstBaseline || {
                    id: "fallback-id",
                    stationId,
                    month: currentMonthName,
                    bod: 2.5,
                    cod: 18.0,
                    do: 5.5,
                    ph: 6.8,
                    avgTemperature: 28.0,
                    avgRainfallMm: 150.0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
            }

            // ====================================================================
            // LOGIKA 1: EFEK PENGENCERAN / PEKATAN HIDROLOGI (BMKG PROXY) [1]
            // ====================================================================
            let dilutionFactor = 1.0;
            let acidityShift = 0.0;
            const weatherDesc = weather.weatherDesc.toLowerCase();

            if (weatherDesc.includes("hujan lebat") || weatherDesc.includes("petir")) {
                dilutionFactor = 1.35; // Hujan lebat memicu pengenceran polutan sungai
                acidityShift = -0.3;   // Hujan tropis membawa keasaman, pH sedikit turun
            } else if (weatherDesc.includes("hujan") || weatherDesc.includes("gerimis")) {
                dilutionFactor = 1.15; // Hujan ringan/sedang
                acidityShift = -0.15;
            } else if (weatherDesc.includes("cerah") || weatherDesc.includes("panas")) {
                dilutionFactor = 0.75; // Cuaca kering memicu penguapan & low-flow, polutan mengental
                acidityShift = 0.1;
            }

            // ====================================================================
            // LOGIKA 2: KELARUTAN OKSIGEN BERDASARKAN SUHU (HUKUM HENRY PROXY)
            // ====================================================================
            // Suhu air jenuh standard adalah 25°C. Setiap kenaikan 1°C di atas 25°C 
            // menurunkan kelarutan oksigen (DO) dalam air sekitar 2.1%.
            const tempDiff = Math.max(0, weather.temperature - 25.0);
            const tempOxygenReduction = Math.max(0.6, Math.min(1.1, 1.0 - (tempDiff * 0.021)));

            // ====================================================================
            // LOGIKA 3: AKUMULASI BEBAN LIMBAH CAIR INDUSTRI HULU (UPSTREAM LOADING) [3]
            // ====================================================================
            let bodLoad = 0;
            let codLoad = 0;
            let totalUpstreamVolume = 0;

            const upstreamCompanyIds = UPSTREAM_COMPANIES_MAP[stationId] || [];

            if (upstreamCompanyIds.length > 0) {
                // Tarik seluruh laporan logbook limbah dari pabrik hulu dalam 3 hari terakhir
                const threeDaysAgo = new Date();
                threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                const dateThreshold = threeDaysAgo.toISOString().split('T')[0];

                const recentLogs = await prisma.wasteLog.findMany({
                    where: {
                        companyId: { in: upstreamCompanyIds },
                        date: { gte: dateThreshold }
                    }
                });

                // Agregasi seluruh volume limbah cair (B3, Oli, Cair Kimia, dll)
                recentLogs.forEach(log => {
                    const typeLower = log.type.toLowerCase();
                    const isLiquid = typeLower.includes("cair") || typeLower.includes("oli") || typeLower.includes("kimia") || log.unit === "L" || log.unit === "m³";

                    if (isLiquid) {
                        // Standardisasi ke Liter (1 m3 = 1000 Liter)
                        const multiplier = log.unit === "m³" ? 1000 : 1;
                        totalUpstreamVolume += log.volume * multiplier;
                    }
                });

                // Konversikan akumulasi volume biner (L) menjadi beban konsentrasi kimia perairan (mg/L)
                bodLoad = totalUpstreamVolume * CHEMICAL_LOADING_COEFFICIENT;
                codLoad = bodLoad * 3.3; // COD baseline korelasi standard (3.3 kali BOD)
            }

            // ====================================================================
            // LOGIKA 4: KALKULASI PARAMETER AKHIR PERAIRAN (HYBRID CALCULATION)
            // ====================================================================
            // 1. BOD & COD: Naik drastis jika ada beban buangan hulu dan debit sungai menyusut
            let finalBod = (baseline.bod / dilutionFactor) + bodLoad;
            let finalCod = (baseline.cod / dilutionFactor) + codLoad;

            // 2. DO (Dissolved Oxygen): Menyusut jika suhu air naik, debit sungai menyusut,
            // dan diperparah oleh konsumsi bakteri anaerob atas beban limbah hulu (BOD load)
            let finalDo = (baseline.do * dilutionFactor * tempOxygenReduction) - (bodLoad * 0.15);

            // 3. pH: Dipengaruhi curah hujan asam dan tingkat keasaman polutan kimia hulu
            let finalPh = baseline.ph + acidityShift - (bodLoad * 0.02);

            // ====================================================================
            // SAFEGUARD BOUNDARIES (Mengamankan Batas Logis Parameter Perairan)
            // ====================================================================
            finalDo = parseFloat(Math.max(0.1, Math.min(9.0, finalDo)).toFixed(1)); // DO tidak mungkin minus/nol murni
            finalBod = parseFloat(Math.max(0.5, Math.min(99.9, finalBod)).toFixed(1));
            finalCod = parseFloat(Math.max(2.0, Math.min(299.9, finalCod)).toFixed(1));
            finalPh = parseFloat(Math.max(4.0, Math.min(9.5, finalPh)).toFixed(1));

            console.log(`[VIRTUAL_SENSOR] Sukses memproyeksikan parameter ${stationId} (${currentMonthName}). Upstream Vol: ${totalUpstreamVolume}L. Output: BOD ${finalBod}, COD ${finalCod}, DO ${finalDo}, pH ${finalPh}.`);

            return {
                stationId,
                stationName: station.name,
                lat: parseFloat(station.lat),
                lng: parseFloat(station.lng),
                bod: finalBod,
                cod: finalCod,
                do: finalDo,
                ph: finalPh,
                weather: {
                    temperature: weather.temperature,
                    humidity: weather.humidity,
                    weatherDesc: weather.weatherDesc,
                    windSpeed: weather.windSpeed,
                    windDirection: weather.windDirection,
                    localTime: weather.localTime,
                    isSimulatedWeather: weather.isSimulated
                },
                source: 'LIVE_BMKG_CORRELATED'
            };

        } catch (error: any) {
            console.error(`[VIRTUAL_SENSOR_ERROR] Gagal memproses estimasi spasial stasiun ${stationId}: ${error.message}. Menggunakan fallback.`);
            return this.getFallbackHistoricalBaseline(stationId);
        }
    }

    /**
     * Fallback aman jika sensor BMKG terputus (Prinsip High Availability & Robustness)
     */
    private static async getFallbackHistoricalBaseline(stationId: string): Promise<CalculatedWaterTelemetry> {
        const station = await prisma.waterStation.findUnique({ where: { id: stationId } });

        // Ambil data acuan statis dari database untuk stasiun bersangkutan
        const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
        const currentMonthName = months[new Date().getMonth()];

        const baseline = await prisma.waterStationBaseline.findFirst({
            where: { stationId, month: currentMonthName }
        });

        const fallbackData = baseline || {
            bod: 2.5,
            cod: 18.0,
            do: 5.5,
            ph: 6.8,
            avgTemperature: 28.0,
            avgRainfallMm: 150.0
        };

        return {
            stationId,
            stationName: station?.name || "Stasiun Air Sungai Ciliwung",
            lat: parseFloat(station?.lat || "-6.4816"), // Koordinat pusat Cibinong
            lng: parseFloat(station?.lng || "106.8560"),
            bod: fallbackData.bod,
            cod: fallbackData.cod,
            do: fallbackData.do,
            ph: fallbackData.ph,
            weather: {
                temperature: fallbackData.avgTemperature,
                humidity: 75,
                weatherDesc: "Cerah Berawan (Offline Fallback)",
                windSpeed: 8.0,
                windDirection: "Selatan",
                localTime: new Date().toISOString().replace("T", " ").substring(0, 19),
                isSimulatedWeather: true
            },
            source: 'HISTORICAL_BASELINE'
        };
    }
}