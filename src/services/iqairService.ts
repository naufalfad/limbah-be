import { config } from 'dotenv';

// Memastikan variabel env terbaca
config();

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

export class IqairService {
    // In-Memory Cache Map untuk efisiensi pemanggilan API luar
    private static cache = new Map<string, CacheEntry>();

    private static readonly API_URL = 'https://api.iqair.com/v2/nearest_city';
    private static readonly DEFAULT_TTL = parseInt(process.env.IQAIR_CACHE_TTL_SECONDS || '3600', 10) * 1000;

    /**
     * Mengambil data kualitas udara berdasarkan koordinat spasial
     * GRASP: Information Expert & Indirection
     */
    public static async getTelemetryByCoords(latStr: string, lngStr: string): Promise<ParsedAqiData> {
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        if (isNaN(lat) || isNaN(lng)) {
            throw new Error('Koordinat spasial tidak valid.');
        }

        // 1. LOD COORDINATE ROUNDING: Membulatkan koordinat ke 2 desimal (~1.1 km presisi)
        // Berfungsi meningkatkan cache-hit ratio karena titik industri terdekat berada di klaster yang sama.
        const roundedLat = lat.toFixed(2);
        const roundedLng = lng.toFixed(2);
        const cacheKey = `aqi_${roundedLat}_${roundedLng}`;

        // 2. CHECK LOCAL CACHE
        const now = Date.now();
        const cachedEntry = this.cache.get(cacheKey);
        if (cachedEntry && cachedEntry.expiresAt > now) {
            return {
                ...cachedEntry.data,
                source: 'cache'
            };
        }

        // 3. DETEKSI SIMULATOR MODE (Bypass jika API Key belum terkonfigurasi secara valid)
        const apiKey = process.env.IQAIR_API_KEY;
        const isMockKey = !apiKey || apiKey === 'your_iqair_api_key_here' || apiKey.trim() === '';

        if (isMockKey) {
            const simulatedData = this.generateSimulationData(lat, lng, 'Sampit (Simulasi Spasial)');

            // Simpan data simulasi ke tembolok
            this.cache.set(cacheKey, {
                data: simulatedData,
                expiresAt: now + this.DEFAULT_TTL
            });

            return simulatedData;
        }

        // 4. PEMANGGILAN LIVE KE API IQAIR (Menggunakan global fetch bawaan Node v18+ / ES2022)
        try {
            const fetchUrl = `${this.API_URL}?lat=${lat}&lon=${lng}&key=${apiKey}`;
            const response = await fetch(fetchUrl);

            if (!response.ok) {
                // Jika API IQAir mengembalikan error (misal: Over Limit / Bad Request)
                // Fallback otomatis ke Simulation Mode agar visualisasi GIS Map di FE tidak hancur (Protected Variations)
                console.warn(`[IQAIR SERVICE] API mengembalikan status ${response.status}. Mengaktifkan fallback simulasi.`);
                return this.generateSimulationData(lat, lng, 'Sampit (Fallback)');
            }

            const rawJson = await response.json();

            if (rawJson.status !== 'success') {
                return this.generateSimulationData(lat, lng, 'Sampit (Fallback)');
            }

            const iqData = rawJson.data;
            const parsedData: ParsedAqiData = {
                city: iqData.city || 'Sampit',
                state: iqData.state || 'Kalimantan Tengah',
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
                source: 'live',
                cachedAt: new Date().toISOString()
            };

            // Set Cache
            this.cache.set(cacheKey, {
                data: parsedData,
                expiresAt: now + this.DEFAULT_TTL
            });

            return parsedData;

        } catch (error) {
            // Fail-Safe: Jika jaringan terputus, kembalikan simulasi lokal
            console.error('[IQAIR SERVICE] Panggilan jaringan gagal. Mengaktifkan fallback simulasi.', error);
            return this.generateSimulationData(lat, lng, 'Sampit (Offline Fallback)');
        }
    }

    /**
     * Generator Telemetri Buatan Realistis (Simulation Engine)
     * Menyusun data fluktuatif berbasis parameter wilayah Kotawaringin Timur
     */
    private static generateSimulationData(lat: number, lng: number, prefix: string): ParsedAqiData {
        // Simulasi nilai AQI dinamis yang masuk akal untuk daerah tropis Kalimantan Tengah (Sampit)
        // Kita buat nilai bervariasi antara 25 s.d. 85 (Baik - Sedang) berdasarkan kedekatan koordinat
        const seed = Math.abs(Math.sin(lat) * Math.cos(lng));
        const baseAqi = Math.floor(25 + (seed * 60)); // Rentang 25 - 85

        return {
            city: prefix,
            state: 'Kalimantan Tengah',
            country: 'Indonesia',
            aqi: baseAqi,
            mainPollutant: baseAqi > 50 ? 'PM2.5 (Debu Halus)' : 'CO (Karbon Monoksida)',
            weather: {
                temperature: Math.floor(26 + (seed * 8)), // Rentang 26 - 34 derajat C
                humidity: Math.floor(65 + (seed * 25)),    // Rentang 65% - 90%
                windSpeed: parseFloat((1.5 + (seed * 4)).toFixed(1)), // 1.5 - 5.5 m/s
                windDirection: Math.floor(seed * 360),    // Arah embusan angin acak derajat kompas
                pressure: Math.floor(1008 + (seed * 4))   // 1008 - 1012 hPa
            },
            source: 'simulation',
            cachedAt: new Date().toISOString()
        };
    }

    /**
     * Konverter Kode Polutan IQAir ke format deskripsi ramah pengguna
     */
    private static mapPollutantCode(code: string): string {
        const map: Record<string, string> = {
            p2: 'PM2.5 (Debu Halus)',
            p1: 'PM10 (Partikel Debu Kasar)',
            o3: 'O3 (Ozon Permukaan)',
            n2: 'NO2 (Nitrogen Dioksida)',
            s2: 'SO2 (Sulfur Dioksida)',
            co: 'CO (Karbon Monoksida)'
        };
        return map[code] || `Polutan ${code.toUpperCase()}`;
    }
}