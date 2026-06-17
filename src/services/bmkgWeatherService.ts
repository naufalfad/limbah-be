// src/services/bmkgWeatherService.ts
import dotenv from 'dotenv';

dotenv.config();

export interface BmkgWeatherForecast {
    subdistrictCode: string;
    subdistrictName: string;
    districtName: string;
    cityName: string;
    temperature: number;      // Dipetakan dari 't' (°C)
    humidity: number;         // Dipetakan dari 'hu' (%)
    windSpeed: number;        // Dipetakan dari 'ws' (km/jam)
    windDirection: string;    // Dipetakan dari 'wd' (Arah Angin)
    cloudCover: number;       // Dipetakan dari 'tcc' (%)
    weatherDesc: string;      // Dipetakan dari 'weather_desc'
    localTime: string;
    isSimulated: boolean;
}

interface CacheEntry {
    data: BmkgWeatherForecast;
    expiresAt: number;
}

export class BmkgWeatherService {
    // In-Memory Cache untuk mencegah redundansi API call ke BMKG (Rate-limit: 60 req/min)
    private static cache = new Map<string, CacheEntry>();
    private static readonly CACHE_TTL_MS = 3600 * 1000; // 1 Jam TTL
    private static readonly API_URL = "https://api.bmkg.go.id/publik/prakiraan-cuaca";

    /**
     * Mengambil data prakiraan cuaca tingkat kelurahan/desa dari BMKG secara real-time.
     * Mengimplementasikan Adapter Pattern dengan pengamanan caching dan fallback otomatis.
     */
    public static async getWeatherBySubdistrict(subdistrictCode: string): Promise<BmkgWeatherForecast> {
        if (!subdistrictCode) {
            // PROTECTED VARIATION FALLBACK: Diarahkan ke pusat administrasi Ketapang, MB Ketapang, Sampit [3]
            return this.generateSimulatedWeather(subdistrictCode, "Ketapang", "Mentawa Baru Ketapang");
        }

        const now = Date.now();
        const cached = this.cache.get(subdistrictCode);

        // 1. EVALUASI CACHE (Mencegah HTTP 429 Too Many Requests)
        if (cached && cached.expiresAt > now) {
            return cached.data;
        }

        try {
            const url = `${this.API_URL}?adm4=${subdistrictCode}`;
            console.log(`[BMKG SERVICE] Mengambil cuaca luar untuk ADM4 KWT: ${subdistrictCode}...`);

            const response = await fetch(url, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });

            if (!response.ok) {
                throw new Error(`BMKG API returned status ${response.status}`);
            }

            const rawJson = await response.json();
            const forecastList = rawJson.data || [];

            if (forecastList.length === 0) {
                throw new Error("Payload data cuaca kosong.");
            }

            // 2. ALGORITMA PENCARIAN WAKTU TERDEKAT (Closest-Time Selector)
            // Memilih entri ramalan cuaca per 3 jam dari BMKG yang paling dekat dengan jam saat ini
            const currentSystemTime = new Date();
            let closestEntry = forecastList[0];
            let minDiffMs = Infinity;

            for (const entry of forecastList) {
                // Membaca tanggal lokal dari payload BMKG (format: YYYY-MM-DD HH:mm:ss)
                const entryTime = new Date(entry.local_datetime.replace(" ", "T"));
                const diffMs = Math.abs(currentSystemTime.getTime() - entryTime.getTime());

                if (diffMs < minDiffMs) {
                    minDiffMs = diffMs;
                    closestEntry = entry;
                }
            }

            const location = rawJson.lokasi || {};
            const subdistrictName = location.desa || "Sampit";
            const districtName = location.kecamatan || "Mentawa Baru Ketapang";
            const cityName = location.kotkab || "Kabupaten Kotawaringin Timur";

            // 3. PARSING DATA & STANDARDIKASI SATUAN (Type Safety)
            const result: BmkgWeatherForecast = {
                subdistrictCode,
                subdistrictName,
                districtName,
                cityName,
                temperature: parseFloat(String(closestEntry.t || 28)),
                humidity: parseFloat(String(closestEntry.hu || 75)),
                windSpeed: parseFloat(String(closestEntry.ws || 10)),
                windDirection: String(closestEntry.wd || "Utara"),
                cloudCover: parseFloat(String(closestEntry.tcc || 50)),
                weatherDesc: String(closestEntry.weather_desc || "Cerah Berawan"),
                localTime: String(closestEntry.local_datetime),
                isSimulated: false
            };

            // Simpan ke Cache Lokal
            this.cache.set(subdistrictCode, {
                data: result,
                expiresAt: now + this.CACHE_TTL_MS
            });

            return result;

        } catch (error: any) {
            console.warn(`[BMKG SERVICE] Gagal fetch BMKG ADM4 ${subdistrictCode}: ${error.message}. Menggunakan fallback.`);
            // Skenario fallback otomatis untuk menjamin aplikasi luring bebas crash
            return this.generateSimulatedWeather(subdistrictCode);
        }
    }

    /**
     * Penghasil data cuaca tiruan geografis realistis (Deterministic Fallback)
     * Ditargetkan khusus untuk wilayah administratif di Kabupaten Kotawaringin Timur [3]
     */
    private static generateSimulatedWeather(
        subdistrictCode: string,
        subName = "Baamang Barat",
        distName = "Baamang"
    ): BmkgWeatherForecast {
        const hash = subdistrictCode ? subdistrictCode.split('.').reduce((acc, val) => acc + parseInt(val || "0", 10), 0) : 12;
        const seed = Math.abs(Math.sin(hash));

        // Menciptakan variasi cuaca logis tropis basah (Cerah Berawan s/d Hujan Ringan)
        const weatherOptions = ["Cerah Berawan", "Cerah Berawan", "Berawan", "Hujan Ringan", "Cerah"];
        const weatherIdx = Math.floor(seed * weatherOptions.length);
        const weatherDesc = weatherOptions[weatherIdx];

        const isRainy = weatherDesc === "Hujan Ringan";

        return {
            subdistrictCode,
            subdistrictName: subName,
            districtName: distName,
            cityName: "Kabupaten Kotawaringin Timur",
            temperature: isRainy ? parseFloat((25 + seed * 2).toFixed(1)) : parseFloat((29 + seed * 4).toFixed(1)),
            humidity: isRainy ? parseFloat((85 + seed * 10).toFixed(0)) : parseFloat((70 + seed * 15).toFixed(0)),
            windSpeed: parseFloat((4 + seed * 10).toFixed(1)),
            windDirection: seed > 0.5 ? "Barat Daya" : "Timur Laut",
            cloudCover: isRainy ? 75 : 30,
            weatherDesc,
            localTime: new Date().toISOString().replace("T", " ").substring(0, 19),
            isSimulated: true
        };
    }
}