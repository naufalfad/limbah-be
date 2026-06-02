// src/config/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Pastikan environment ter-load
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error("CRITICAL ARCHITECTURE ERROR: GEMINI_API_KEY tidak ditemukan di file .env. Sistem AI tidak dapat dijalankan.");
}

/**
 * ============================================================================
 * GEMINI AI CONFIGURATION (SINGLETON PATTERN)
 * ============================================================================
 * Menggunakan Singleton Pattern untuk menjamin hanya ada 1 instance dari 
 * GoogleGenerativeAI client selama lifecycle server Node.js berjalan.
 * Ini mencegah terjadinya TCP Connection Leak saat request menumpuk.
 */
class GeminiConfig {
    private static instance: GoogleGenerativeAI;

    // Private constructor mencegah instansiasi manual dengan 'new'
    private constructor() { }

    public static getInstance(): GoogleGenerativeAI {
        if (!GeminiConfig.instance) {
            GeminiConfig.instance = new GoogleGenerativeAI(apiKey as string);
            console.log("[SYSTEM] Google Generative AI Client berhasil diinisialisasi (Singleton).");
        }
        return GeminiConfig.instance;
    }
}

export const geminiClient = GeminiConfig.getInstance();

// Kita standarkan menggunakan model Flash. 
// Sangat cepat dan sangat efisien untuk mem-parsing data JSON yang akan kita buat.
export const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";