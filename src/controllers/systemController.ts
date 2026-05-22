import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getNotifications(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const notifications = await prisma.systemNotification.findMany({
      orderBy: { timestamp: 'desc' }
    });

    return res.status(200).json({ success: true, notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function markNotificationsAsRead(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    await prisma.systemNotification.updateMany({
      where: { read: false },
      data: { read: true }
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getAuditLogs(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' }
    });

    return res.status(200).json({ success: true, logs });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
