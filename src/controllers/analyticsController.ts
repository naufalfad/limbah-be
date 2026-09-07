// src/controllers/analyticsController.ts
import { Request, Response } from 'express';
import { PrismaClient, SourceType } from '@prisma/client';
import { IqairService } from '../services/iqairService';
import { PredictiveHydrologicalEngine } from '../services/predictiveEngine';

const prisma = new PrismaClient();

/**
 * [PROTECTED] Mengambil data telemetri Kualitas Udara (AQI) dan Cuaca Real-time
 * berdasarkan koordinat spasial (latitude & longitude) dari Frontend.
 * GRASP: Controller & High Cohesion
 */
export async function getAqiTelemetry(req: Request, res: Response) {
    try {
        const lat = req.query.lat as string;
        const lng = req.query.lng as string;

        // Validasi parameter wajib (Guard Clause)
        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                error: 'Parameter geospasial lat (latitude) dan lng (longitude) wajib disertakan.'
            });
        }

        // Melakukan sanitasi tipe float dasar
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);

        if (isNaN(latNum) || isNaN(lngNum)) {
            return res.status(400).json({
                success: false,
                error: 'Format koordinat tidak valid. Harus berupa angka desimal.'
            });
        }

        // Memanggil lapisan Indirection (iqairService) yang memegang algoritma cache & fallback
        const telemetryData = await IqairService.getTelemetryByCoords(lat, lng);

        return res.status(200).json({
            success: true,
            data: telemetryData
        });

    } catch (error: any) {
        console.error('Get AQI telemetry controller error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}

/**
 * [PROTECTED] Mengambil seluruh data telemetri kualitas udara batch
 * dari 7 stasiun klaster Kabupaten Bogor tanpa parameter koordinat eksternal.
 * GRASP: Controller, Indirection, & High Cohesion
 */
export async function getBatchAqiTelemetry(req: Request, res: Response) {
    try {
        // Mendelegasikan pencarian batch langsung ke Service Layer (Information Expert)
        const batchData = await IqairService.getBatchTelemetry();

        return res.status(200).json({
            success: true,
            data: batchData
        });
    } catch (error: any) {
        console.error('Get batch AQI telemetry controller error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}

/**
 * Menghitung KPI Eksekutif, Tren Limbah Mingguan, 
 * dan Distribusi Kepatuhan Spasial untuk Pimpinan (Auditor).
 */
export async function getExecutiveAnalytics(req: Request, res: Response) {
    try {
        // 1. Hitung Total Usaha Aktif Terdaftar (Approved)
        const totalCompanies = await prisma.company.count({
            where: { status: 'APPROVED' }
        });

        // 2. Hitung Rata-rata Skor Kepatuhan ESG Daerah
        const avgEsgResult = await prisma.company.aggregate({
            where: { status: 'APPROVED' },
            _avg: { score: true }
        });
        const averageEsg = avgEsgResult._avg.score ? parseFloat(avgEsgResult._avg.score.toFixed(1)) : 0;

        // 3. Hitung Delta Kepatuhan Bulan Ini vs Bulan Lalu (Berdasarkan Skor Inspeksi Selesai)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const prevMonth = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0');
        const prevYear = now.getMonth() === 0 ? currentYear - 1 : currentYear;

        const currentMonthPrefix = `${currentYear}-${currentMonth}`; // Format: YYYY-MM
        const prevMonthPrefix = `${prevYear}-${prevMonth}`;

        const currentMonthAvg = await prisma.inspection.aggregate({
            where: { status: 'Selesai', date: { startsWith: currentMonthPrefix } },
            _avg: { score: true }
        });
        const prevMonthAvg = await prisma.inspection.aggregate({
            where: { status: 'Selesai', date: { startsWith: prevMonthPrefix } },
            _avg: { score: true }
        });

        const currentAvg = currentMonthAvg._avg.score || 0;
        const prevAvg = prevMonthAvg._avg.score || 0;

        // Perhitungan Delta (%) MoM
        const esgDelta = prevAvg > 0
            ? parseFloat((((currentAvg - prevAvg) / prevAvg) * 100).toFixed(1))
            : 0;

        // 4. Hitung Akumulasi Total Volume Limbah B3 Terangkut
        // Kategori B3 diidentifikasi jika tipe limbah mengandung "B3", "Oli", atau "Kimia"
        const totalB3Result = await prisma.wasteLog.aggregate({
            where: {
                OR: [
                    { type: { contains: 'B3', mode: 'insensitive' } },
                    { type: { contains: 'Oli', mode: 'insensitive' } },
                    { type: { contains: 'Kimia', mode: 'insensitive' } }
                ]
            },
            _sum: { volume: true }
        });
        const totalWasteB3 = totalB3Result._sum.volume || 0;

        // 5. Hitung Keuangan: Realisasi Retribusi Masuk (Settled) vs Nunggak (Unpaid)
        const invoicesSum = await prisma.invoice.groupBy({
            by: ['status'],
            _sum: { amount: true }
        });
        const totalRevenue = invoicesSum.find(i => i.status === 'SETTLED')?._sum.amount || 0;
        const unpaidRevenue = invoicesSum.find(i => i.status === 'UNPAID')?._sum.amount || 0;

        // 6. Poligon/Chart Mingguan: Tren Volume Limbah B3 7 Hari Terakhir (Time-Series)
        const weeklyWasteChart: { date: string; volume: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            weeklyWasteChart.push({ date: dateStr, volume: 0 });
        }

        const startDateStr = weeklyWasteChart[0].date;
        const rawWasteLogs = await prisma.wasteLog.groupBy({
            by: ['date'],
            where: {
                date: { gte: startDateStr },
                OR: [
                    { type: { contains: 'B3', mode: 'insensitive' } },
                    { type: { contains: 'Oli', mode: 'insensitive' } },
                    { type: { contains: 'Kimia', mode: 'insensitive' } }
                ]
            },
            _sum: { volume: true }
        });

        rawWasteLogs.forEach(log => {
            const match = weeklyWasteChart.find(item => item.date === log.date);
            if (match) {
                match.volume = log._sum.volume || 0;
            }
        });

        // 7. Distribusi Zona Kepatuhan Spasial (Peta Legenda)
        const approvedCompanies = await prisma.company.findMany({
            where: { status: 'APPROVED', score: { not: null } },
            select: { score: true }
        });

        let sangatPatuh = 0; // >= 80
        let cukupPatuh = 0;  // 60-79
        let kritis = 0;      // < 60

        approvedCompanies.forEach(c => {
            const score = c.score || 0;
            if (score >= 80) sangatPatuh++;
            else if (score >= 60) cukupPatuh++;
            else kritis++;
        });

        return res.status(200).json({
            success: true,
            data: {
                totalCompanies,
                averageEsg,
                esgDelta,
                totalWasteB3,
                totalRevenue,
                unpaidRevenue,
                weeklyWasteChart,
                distribution: { sangatPatuh, cukupPatuh, kritis }
            }
        });
    } catch (error) {
        console.error('Get executive analytics error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * Menghitung KPI Kinerja Operasional DLH, Bottleneck Pengawasan,
 * dan Log Inspeksi Terkini.
 */
export async function getPerformanceAnalytics(req: Request, res: Response) {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Hitung Dokumen Menunggu Tinjauan (Pending / Review)
        const pendingApprovals = await prisma.company.count({
            where: { status: { in: ['PENDING', 'REVIEW'] } }
        });

        // 2. Hitung Total Inspeksi Selesai
        const completedInspections = await prisma.inspection.count({
            where: { status: 'Selesai' }
        });

        // 3. Hitung Sidak Jatuh Tempo (Terjadwal tapi tanggal sudah terlampaui hari ini)
        const overdueInspections = await prisma.inspection.count({
            where: {
                status: 'Terjadwal',
                date: { lt: todayStr }
            }
        });

        // 4. Ambil 5 Laporan Inspeksi Terakhir (Log Kunjungan)
        const rawInspections = await prisma.inspection.findMany({
            take: 5,
            orderBy: { date: 'desc' },
            include: {
                company: {
                    select: { companyName: true }
                }
            }
        });

        const recentInspections = rawInspections.map(i => ({
            id: i.id,
            companyId: i.companyId,
            companyName: i.company?.companyName || 'Unknown Company',
            inspectorId: i.inspectorId,
            inspectorName: i.inspectorName,
            date: i.date,
            score: i.score,
            status: i.status,
            location: i.location,
            notes: i.notes
        }));

        // 5. Komposisi Jenis Dokumen Terdaftar (SPPL vs UKL-UPL)
        const docTypes = await prisma.company.groupBy({
            by: ['docType'],
            _count: { id: true }
        });

        const ssplCount = docTypes.find(d => d.docType === 'SPPL')?._count.id || 0;
        const uklUplCount = docTypes.find(d => d.docType === 'UKL_UPL')?._count.id || 0;
        const amdalCount = docTypes.find(d => d.docType === 'AMDAL')?._count.id || 0;

        return res.status(200).json({
            success: true,
            data: {
                pendingApprovals,
                completedInspections,
                overdueInspections,
                recentInspections,
                documentComposition: {
                    sppl: ssplCount,
                    uklUpl: uklUplCount,
                    amdal: amdalCount
                }
            }
        });
    } catch (error) {
        console.error('Get performance analytics error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

// ============================================================================
// [PENGELOLA DATA KUALITAS AIR SUNGAI (ADAPTER TELEMETRI AIR) - UPDATED [3]]
// ============================================================================

/**
 * Mengambil seluruh data stasiun kualitas air beserta log pengujian terbarunya.
 * Terintegrasi penuh dengan Predictive Hydrological Engine [3].
 * GRASP: Controller, Indirection, & High Cohesion
 */
export async function getWaterStations(req: Request, res: Response) {
    try {
        // Ambil data stasiun air lengkap dengan relasi log historis dari database [3]
        const stations = await prisma.waterStation.findMany({
            include: {
                telemetryLogs: {
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        // Iterasi kalkulasi telemetri secara paralel (Adapter Pattern & Indirection) [3]
        const mappedStations = await Promise.all(stations.map(async (station) => {
            // 1. Eksekusi perhitungan real-time berbasis anomali BMKG dan beban industri hulu [3]
            const liveResult = await PredictiveHydrologicalEngine.calculateCurrentWaterQuality(station.id);

            // 2. Map log historis dari database PostgreSQL [3]
            const logs = station.telemetryLogs.map(log => ({
                month: log.month,
                bod: log.bod,
                cod: log.cod,
                do: log.do,
                ph: log.ph
            }));

            // 3. Gabungkan bulan aktif hasil kalkulasi sebagai payload penutup [3]
            const currentMonthName = new Date().toLocaleString('id-ID', { month: 'short' });
            const currentData = {
                month: currentMonthName,
                bod: liveResult.bod,
                cod: liveResult.cod,
                do: liveResult.do,
                ph: liveResult.ph,
                weather: liveResult.weather, // Metadata cuaca mikro BMKG [1]
                source: liveResult.source
            };

            // 4. Batasi grafik total history maksimal 12 bulan agar tidak terjadi overflow di frontend [3]
            const monthlyHistory = [...logs, currentData].slice(-12);

            return {
                id: station.id,
                name: station.name,
                lat: parseFloat(station.lat), // Ubah tipe string database ke desimal untuk Leaflet [3]
                lng: parseFloat(station.lng),
                // Jika data terkorelasi sukses dengan satelit cuaca BMKG, set tipe ke PHYSICAL_IOT
                sourceType: liveResult.source === 'LIVE_BMKG_CORRELATED' ? SourceType.PHYSICAL_IOT : station.sourceType,
                status: station.status,
                currentData,
                monthlyHistory
            };
        }));

        return res.status(200).json({
            success: true,
            data: mappedStations
        });

    } catch (error: any) {
        console.error('Get water stations controller error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}

/**
 * Mengambil data historis log uji laboratorium air untuk satu stasiun air spesifik.
 * Terintegrasi penuh dengan Predictive Hydrological Engine [3].
 */
export async function getWaterStationLogs(req: Request, res: Response) {
    try {
        const { id } = req.params;

        // Ambil logbook dari DB lokal
        const logs = await prisma.waterTelemetryLog.findMany({
            where: { stationId: id },
            orderBy: { createdAt: 'asc' }
        });

        // 1. Eksekusi perhitungan real-time untuk bulan aktif berjalan [3]
        const liveResult = await PredictiveHydrologicalEngine.calculateCurrentWaterQuality(id);

        const mappedLogs = logs.map(log => ({
            month: log.month,
            bod: log.bod,
            cod: log.cod,
            do: log.do,
            ph: log.ph
        }));

        // 2. Gabungkan data masa lalu dengan perhitungan aktif hari ini
        const currentMonthName = new Date().toLocaleString('id-ID', { month: 'short' });
        const finalLogs = [
            ...mappedLogs,
            {
                month: currentMonthName,
                bod: liveResult.bod,
                cod: liveResult.cod,
                do: liveResult.do,
                ph: liveResult.ph
            }
        ].slice(-12);

        return res.status(200).json({
            success: true,
            data: finalLogs
        });

    } catch (error: any) {
        console.error('Get water station logs error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}

// ============================================================================
// [NEW CONTROLLER] TITIK API / WILDFIRE (NASA FIRMS & GIBS PROXY)
// ============================================================================

export interface WildfireHotspot {
    id: string;
    latitude: number;
    longitude: number;
    brightness: number; // Kelvin
    scan: number;
    track: number;
    acq_date: string;
    acq_time: string;
    satellite: string; // 'Terra' | 'Aqua' | 'SNPP' | 'NOAA-20'
    instrument: string; // 'MODIS' | 'VIIRS'
    confidence: string | number; // 'nominal' | 'high' | 'low' or percentage
    version?: string;
    bright_t31?: number;
    frp: number; // Fire Radiative Power (MW)
    daynight: 'D' | 'N';
    locationName?: string;
    source: 'NASA_FIRMS_LIVE' | 'SIMULATED_HOTSPOT';
}

let cachedWildfires: { data: WildfireHotspot[]; timestamp: number } | null = null;
const WILDFIRE_CACHE_TTL = 10 * 60 * 1000; // 10 menit

/**
 * Mengambil data titik api / hotspot aktif (MODIS / VIIRS) dari NASA FIRMS API.
 * Jika MAP_KEY tidak disetel atau terjadi gangguan jaringan, sistem otomatis
 * beralih ke data telemetri spasial hotspot terkalibrasi di wilayah Bogor & Kotawaringin Timur.
 */
export async function getWildfires(req: Request, res: Response) {
    try {
        const now = Date.now();
        if (cachedWildfires && now - cachedWildfires.timestamp < WILDFIRE_CACHE_TTL) {
            return res.status(200).json({
                success: true,
                count: cachedWildfires.data.length,
                source: cachedWildfires.data[0]?.source || 'CACHED',
                data: cachedWildfires.data
            });
        }

        const apiKey = process.env.FIRMS_MAP_KEY;
        const isApiKeyValid = apiKey && apiKey.trim() !== '' && apiKey !== 'your_nasa_firms_map_key_here';

        let hotspots: WildfireHotspot[] = [];

        if (isApiKeyValid) {
            try {
                // Request data 1 hari terakhir untuk Bounding Box Indonesia via VIIRS SNPP NRT
                // Indonesia BBox: min_lon 95, min_lat -11, max_lon 141, max_lat 6
                const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/95,-11,141,6/1`;
                const response = await fetch(firmsUrl, { signal: AbortSignal.timeout(10000) });
                
                if (response.ok) {
                    const csvText = await response.text();
                    const lines = csvText.trim().split('\n');
                    
                    if (lines.length > 1 && !csvText.includes('Invalid API call')) {
                        const headers = lines[0].split(',').map(h => h.trim());
                        const parsed: WildfireHotspot[] = [];
                        
                        // Parse baris CSV ke objek JSON
                        for (let i = 1; i < lines.length; i++) {
                            const cols = lines[i].split(',').map(c => c.trim());
                            if (cols.length >= headers.length) {
                                const lat = parseFloat(cols[headers.indexOf('latitude')]);
                                const lng = parseFloat(cols[headers.indexOf('longitude')]);
                                const bright = parseFloat(cols[headers.indexOf('bright_ti4')]) || 330;
                                const frp = parseFloat(cols[headers.indexOf('frp')]) || 10;
                                const rawConf = cols[headers.indexOf('confidence')] || 'n';
                                const acqDate = cols[headers.indexOf('acq_date')] || new Date().toISOString().split('T')[0];
                                const rawTime = cols[headers.indexOf('acq_time')] || '0430';
                                const rawSat = cols[headers.indexOf('satellite')] || 'N';

                                if (!isNaN(lat) && !isNaN(lng)) {
                                    // Format tingkat keyakinan
                                    const confStr = rawConf === 'h' ? 'high' : rawConf === 'l' ? 'low' : 'nominal';
                                    
                                    // Format satelit
                                    const satName = rawSat === 'N' ? 'VIIRS (Suomi NPP)' : rawSat === '1' ? 'VIIRS (NOAA-20)' : rawSat === '2' ? 'VIIRS (NOAA-21)' : `VIIRS (${rawSat})`;

                                    // Format waktu (misal: 427 -> 04:27 UTC)
                                    const paddedTime = rawTime.padStart(4, '0');
                                    const formattedTime = `${paddedTime.slice(0, 2)}:${paddedTime.slice(2, 4)} UTC`;

                                    // Cek kedekatan wilayah pantauan
                                    let locationLabel = `Koordinat: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                                    if (lat >= -7.0 && lat <= -6.2 && lng >= 106.4 && lng <= 107.2) {
                                        locationLabel = `Wilayah Pantauan Jawa Barat / Bogor (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                                    } else if (lat >= -3.5 && lat <= -1.5 && lng >= 111.5 && lng <= 113.5) {
                                        locationLabel = `Wilayah Pantauan Kotim / Kalimantan (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                                    }

                                    parsed.push({
                                        id: `firms-live-${i}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
                                        latitude: lat,
                                        longitude: lng,
                                        brightness: bright,
                                        scan: parseFloat(cols[headers.indexOf('scan')]) || 0.4,
                                        track: parseFloat(cols[headers.indexOf('track')]) || 0.4,
                                        acq_date: acqDate,
                                        acq_time: formattedTime,
                                        satellite: satName,
                                        instrument: 'VIIRS',
                                        confidence: confStr,
                                        frp: frp,
                                        daynight: cols[headers.indexOf('daynight')] === 'N' ? 'N' : 'D',
                                        locationName: locationLabel,
                                        source: 'NASA_FIRMS_LIVE'
                                    });
                                }
                            }
                        }

                        // Urutkan berdasarkan intensitas radiasi termal (FRP) tertinggi
                        parsed.sort((a, b) => b.frp - a.frp);

                        // Ambil top 400 titik api paling signifikan agar peta Leaflet tetap responsif
                        hotspots = parsed.slice(0, 400);
                        console.log(`[FIRMS] Berhasil memuat ${parsed.length} titik api riil dari NASA FIRMS (diambil top ${hotspots.length} untuk visualisasi GIS).`);
                    }
                }
            } catch (fetchErr: any) {
                console.warn('[FIRMS] Gagal mengambil data langsung dari NASA FIRMS API, mengaktifkan fail-safe simulation:', fetchErr.message);
            }
        }

        // Jika tidak ada data dari FIRMS (karena key belum disetel atau jaringan error), gunakan fallback simulasi
        if (hotspots.length === 0) {
            const todayStr = new Date().toISOString().split('T')[0];
            hotspots = [
                {
                    id: 'hotspot-bgr-01',
                    latitude: -6.3980,
                    longitude: 106.6340,
                    brightness: 348.4,
                    scan: 0.4,
                    track: 0.4,
                    acq_date: todayStr,
                    acq_time: '06:15 UTC',
                    satellite: 'MODIS (Terra)',
                    instrument: 'MODIS',
                    confidence: 'high',
                    frp: 28.5,
                    daynight: 'D',
                    locationName: 'Kec. Rumpin, Kab. Bogor (Area Terbuka / Tambang)',
                    source: 'SIMULATED_HOTSPOT'
                },
                {
                    id: 'hotspot-bgr-02',
                    latitude: -6.5350,
                    longitude: 106.5520,
                    brightness: 359.1,
                    scan: 0.38,
                    track: 0.36,
                    acq_date: todayStr,
                    acq_time: '06:18 UTC',
                    satellite: 'VIIRS (Suomi NPP)',
                    instrument: 'VIIRS',
                    confidence: 'high',
                    frp: 34.2,
                    daynight: 'D',
                    locationName: 'Kec. Cigudeg, Kab. Bogor (Perkebunan / Lahan Kering)',
                    source: 'SIMULATED_HOTSPOT'
                },
                {
                    id: 'hotspot-bgr-03',
                    latitude: -6.5410,
                    longitude: 107.1230,
                    brightness: 332.8,
                    scan: 0.4,
                    track: 0.4,
                    acq_date: todayStr,
                    acq_time: '06:22 UTC',
                    satellite: 'MODIS (Aqua)',
                    instrument: 'MODIS',
                    confidence: 'nominal',
                    frp: 14.6,
                    daynight: 'D',
                    locationName: 'Kec. Cariu, Kab. Bogor (Pembakaran Jerami Pertanian)',
                    source: 'SIMULATED_HOTSPOT'
                },
                {
                    id: 'hotspot-bgr-04',
                    latitude: -6.5720,
                    longitude: 106.9150,
                    brightness: 326.5,
                    scan: 0.37,
                    track: 0.36,
                    acq_date: todayStr,
                    acq_time: '06:20 UTC',
                    satellite: 'VIIRS (NOAA-20)',
                    instrument: 'VIIRS',
                    confidence: 'low',
                    frp: 9.3,
                    daynight: 'D',
                    locationName: 'Kec. Babakan Madang, Kab. Bogor (Vegetasi Kering)',
                    source: 'SIMULATED_HOTSPOT'
                },
                {
                    id: 'hotspot-ktm-01',
                    latitude: -2.8120,
                    longitude: 112.9430,
                    brightness: 374.2,
                    scan: 0.4,
                    track: 0.4,
                    acq_date: todayStr,
                    acq_time: '04:45 UTC',
                    satellite: 'VIIRS (Suomi NPP)',
                    instrument: 'VIIRS',
                    confidence: 'high',
                    frp: 68.4,
                    daynight: 'D',
                    locationName: 'Kec. Mentaya Hilir Selatan, Kotim (Lahan Gambut Kritis)',
                    source: 'SIMULATED_HOTSPOT'
                },
                {
                    id: 'hotspot-ktm-02',
                    latitude: -2.0540,
                    longitude: 112.7210,
                    brightness: 361.0,
                    scan: 0.4,
                    track: 0.4,
                    acq_date: todayStr,
                    acq_time: '04:47 UTC',
                    satellite: 'MODIS (Terra)',
                    instrument: 'MODIS',
                    confidence: 'high',
                    frp: 42.1,
                    daynight: 'D',
                    locationName: 'Kec. Parenggean, Kotim (Perbatasan Konsesi)',
                    source: 'SIMULATED_HOTSPOT'
                },
                {
                    id: 'hotspot-ktm-03',
                    latitude: -2.5020,
                    longitude: 112.9210,
                    brightness: 338.4,
                    scan: 0.38,
                    track: 0.36,
                    acq_date: todayStr,
                    acq_time: '04:50 UTC',
                    satellite: 'VIIRS (NOAA-20)',
                    instrument: 'VIIRS',
                    confidence: 'nominal',
                    frp: 19.8,
                    daynight: 'D',
                    locationName: 'Kec. Baamang, Sampit, Kotim (Pembersihan Semak)',
                    source: 'SIMULATED_HOTSPOT'
                }
            ];
        }

        cachedWildfires = { data: hotspots, timestamp: now };

        return res.status(200).json({
            success: true,
            count: hotspots.length,
            source: hotspots[0]?.source || 'UNKNOWN',
            firmsMapKey: isApiKeyValid ? apiKey : null,
            wmsUrl: isApiKeyValid ? `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/${apiKey}/` : null,
            data: hotspots
        });
    } catch (error: any) {
        console.error('Get wildfires controller error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}