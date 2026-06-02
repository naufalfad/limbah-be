// src/app.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import companyRoutes from './routes/companyRoutes';
import wasteRoutes from './routes/wasteRoutes';
import pickupRoutes from './routes/pickupRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import systemRoutes from './routes/systemRoutes';
import inspectionRoutes from './routes/inspectionRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import reportRoutes from './routes/reportRoutes';
import agentRoutes from './routes/agent.routes'; // IMPOR BARU: Routing AI Agent Spasial Forensik [3]

const app = express();

// Middlewares
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'], // React default and secondary port
  credentials: true,
}));

app.use(morgan('dev'));

// FASE 1 ARSITEKTUR (THE PAYLOAD FIX): 
// Memperlebar pipa penerimaan data hingga 50MB.
// Wajib untuk mengakomodasi payload Base64 (Tanda Tangan Digital & Multi-Photo Bukti BAP)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files statically — accessible at /uploads/companies/filename.pdf
app.use('/uploads', express.static('uploads'));

// Main Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/waste', wasteRoutes);
app.use('/api/pickups', pickupRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/agent', agentRoutes); // MOUNT BARU: Mendaftarkan API AI Agent Spasial [3]
app.use('/api', systemRoutes); // Notifications and audit-logs are mounted directly under /api

// Error handler middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Express Error Handler:', err);
  return res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

export default app;