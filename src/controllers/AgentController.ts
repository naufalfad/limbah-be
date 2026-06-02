// src/controllers/AgentController.ts
import { Request, Response } from 'express';
import { AgentService } from '../services/AgentService';

export class AgentController {
    /**
     * Endpoint: POST /api/agent/forensic
     * Menjalankan analisis korelasi spasial berdasarkan laporan aduan warga.
     */
    public static async runForensicScan(req: Request, res: Response): Promise<void> {
        try {
            // Memperluas ekstraksi data menyertakan parameter zoom [3]
            const { lat, lng, zoom, windDirection, incidentType, description } = req.body;

            // 1. Validasi Input Keras (Fail-Fast) - Melindungi Integritas Logika Sistem
            if (
                lat === undefined ||
                lng === undefined ||
                windDirection === undefined ||
                zoom === undefined // Zoom wajib diverifikasi keberadaannya [3]
            ) {
                res.status(400).json({
                    success: false,
                    message: "Parameter spasial tidak lengkap (lat, lng, windDirection, zoom wajib diisi)."
                });
                return;
            }

            if (!incidentType || !description) {
                res.status(400).json({
                    success: false,
                    message: "Data kronologi insiden wajib dilampirkan."
                });
                return;
            }

            // 2. Delegasi ke Service Layer (Information Expert)
            // Mengirimkan parameter zoom yang telah dikonversi secara aman ke Integer [3]
            const analysisResult = await AgentService.analyzePollutionSource(
                parseFloat(lat),
                parseFloat(lng),
                parseInt(String(zoom), 10), // Konversi aman tingkat zoom ke Integer [3]
                parseFloat(windDirection),
                incidentType,
                description
            );

            // 3. Kembalikan Respon Sukses ke Frontend React
            res.status(200).json({
                success: true,
                message: "Analisis AI Forensik Spasial Berhasil",
                data: analysisResult
            });

        } catch (error: any) {
            console.error("[AGENT_CONTROLLER] Error:", error.message);
            res.status(500).json({
                success: false,
                message: "Gagal menjalankan AI Copilot.",
                error: error.message
            });
        }
    }
}