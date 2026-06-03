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
    mainPollutant: string;   // PM2.5, PM10, CO, dll.
    weather: {
        temperature: number;   // tp (Celsius)
        humidity: number;      // hu (%)
        windSpeed: number;     // ws (m/s)
        windDirection: number; // wd (degree)
        pressure: number;      // pr (hPa)
    };
    source: 'live' | 'cache' | 'simulation';
    cachedAt?: string;
}

interface CacheEntry {
    data: ParsedAqiData;
    expiresAt: number;
}

export interface BogorClusterTelemetry {
    id: string;
    name: string;
    lat: number;
    lng: number;
    telemetry: ParsedAqiData;
}

export class IqairService {
    // In-Memory Cache Map untuk efisiensi pemanggilan API luar
    private static cache = new Map<string, CacheEntry>();

    private static readonly API_URL = 'https://api.airvisual.com/v2/nearest_city';
    private static readonly DEFAULT_TTL = parseInt(process.env.IQAIR_CACHE_TTL_SECONDS || '3600', 10) * 1000;

    // Flag penanda status background worker
    private static isWorkerRunning = false;

    /**
     * DEFINISI 7 KLASTER INDUSTRI UTAMA KABUPATEN BOGOR (Information Expert)
     * Koordinat disinkronkan langsung dengan pusat klaster seeder database.
     */
    public static readonly BOGOR_CLUSTERS = [
        { id: 'cluster-citeureup', name: 'Citeureup (Klaster Semen & Ban)', lat: -6.4862, lng: 106.8833 },
        { id: 'cluster-klapanunggal', name: 'Klapanunggal (Klaster Bahan Bangunan)', lat: -6.4520, lng: 106.9210 },
        { id: 'cluster-gunungputri', name: 'Gunung Putri (Klaster Farmasi & Kimia)', lat: -6.4020, lng: 106.9180 },
        { id: 'cluster-cileungsi', name: 'Cileungsi (Klaster Kertas & Saniter)', lat: -6.3919, lng: 106.9558 },
        { id: 'cluster-cibinong', name: 'Cibinong (Klaster Tekstil & Elektronik)', lat: -6.4816, lng: 106.8560 },
        { id: 'cluster-sentul', name: 'Babakan Madang (Klaster Sentul & Makanan)', lat: -6.5096, lng: 106.8552 },
        { id: 'cluster-caringin', name: 'Caringin (Klaster Air Minum & Susu)', lat: -6.6936, lng: 106.8352 }
    ];

    /**
     * INJEKSI BARU: Menginisialisasi Background Worker Caching di Server
     * Scheduler berjalan berkala di latar belakang untuk memperbarui data database lokal.
     */
    public static initBackgroundWorker(): void {
        console.log("[SYSTEM] Menginisialisasi Background Worker IQAir Caching...");

        // Memicu tarikan pertama secara asinkron saat booting server (Immediate Seeding)
        this.updateAllClustersCache().catch((err) => {
            console.error("[SYSTEM_ERROR] Gagal memicu tarikan awal IQAir Cache:", err);
        });

        // Set interval berkala (Default: 3600000ms = 1 jam)
        setInterval(() => {
            this.updateAllClustersCache().catch((err) => {
                console.error("[SYSTEM_ERROR] Gagal memproses interval IQAir Cache:", err);
            });
        }, 3600000);
    }

    /**
     * LOOPER PENCICILAN DATA (THROTTLING ENGINE - 15 DETIK)
     * Mengiterasi 7 klaster Kabupaten Bogor dengan jeda waktu 15 detik untuk mematuhi rate-limit API
     */
    private static async updateAllClustersCache(): Promise<void> {
        if (this.isWorkerRunning) {
            console.log("[IQAIR SERVICE] Background worker sedang berjalan. Melewati jadwal ini.");
            return;
        }

        this.isWorkerRunning = true;
        console.log("[IQAIR SERVICE] Memulai tarikan berkala kualitas udara 7 klaster...");

        for (let i = 0; i < this.BOGOR_CLUSTERS.length; i++) {
            const cluster = this.BOGOR_CLUSTERS[i];
            try {
                console.log(`[IQAIR SERVICE] Mengambil data untuk klaster: ${cluster.name} (${i + 1}/7)...`);

                // Melakukan fetch langsung ke luar bypass cache memory
                const telemetry = await this.fetchTelemetryDirectly(cluster.lat, cluster.lng);

                // Update atau insert (Upsert) ke dalam database persisten
                await prisma.aqiCache.upsert({
                    where: { clusterId: cluster.id },
                    update: {
                        aqi: telemetry.aqi,
                        weather: telemetry.weather as any,
                        source: telemetry.source,
                        updatedAt: new Date()
                    },
                    create: {
                        clusterId: cluster.id,
                        name: cluster.name,
                        lat: String(cluster.lat),
                        lng: String(cluster.lng),
                        aqi: telemetry.aqi,
                        weather: telemetry.weather as any,
                        source: telemetry.source
                    }
                });

                console.log(`[IQAIR SERVICE] Klaster ${cluster.name} sukses diperbarui di database. Source: ${telemetry.source}`);

            } catch (error: any) {
                console.error(`[IQAIR SERVICE] Gagal memperbarui klaster ${cluster.name}:`, error.message);
            }

            // Throttling: Berikan jeda waktu tunggu asinkron 15 detik sebelum memproses klaster berikutnya
            if (i < this.BOGOR_CLUSTERS.length - 1) {
                console.log("[IQAIR SERVICE] Menunggu 15 detik sebelum request klaster berikutnya...");
                await this.delay(15000);
            }
        }

        this.isWorkerRunning = false;
        console.log("[IQAIR SERVICE] Seluruh 7 klaster industri selesai diperbarui di database.");
    }

    /**
     * Panggilan langsung ke API IQAir (AirVisual) dengan penanganan fallback simulasi
     */
    private static async fetchTelemetryDirectly(lat: number, lng: number): Promise<ParsedAqiData> {
        const apiKey = process.env.IQAIR_API_KEY;
        const isMockKey = !apiKey || apiKey === 'your_iqair_api_key_here' || apiKey.trim() === '';

        if (isMockKey) {
            return this.generateSimulationData(lat, lng, 'Bogor (Simulasi Spasial)');
        }

        try {
            const fetchUrl = `${this.API_URL}?lat=${lat}&lon=${lng}&key=${apiKey}`;
            const response = await fetch(fetchUrl);

            if (!response.ok) {
                console.warn(`[IQAIR SERVICE] API mengembalikan status ${response.status}. Mengaktifkan fallback simulasi.`);
                return this.generateSimulationData(lat, lng, 'Bogor (Fallback)');
            }

            const rawJson = await response.json();

            if (rawJson.status !== 'success') {
                return this.generateSimulationData(lat, lng, 'Bogor (Fallback)');
            }

            const iqData = rawJson.data;
            return {
                city: iqData.city || 'Cibinong',
                state: iqData.state || 'Jawa Barat',
                country: iqData.country || 'Indonesia',
                aqi: iqData.current.pollution.aqius ?? 0,
                mainPollutant: this.mapPollutantCode(iqData.current.pollution.mainus),
                weather: {
                    temperature: iqData.current.weather.tp ?? 0,
                    humidity: iqData.current.weather.hu ?? 0,
                    windSpeed: iqData.current.weather.ws ?? 0,
                    windDirection: iqData.current.weather.wd ?? 0,
                    pressure: iqData.current.weather.pr ?? 0,
                },
                source: 'live'
            };
        } catch (error) {
            console.error('[IQAIR SERVICE] Panggilan jaringan gagal. Mengaktifkan fallback simulasi.', error);
            return this.generateSimulationData(lat, lng, 'Bogor (Offline Fallback)');
        }
    }

    /**
     * Mengambil data kualitas udara berdasarkan koordinat spasial
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

        // 1. CHECK LOCAL CACHE
        const now = Date.now();
        const cachedEntry = this.cache.get(cacheKey);
        if (cachedEntry && cachedEntry.expiresAt > now) {
            return {
                ...cachedEntry.data,
                source: 'cache'
            };
        }

        // 2. CHECK DATABASE (Mencocokkan koordinat dengan stasiun klaster terdekat di database lokal)
        try {
            const dbClusters = await prisma.aqiCache.findMany();
            let closestCluster = null;
            let minDistanceSq = 0.01; // Batas toleransi radius spasial dekat (~11 km)

            for (const cluster of dbClusters) {
                const dLat = lat - parseFloat(cluster.lat);
                const dLng = lng - parseFloat(cluster.lng);
                const distSq = dLat * dLat + dLng * dLng;

                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    closestCluster = cluster;
                }
            }

            // Jika koordinat dekat dengan klaster di DB lokal, langsung sajikan data DB (Hemat rate limit)
            if (closestCluster) {
                const weatherObj = closestCluster.weather as any;
                const parsedData: ParsedAqiData = {
                    city: closestCluster.name,
                    state: 'Jawa Barat',
                    country: 'Indonesia',
                    aqi: closestCluster.aqi,
                    mainPollutant: closestCluster.aqi > 100 ? 'PM2.5 (Debu Halus)' : 'O3 (Ozon Permukaan)',
                    weather: {
                        temperature: weatherObj?.temperature ?? 0,
                        humidity: weatherObj?.humidity ?? 0,
                        windSpeed: weatherObj?.windSpeed ?? 0,
                        windDirection: weatherObj?.windDirection ?? 0,
                        pressure: weatherObj?.pressure ?? 0,
                    },
                    source: closestCluster.source as 'live' | 'simulation',
                    cachedAt: closestCluster.updatedAt.toISOString()
                };

                this.cache.set(cacheKey, {
                    data: parsedData,
                    expiresAt: now + this.DEFAULT_TTL
                });

                return parsedData;
            }
        } catch (e) {
            console.warn("[IQAIR SERVICE] Gagal mencocokkan koordinat dengan database:", e);
        }

        // 3. DIRECT FETCH (Mundur ke tarikan langsung jika koordinat berada jauh di luar klaster pengawasan)
        const telemetry = await this.fetchTelemetryDirectly(lat, lng);
        this.cache.set(cacheKey, {
            data: telemetry,
            expiresAt: now + this.DEFAULT_TTL
        });

        return telemetry;
    }

    /**
     * MENGAMBIL DATA BATCH TELEMETRI KLASTER (REFAKTORISASI TOTAL - DATABASE ONLY)
     * Mengakses database lokal dengan performa O(1) tanpa memicu request eksternal ke IQAir.
     */
    public static async getBatchTelemetry(): Promise<BogorClusterTelemetry[]> {
        try {
            // Ambil seluruh data klaster yang di-cache di PostgreSQL lokal
            const cachedClusters = await prisma.aqiCache.findMany({
                orderBy: { clusterId: 'asc' }
            });

            // SELF-SEEDING / LAZY INITIALIZATION
            // Jika database kosong, lakukan seeding asinkron darurat agar GIS Map tidak kosong
            if (cachedClusters.length === 0) {
                console.log("[IQAIR SERVICE] Database AqiCache kosong. Memulai seeding darurat...");
                const seededResults: BogorClusterTelemetry[] = [];

                for (const cluster of this.BOGOR_CLUSTERS) {
                    const simulated = this.generateSimulationData(cluster.lat, cluster.lng, cluster.name);

                    // Trigger penulisan DB tanpa memblokir
                    prisma.aqiCache.create({
                        data: {
                            clusterId: cluster.id,
                            name: cluster.name,
                            lat: String(cluster.lat),
                            lng: String(cluster.lng),
                            aqi: simulated.aqi,
                            weather: simulated.weather as any,
                            source: 'simulation'
                        }
                    }).catch(e => console.error("[IQAIR SERVICE] Gagal menyimpan data seed:", e));

                    seededResults.push({
                        id: cluster.id,
                        name: cluster.name,
                        lat: cluster.lat,
                        lng: cluster.lng,
                        telemetry: simulated
                    });
                }
                return seededResults;
            }

            // Memetakan struktur database ke tipe kontraktual BogorClusterTelemetry
            return cachedClusters.map((dbCluster) => {
                const weatherObj = dbCluster.weather as any;
                return {
                    id: dbCluster.clusterId,
                    name: dbCluster.name,
                    lat: parseFloat(dbCluster.lat),
                    lng: parseFloat(dbCluster.lng),
                    telemetry: {
                        city: dbCluster.name,
                        state: 'Jawa Barat',
                        country: 'Indonesia',
                        aqi: dbCluster.aqi,
                        mainPollutant: dbCluster.aqi > 100 ? 'PM2.5 (Debu Halus)' : 'O3 (Ozon Permukaan)',
                        weather: {
                            temperature: weatherObj?.temperature ?? 0,
                            humidity: weatherObj?.humidity ?? 0,
                            windSpeed: weatherObj?.windSpeed ?? 0,
                            windDirection: weatherObj?.windDirection ?? 0,
                            pressure: weatherObj?.pressure ?? 0,
                        },
                        source: dbCluster.source as 'live' | 'simulation',
                        cachedAt: dbCluster.updatedAt.toISOString()
                    }
                };
            });

        } catch (err: any) {
            console.error("[IQAIR SERVICE] Gagal query AqiCache database. Mundur ke simulasi on-the-fly:", err.message);

            // Absolute Fallback: kembalikan simulasi instan jika database mengalami kerusakan fatal
            const fallbackResults: BogorClusterTelemetry[] = [];
            for (const cluster of this.BOGOR_CLUSTERS) {
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
     * Generator Telemetri Buatan Realistis (Simulation Engine)
     */
    private static generateSimulationData(lat: number, lng: number, prefix: string): ParsedAqiData {
        const seed = Math.abs(Math.sin(lat) * Math.cos(lng));
        const baseAqi = Math.floor(45 + (seed * 120)); // Rentang 45 - 165

        return {
            city: prefix,
            state: 'Jawa Barat',
            country: 'Indonesia',
            aqi: baseAqi,
            mainPollutant: baseAqi > 100 ? 'PM2.5 (Debu Halus)' : 'O3 (Ozon Permukaan)',
            weather: {
                temperature: Math.floor(25 + (seed * 7)),
                humidity: Math.floor(65 + (seed * 25)),
                windSpeed: parseFloat((1.0 + (seed * 5)).toFixed(1)),
                windDirection: Math.floor(seed * 360),
                pressure: Math.floor(1008 + (seed * 4))
            },
            source: 'simulation',
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
            p2: 'PM2.5 (Debu Halus)',
            p1: 'PM10 (Partikel Dust)',
            o3: 'O3 (Ozon Permukaan)',
            n2: 'NO2 (Nitrogen Dioksida)',
            s2: 'SO2 (Sulfur Dioksida)',
            co: 'CO (Karbon Monoksida)'
        };
        return map[code] || `Polutan ${code.toUpperCase()}`;
    }
}