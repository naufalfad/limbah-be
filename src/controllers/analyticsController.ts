import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { IqairService } from '../services/iqairService';

const prisma = new PrismaClient();

/**
 * [NEW CONTROLLER] Mengambil data telemetri Kualitas Udara (AQI) dan Cuaca Real-time
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
 * [NEW CONTROLLER FUNCTION] Mengambil seluruh data telemetri kualitas udara batch
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