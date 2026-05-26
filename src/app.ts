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
import analyticsRoutes from './routes/analyticsRoutes'; // IMPOR BARU: Mengimpor router analitik eksekutif

const app = express();

// Middlewares
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'], // React default and secondary port
  credentials: true,
}));

app.use(morgan('dev'));
app.use(express.json());

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
app.use('/api/analytics', analyticsRoutes); // MOUNT BARU: Mendaftarkan API analitik eksekutif di bawah /api/analytics
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