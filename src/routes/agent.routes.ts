// src/routes/agent.routes.ts
import { Router } from 'express';
import { AgentController } from '../controllers/AgentController';
// import { requireAuth, requireRole } from '../middlewares/authMiddleware'; // Sesuaikan dengan middleware Anda

const router = Router();

// Rute ini HANYA Boleh Diakses oleh Pimpinan/Auditor (Opsional: Tambahkan Middleware Proteksi Role)
router.post(
    '/forensic',
    // requireAuth, 
    // requireRole(['AUDITOR', 'SUPER_ADMIN']), 
    AgentController.runForensicScan
);

export default router;