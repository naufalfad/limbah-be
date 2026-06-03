// src/server.ts
import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { IqairService } from './services/iqairService'; // INJEKSI IMPOR: Membawa layanan pengelola stasiun klaster

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`   SIJAGA LINGKUNGAN BACKEND IS RUNNING        `);
  console.log(`   Port   : http://localhost:${PORT}           `);
  console.log(`   Env    : ${process.env.NODE_ENV || 'development'}`);
  console.log(`===============================================`);

  // INJEKSI BARU: Inisialisasi Throttled Background Worker Caching Kualitas Udara (LOD Protection)
  IqairService.initBackgroundWorker();
});