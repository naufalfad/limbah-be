// src/services/iqairService.ts
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Memastikan variabel env terbaca
config();

const prisma = new PrismaClient();

// Kontrak data kualitas udara terpadu untuk dikirim ke Client (Frontend)
export interface ParsedAqiData {
    city: string;
    state: string;
    country: string;
    aqi: number;            // US EPA AQI (aqius)
    mainPollutant: string;   // PM2.5, PM10, CO, SO2, dll.
    weather: {
        temperature: number;   // tp (Celsius)
        humidity: number;      // hu (%)
        windSpeed: number;     // ws (m/s)
        windDirection: number; // wd (degree)
        pressure: number;      // pr (hPa)
    };
    pollutants?: {
        pm2_5: number;
        pm10: number;
        co: number;          // Karbon Monoksida (μg/m³), indikator utama kebakaran hutan
        no2: number;
        so2: number;
        o3: number;
    };
    source: 'live' | 'cache' | 'simulation';
    provider?: string;
    cachedAt?: string;
}

interface CacheEntry {
    data: ParsedAqiData;
    expiresAt: number;
}

export interface KwtClusterTelemetry {
    id: string;
    name: string;
    lat: number;
    lng: number;
    telemetry: ParsedAqiData;
}

// PROTECTED VARIATION ALIAS: Menghindari error tipe data di modul front-end/store lama
export type BogorClusterTelemetry = KwtClusterTelemetry;

export class IqairService {
    // In-Memory Cache Map untuk efisiensi pemanggilan API luar
    private static cache = new Map<string, CacheEntry>();

    private static readonly IQAIR_API_URL = 'https://api.airvisual.com/v2/nearest_city';
    private static readonly OPEN_METEO_AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
    private static readonly OPEN_METEO_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
    private static readonly DEFAULT_TTL = parseInt(process.env.IQAIR_CACHE_TTL_SECONDS || '1800', 10) * 1000; // Default 30 menit

    // Flag penanda status background worker
    private static isWorkerRunning = false;

    /**
     * DEFINISI KLASTER INDUSTRI & PEMANTAUAN WILAYAH KERJA
     * Mencakup wilayah Kabupaten Bogor dan Kabupaten Kotawaringin Timur (Kotim)
     */
    public static readonly KWT_CLUSTERS = [
        // Klaster Kabupaten Bogor
        { id: 'cluster-citeureup', name: 'Citeureup (Klaster Semen & Logistik)', lat: -6.4862, lng: 106.8835 },
        { id: 'cluster-klapanunggal', name: 'Klapanunggal (Klaster Kimia & Plastik)', lat: -6.4678, lng: 106.9403 },
        { id: 'cluster-gunungputri', name: 'Gunung Putri (Klaster Manufaktur Metal & Logam)', lat: -6.3872, lng: 106.9034 },
        { id: 'cluster-cileungsi', name: 'Cileungsi (Klaster Industri Berat & Tekstil)', lat: -6.4027, lng: 106.9582 },
        { id: 'cluster-cibinong', name: 'Cibinong (Klaster Administrasi & Sentra Kota)', lat: -6.4816, lng: 106.8560 },
        { id: 'cluster-sentul', name: 'Sentul (Klaster Pemukiman & Jasa Pariwisata)', lat: -6.5786, lng: 106.8686 },
        { id: 'cluster-caringin', name: 'Caringin (Klaster Pertanian & Industri Air Minum)', lat: -6.7118, lng: 106.8302 },
        // Klaster Kabupaten Kotawaringin Timur (Kotim)
        { id: 'cluster-sampit', name: 'Sampit (Sentra Industri & Pelabuhan Kotim)', lat: -2.5340, lng: 112.9510 },
        { id: 'cluster-mentaya', name: 'Mentaya (Kawasan Perkebunan & Pesisir Kotim)', lat: -2.7120, lng: 112.9830 },
        { id: 'cluster-parenggean', name: 'Parenggean (Kawasan Agroindustri & Tambang Kotim)', lat: -2.0540, lng: 112.7210 }
    ];

    /**
     * INJEKSI: Menginisialisasi Background Worker Caching di Server
     * Scheduler berjalan berkala di latar belakang untuk memperbarui data database lokal.
     */
    public static initBackgroundWorker(): void {
        console.log("[SYSTEM] Menginisialisasi Background Worker Telemetri Kualitas Udara (Open-Meteo & IQAir)...");

        // Memicu tarikan pertama secara asinkron saat booting server (Immediate Seeding)
        this.updateAllClustersCache().catch((err) => {
            console.error("[SYSTEM_ERROR] Gagal memicu tarikan awal AQI Cache:", err);
        });

        // Set interval berkala (Default: 30 menit = 1800000ms)
        setInterval(() => {
            this.updateAllClustersCache().catch((err) => {
                console.error("[SYSTEM_ERROR] Gagal memproses interval AQI Cache:", err);
            });
        }, 1800000);
    }

    /**
     * LOOPER SINKRONISASI BATCH KLASTER
     * Mengambil data faktual real-time dari model atmosfer CAMS Copernicus (seperti Windy)
     */
    private static async updateAllClustersCache(): Promise<void> {
        if (this.isWorkerRunning) {
            console.log("[AQI SERVICE] Background worker sedang berjalan. Melewati jadwal ini.");
            return;
        }

        this.isWorkerRunning = true;
        console.log(`[AQI SERVICE] Memulai tarikan berkala kualitas udara & cuaca untuk ${this.KWT_CLUSTERS.length} klaster wilayah kerja...`);

        for (let i = 0; i < this.KWT_CLUSTERS.length; i++) {
            const cluster = this.KWT_CLUSTERS[i];
            try {
                // Melakukan fetch langsung ke model atmosfer luar
                const telemetry = await this.fetchTelemetryDirectly(cluster.lat, cluster.lng, cluster.name);

                // Update atau insert (Upsert) ke dalam database PostgreSQL
                await prisma.aqiCache.upsert({
                    where: { clusterId: cluster.id },
                    update: {
                        aqi: telemetry.aqi,
                        weather: {
                            ...telemetry.weather,
                            pollutants: telemetry.pollutants,
                            provider: telemetry.provider
                        } as any,
                        source: telemetry.source,
                        updatedAt: new Date()
                    },
                    create: {
                        clusterId: cluster.id,
                        name: cluster.name,
                        lat: String(cluster.lat),
                        lng: String(cluster.lng),
                        aqi: telemetry.aqi,
                        weather: {
                            ...telemetry.weather,
                            pollutants: telemetry.pollutants,
                            provider: telemetry.provider
                        } as any,
                        source: telemetry.source
                    }
                });

                console.log(`[AQI SERVICE] Klaster ${cluster.name} (${i + 1}/${this.KWT_CLUSTERS.length}) tersinkronisasi. AQI: ${telemetry.aqi}, Source: ${telemetry.source} (${telemetry.provider || 'CAMS'})`);

            } catch (error: any) {
                console.error(`[AQI SERVICE] Gagal memperbarui klaster ${cluster.name}:`, error.message);
            }

            // Jeda 500ms antar klaster agar ramah jaringan
            if (i < this.KWT_CLUSTERS.length - 1) {
                await this.delay(500);
            }
        }

        this.isWorkerRunning = false;
        console.log("[AQI SERVICE] Seluruh klaster industri selesai diperbarui di database.");
    }

    /**
     * INTEGRASI UTAMA (BEST PRACTICE): OPEN-METEO CAMS ATMOSPHERE MODEL
     * Menggunakan model CAMS (Copernicus Atmosphere Monitoring Service) dari Uni Eropa & ECMWF.
     * Sumber data yang sama persis dengan yang dipakai Windy.com:
     * - 100% Gratis & Publik (Tanpa butuh API key)
     * - Mendukung seluruh koordinat di Indonesia (bahkan di pelosok tanpa stasiun darat)
     * - Parameter lengkap: AQI, PM2.5, PM10, CO, SO2, NO2, O3, dan arah/kecepatan angin riil
     */
    private static async fetchOpenMeteoTelemetry(lat: number, lng: number, locationName?: string): Promise<ParsedAqiData | null> {
        try {
            const aqUrl = `${this.OPEN_METEO_AQ_URL}?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;
            const weatherUrl = `${this.OPEN_METEO_WEATHER_URL}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure`;

            const [aqRes, wRes] = await Promise.all([
                fetch(aqUrl, { signal: AbortSignal.timeout(10000) }),
                fetch(weatherUrl, { signal: AbortSignal.timeout(10000) })
            ]);

            if (!aqRes.ok || !wRes.ok) {
                console.warn(`[OPEN-METEO] Respons HTTP tidak sukses: AQ ${aqRes.status}, Weather ${wRes.status}`);
                return null;
            }

            const aqData = await aqRes.json();
            const wData = await wRes.json();

            const curAq = aqData?.current;
            const curW = wData?.current;

            if (!curAq || !curW) return null;

            const aqi = Math.round(curAq.us_aqi ?? 50);
            const pm25 = parseFloat((curAq.pm2_5 ?? 15).toFixed(1));
            const pm10 = parseFloat((curAq.pm10 ?? 25).toFixed(1));
            const co = parseFloat((curAq.carbon_monoxide ?? 200).toFixed(1));
            const no2 = parseFloat((curAq.nitrogen_dioxide ?? 10).toFixed(1));
            const so2 = parseFloat((curAq.sulphur_dioxide ?? 10).toFixed(1));
            const o3 = parseFloat((curAq.ozone ?? 40).toFixed(1));

            // Klasifikasi polutan dominan secara cerdas & faktual
            let mainPollutant = 'PM2.5 (Debu Partikulat Halus)';
            if (co > 2000) {
                mainPollutant = 'CO (Asap Karhutla / Pembakaran Lahan)';
            } else if (pm25 > 55) {
                mainPollutant = 'PM2.5 (Debu Partikulat Halus)';
            } else if (pm10 > 100) {
                mainPollutant = 'PM10 (Partikel Debu Kasar)';
            } else if (so2 > 40) {
                mainPollutant = 'SO2 (Emisi Pembakaran Industri)';
            } else if (o3 > 120) {
                mainPollutant = 'O3 (Ozon Permukaan)';
            }

            // Konversi kecepatan angin dari km/h ke m/s
            const windSpeedKmh = curW.wind_speed_10m ?? 7.2;
            const windSpeedMs = parseFloat((windSpeedKmh / 3.6).toFixed(1));

            // Penentuan nama wilayah berdasarkan rentang koordinat spasial
            let stateName = 'Jawa Barat';
            let cityName = locationName || `Koordinat (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

            if (lat >= -5.0 && lat <= 4.5 && lng >= 108.5 && lng <= 119.5) {
                stateName = 'Kalimantan Tengah';
                if (!locationName) cityName = `Wilayah Kotim (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            } else if (lat >= -6.0 && lat <= 6.0 && lng >= 95.0 && lng <= 106.0) {
                stateName = 'Sumatera';
            }

            return {
                city: cityName,
                state: stateName,
                country: 'Indonesia',
                aqi,
                mainPollutant,
                weather: {
                    temperature: Math.round(curW.temperature_2m ?? 30),
                    humidity: Math.round(curW.relative_humidity_2m ?? 65),
                    windSpeed: windSpeedMs,
                    windDirection: Math.round(curW.wind_direction_10m ?? 45),
                    pressure: Math.round(curW.surface_pressure ?? 1010)
                },
                pollutants: {
                    pm2_5: pm25,
                    pm10: pm10,
                    co,
                    no2,
                    so2,
                    o3
                },
                source: 'live',
                provider: 'Open-Meteo CAMS (Windy Model)',
                cachedAt: new Date().toISOString()
            };

        } catch (err: any) {
            console.warn('[OPEN-METEO] Gagal mengambil telemetri spasial:', err.message);
            return null;
        }
    }

    /**
     * Panggilan langsung telemetri dengan arsitektur Multi-Tier Fallback:
     * 1. Primary: Open-Meteo (Real-Time CAMS Atmosphere Model, sama seperti Windy)
     * 2. Secondary: IQAir AirVisual (Jika key tersedia & Open-Meteo offline)
     * 3. Tertiary: Smart Simulation (Jika jaringan offline total)
     */
    public static async fetchTelemetryDirectly(lat: number, lng: number, locationName?: string): Promise<ParsedAqiData> {
        // TIER 1: OPEN-METEO CAMS (GRATIS, AKTUAL, SAMA DENGAN WINDY)
        const openMeteoData = await this.fetchOpenMeteoTelemetry(lat, lng, locationName);
        if (openMeteoData) {
            return openMeteoData;
        }

        // TIER 2: IQAIR AIRVISUAL (SECONDARY FALLBACK)
        const apiKey = process.env.IQAIR_API_KEY;
        const isApiKeyValid = apiKey && apiKey !== 'your_iqair_api_key_here' && apiKey.trim() !== '';

        if (isApiKeyValid) {
            try {
                const fetchUrl = `${this.IQAIR_API_URL}?lat=${lat}&lon=${lng}&key=${apiKey}`;
                const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(8000) });

                if (response.ok) {
                    const rawJson = await response.json();
                    if (rawJson.status === 'success' && rawJson.data) {
                        const iqData = rawJson.data;
                        return {
                            city: locationName || iqData.city || 'Wilayah Pantauan',
                            state: iqData.state || 'Jawa Barat',
                            country: iqData.country || 'Indonesia',
                            aqi: iqData.current.pollution.aqius ?? 0,
                            mainPollutant: this.mapPollutantCode(iqData.current.pollution.mainus),
                            weather: {
                                temperature: iqData.current.weather.tp ?? 0,
                                humidity: iqData.current.weather.hu ?? 0,
                                windSpeed: iqData.current.weather.ws ?? 0,
                                windDirection: iqData.current.weather.wd ?? 0,
                                pressure: iqData.current.weather.pr ?? 0
                            },
                            source: 'live',
                            provider: 'IQAir AirVisual',
                            cachedAt: new Date().toISOString()
                        };
                    }
                }
            } catch (err: any) {
                console.warn('[IQAIR] Secondary fetch gagal, melanjutkan ke simulasi lokal:', err.message);
            }
        }

        // TIER 3: TERTIARY FALLBACK (SIMULASI MATEMATIKA REALISTIS)
        return this.generateSimulationData(lat, lng, locationName || 'Wilayah Pantauan (Offline Fallback)');
    }

    /**
     * Mengambil data kualitas udara berdasarkan koordinat spasial (Dynamic Any Coordinate)
     * GRASP: Information Expert, Indirection, & Protected Variations
     */
    public static async getTelemetryByCoords(latStr: string, lngStr: string): Promise<ParsedAqiData> {
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        if (isNaN(lat) || isNaN(lng)) {
            throw new Error('Koordinat spasial tidak valid.');
        }

        const roundedLat = lat.toFixed(2);
        const roundedLng = lng.toFixed(2);
        const cacheKey = `aqi_${roundedLat}_${roundedLng}`;

        // 1. CEK MEMORY CACHE
        const now = Date.now();
        const cachedEntry = this.cache.get(cacheKey);
        if (cachedEntry && cachedEntry.expiresAt > now) {
            return {
                ...cachedEntry.data,
                source: 'cache'
            };
        }

        // 2. FETCH LIVE DARI MODEL ATMOSFER (OPEN-METEO)
        try {
            const liveTelemetry = await this.fetchTelemetryDirectly(lat, lng);
            this.cache.set(cacheKey, {
                data: liveTelemetry,
                expiresAt: now + this.DEFAULT_TTL
            });
            return liveTelemetry;
        } catch (fetchErr: any) {
            console.warn('[AQI SERVICE] Live fetch gagal, mencari klaster terdekat di database lokal:', fetchErr.message);
        }

        // 3. FALLBACK DATABASE KLASTER TERDEKAT
        try {
            const dbClusters = await prisma.aqiCache.findMany();
            let closestCluster = null;
            let minDistanceSq = 0.25; // Radius toleransi spasial ~55 km

            for (const cluster of dbClusters) {
                const dLat = lat - parseFloat(cluster.lat);
                const dLng = lng - parseFloat(cluster.lng);
                const distSq = dLat * dLat + dLng * dLng;

                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    closestCluster = cluster;
                }
            }

            if (closestCluster) {
                const weatherObj = closestCluster.weather as any;
                const parsedData: ParsedAqiData = {
                    city: closestCluster.name,
                    state: lat >= -5.0 && lat <= 4.5 && lng >= 108.5 ? 'Kalimantan Tengah' : 'Jawa Barat',
                    country: 'Indonesia',
                    aqi: closestCluster.aqi,
                    mainPollutant: closestCluster.aqi > 100 ? 'PM2.5 (Debu Partikulat)' : 'O3 (Ozon Permukaan)',
                    weather: {
                        temperature: weatherObj?.temperature ?? 30,
                        humidity: weatherObj?.humidity ?? 65,
                        windSpeed: weatherObj?.windSpeed ?? 2.0,
                        windDirection: weatherObj?.windDirection ?? 45,
                        pressure: weatherObj?.pressure ?? 1010
                    },
                    pollutants: weatherObj?.pollutants,
                    source: closestCluster.source as 'live' | 'simulation',
                    provider: weatherObj?.provider || 'Database Cache',
                    cachedAt: closestCluster.updatedAt.toISOString()
                };

                this.cache.set(cacheKey, {
                    data: parsedData,
                    expiresAt: now + this.DEFAULT_TTL
                });

                return parsedData;
            }
        } catch (e) {
            console.warn("[AQI SERVICE] Gagal mencocokkan koordinat dengan database:", e);
        }

        // 4. ABSOLUTE FALLBACK KE SIMULASI
        const sim = this.generateSimulationData(lat, lng, 'Wilayah Pantauan (Simulasi Luring)');
        this.cache.set(cacheKey, {
            data: sim,
            expiresAt: now + (60 * 1000) // Simpan hanya 1 menit agar cepat retry live
        });

        return sim;
    }

    /**
     * MENGAMBIL DATA BATCH TELEMETRI SELURUH KLASTER WILAYAH KERJA
     * Mengakses database lokal dengan performa O(1) untuk merender Heatmap GIS secara instan
     */
    public static async getBatchTelemetry(): Promise<KwtClusterTelemetry[]> {
        try {
            // Ambil seluruh data klaster yang di-cache di PostgreSQL lokal
            const cachedClusters = await prisma.aqiCache.findMany({
                orderBy: { clusterId: 'asc' }
            });

            // LAZY INITIALIZATION: Jika database masih kosong, lakukan pengisian live segera
            if (cachedClusters.length === 0) {
                console.log("[AQI SERVICE] Database AqiCache kosong. Memulai pengisian awal seluruh klaster...");
                const seededResults: KwtClusterTelemetry[] = [];

                for (const cluster of this.KWT_CLUSTERS) {
                    const telemetry = await this.fetchTelemetryDirectly(cluster.lat, cluster.lng, cluster.name);

                    prisma.aqiCache.create({
                        data: {
                            clusterId: cluster.id,
                            name: cluster.name,
                            lat: String(cluster.lat),
                            lng: String(cluster.lng),
                            aqi: telemetry.aqi,
                            weather: {
                                ...telemetry.weather,
                                pollutants: telemetry.pollutants,
                                provider: telemetry.provider
                            } as any,
                            source: telemetry.source
                        }
                    }).catch(e => console.error("[AQI SERVICE] Gagal menyimpan cache klaster:", e));

                    seededResults.push({
                        id: cluster.id,
                        name: cluster.name,
                        lat: cluster.lat,
                        lng: cluster.lng,
                        telemetry
                    });
                }
                return seededResults;
            }

            // Memetakan struktur database ke tipe kontraktual KwtClusterTelemetry
            return cachedClusters.map((dbCluster) => {
                const weatherObj = dbCluster.weather as any;
                const cLat = parseFloat(dbCluster.lat);
                const cLng = parseFloat(dbCluster.lng);
                const isKalimantan = cLat >= -5.0 && cLat <= 4.5 && cLng >= 108.5;

                return {
                    id: dbCluster.clusterId,
                    name: dbCluster.name,
                    lat: cLat,
                    lng: cLng,
                    telemetry: {
                        city: dbCluster.name,
                        state: isKalimantan ? 'Kalimantan Tengah' : 'Jawa Barat',
                        country: 'Indonesia',
                        aqi: dbCluster.aqi,
                        mainPollutant: dbCluster.aqi > 100 ? 'PM2.5 (Debu Partikulat)' : 'O3 (Ozon Permukaan)',
                        weather: {
                            temperature: weatherObj?.temperature ?? 30,
                            humidity: weatherObj?.humidity ?? 65,
                            windSpeed: weatherObj?.windSpeed ?? 2.0,
                            windDirection: weatherObj?.windDirection ?? 45,
                            pressure: weatherObj?.pressure ?? 1010
                        },
                        pollutants: weatherObj?.pollutants,
                        source: dbCluster.source as 'live' | 'simulation',
                        provider: weatherObj?.provider || 'Open-Meteo CAMS Model',
                        cachedAt: dbCluster.updatedAt.toISOString()
                    }
                };
            });

        } catch (err: any) {
            console.error("[AQI SERVICE] Gagal query AqiCache database. Mundur ke simulasi on-the-fly:", err.message);

            const fallbackResults: KwtClusterTelemetry[] = [];
            for (const cluster of this.KWT_CLUSTERS) {
                const simulated = this.generateSimulationData(cluster.lat, cluster.lng, cluster.name);
                fallbackResults.push({
                    id: cluster.id,
                    name: cluster.name,
                    lat: cluster.lat,
                    lng: cluster.lng,
                    telemetry: simulated
                });
            }
            return fallbackResults;
        }
    }

    /**
     * Generator Telemetri Buatan Realistis (Offline Simulation Engine)
     */
    private static generateSimulationData(lat: number, lng: number, prefix: string): ParsedAqiData {
        const seed = Math.abs(Math.sin(lat) * Math.cos(lng));
        const baseAqi = Math.floor(45 + (seed * 120)); // Rentang 45 - 165

        const isKalimantan = lat >= -5.0 && lat <= 4.5 && lng >= 108.5;

        return {
            city: prefix,
            state: isKalimantan ? 'Kalimantan Tengah' : 'Jawa Barat',
            country: 'Indonesia',
            aqi: baseAqi,
            mainPollutant: baseAqi > 100 ? 'PM2.5 (Debu Partikulat)' : 'O3 (Ozon Permukaan)',
            weather: {
                temperature: Math.floor(26 + (seed * 5)),
                humidity: Math.floor(70 + (seed * 20)),
                windSpeed: parseFloat((1.0 + (seed * 5)).toFixed(1)),
                windDirection: Math.floor(seed * 360),
                pressure: Math.floor(1008 + (seed * 4))
            },
            source: 'simulation',
            provider: 'Offline Mathematical Model',
            cachedAt: new Date().toISOString()
        };
    }

    private static delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Konverter Kode Polutan IQAir ke format deskripsi ramah pengguna
     */
    private static mapPollutantCode(code: string): string {
        const map: Record<string, string> = {
            p2: 'PM2.5 (Debu Partikulat Halus)',
            p1: 'PM10 (Partikel Debu Kasar)',
            o3: 'O3 (Ozon Permukaan)',
            n2: 'NO2 (Nitrogen Dioksida)',
            s2: 'SO2 (Sulfur Dioksida)',
            co: 'CO (Karbon Monoksida)'
        };
        return map[code] || `Polutan ${code.toUpperCase()}`;
    }
}