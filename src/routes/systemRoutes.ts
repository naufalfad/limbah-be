import { Router } from 'express';
import { getNotifications, markNotificationsAsRead, getAuditLogs } from '../controllers/systemController';
import { requireAuth, requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.get('/notifications', requireAuth, getNotifications);
router.post('/notifications/read', requireAuth, markNotificationsAsRead);
router.get('/audit-logs', requireAuth, requireRoles(UserRole.SUPER_ADMIN), getAuditLogs);

export default router;
