// src/services/AgentService.ts
import { PrismaClient } from '@prisma/client';
import { geminiClient, geminiModel } from '../config/gemini';
import { GeoSpatialLogic, GeoCompany } from '../utils/GeoSpatialLogic';

const prisma = new PrismaClient();

export class AgentService {
    /**
     * Menganalisis sumber polusi (Root Cause) menggunakan Spatial Logic dan AI Agent.
     */
    public static async analyzePollutionSource(
        targetLat: number,
        targetLng: number,
        zoom: number, // INJEKSI BARU: Parameter Zoom Level dari Frontend [3]
        windDirection: number,
        incidentType: string,
        description: string
    ) {
        // FILTER 1: SCALE-GUARD (Katup Pengaman Skala Makro di Tingkat Backend) [3]
        if (zoom < 8) {
            return {
                culpritName: "TIDAK DIKETAHUI",
                culpritId: "COM-UNKNOWN",
                confidenceScore: 0,
                analysis: "Skala peta saat ini terlalu makro (Zoom Out jauh). Perhitungan arah angin mikro lokal menjadi bias dan tidak akurat. Harap perbesar peta (Zoom In) mendekati wilayah target.",
                recommendedAction: "MONITORING",
                evidencePoints: ["Mata kamera peta terdeteksi pada skala regional/makro."]
            };
        }

        // 1. ADAPTIVE LOD LOGIC (Menentukan radius pencarian secara dinamis berdasarkan Zoom) [3]
        const radiusKm = zoom >= 15 ? 2 : zoom >= 12 ? 5 : 15;

        // 2. DATA GATHERING (Tarik semua pabrik yang berstatus APPROVED)
        const allCompanies = await prisma.company.findMany({
            where: { status: 'APPROVED' },
            select: {
                id: true,
                companyName: true,
                lat: true,
                lng: true,
                kbli: true,
                docType: true,
                rawMaterials: true,
                score: true,
            }
        });

        // 3. PRE-FILTERING (PURE FABRICATION - Menghemat Token AI hingga 95%)
        // Menyaring pabrik dengan radius dinamis sesuai level zoom saat ini [3]
        const suspectCandidates = GeoSpatialLogic.filterUpwindCompanies(
            targetLat,
            targetLng,
            windDirection,
            allCompanies as GeoCompany[],
            radiusKm, // Menggunakan radius dinamis hasil kalkulasi LOD [3]
            60 // Sudut Kipas 60 Derajat
        );

        // Fail-Safe: Jika tidak ada pabrik di jalur angin tersebut
        if (suspectCandidates.length === 0) {
            return {
                culpritName: "TIDAK DIKETAHUI",
                culpritId: "COM-UNKNOWN",
                confidenceScore: 0,
                analysis: `Tidak ditemukan entitas industri terdaftar dalam radius ${radiusKm}KM yang searah dengan datangnya angin. Ada kemungkinan ini adalah pembakaran liar oleh warga atau anomali data.`,
                recommendedAction: "MANUAL_INVESTIGATION",
                evidencePoints: [`Area di jalur angin bersih dari pabrik terdaftar dalam radius ${radiusKm}KM.`]
            };
        }

        // 4. DEEP DATA EXTRACTION (Mengambil Logbook 7 hari terakhir dari Tersangka)
        // Hanya query logbook untuk pabrik yang tertuduh saja!
        const suspectIds = suspectCandidates.map(c => c.id);
        const recentLogs = await prisma.wasteLog.findMany({
            where: {
                companyId: { in: suspectIds },
            },
            orderBy: { date: 'desc' },
            take: 10
        });

        // 5. PROMPT ENGINEERING (Strict JSON Mode dengan Radius Adaptif) [3]
        const prompt = `
Anda adalah Auditor Lingkungan Hidup Senior dan Ahli Forensik Spasial.
Tugas Anda adalah menemukan pelaku pencemaran (perusahaan) berdasarkan data yang diberikan.

DATA KEJADIAN (LAPORAN WARGA):
- Kategori Insiden: ${incidentType}
- Deskripsi: ${description}
- Arah Datangnya Angin (Sumber Polusi): ${windDirection} derajat

DATA KANDIDAT TERSANGKA (Telah difilter berdasarkan arah angin & jarak < ${radiusKm}KM):
${JSON.stringify(suspectCandidates, null, 2)}

DATA LOGBOOK LIMBAH TERAKHIR DARI KANDIDAT:
${JSON.stringify(recentLogs, null, 2)}

INSTRUKSI KERJA:
1. Analisis apakah ada korelasi antara "Deskripsi Kejadian" dengan "Bahan Baku (rawMaterials)" atau "KBLI" dari kandidat.
2. Cek apakah ada penurunan/kenaikan drastis pada "WasteLog" yang mengindikasikan pembuangan liar.
3. Evaluasi "Score ESG (score)" perusahaan. Skor di bawah 60 (merah) meningkatkan probabilitas pelanggaran.
4. Tentukan satu tersangka utama yang paling logis. Jika ragu, berikan probabilitas (Confidence Score).

ATURAN OUTPUT MUTLAK:
Anda DILARANG memberikan teks basa-basi. Anda WAJIB mengembalikan respon HANYA dalam format JSON persis seperti skema berikut, tanpa tag markdown \`\`\`json:
{
  "culpritName": "Nama Perusahaan (atau TIDAK DIKETAHUI)",
  "culpritId": "ID Perusahaan (atau COM-UNKNOWN)",
  "confidenceScore": 85, // Angka 0-100
  "analysis": "Penjelasan logis maksimal 3 kalimat mengapa perusahaan ini dicurigai.",
  "recommendedAction": "INSPECTION" | "WARNING_LETTER" | "MONITORING",
  "evidencePoints": ["Bukti 1", "Bukti 2"]
}`;

        // 6. EKSEKUSI KE GOOGLE GEMINI API
        try {
            const model = geminiClient.getGenerativeModel({
                model: geminiModel,
                generationConfig: {
                    temperature: 0.1, // Suhu rendah = Sangat kaku & analitis (No Hallucination)
                    responseMimeType: "application/json", // PAKSA GEMINI KELUARKAN JSON MURNI
                }
            });

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            // 7. PARSING & RETURN
            const parsedData = JSON.parse(responseText);
            return parsedData;

        } catch (error) {
            console.error("[AGENT_SERVICE] Gagal mengeksekusi Gemini:", error);
            throw new Error("AI Agent gagal melakukan penalaran forensik.");
        }
    }
}