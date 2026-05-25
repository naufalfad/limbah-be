import { Request, Response } from 'express';
import { PrismaClient, NotificationType } from '@prisma/client';

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

export async function createNotification(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { title, message, type } = req.body;
    if (!title || !message || !type) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const notification = await prisma.systemNotification.create({
      data: {
        title,
        message,
        type: type as NotificationType,
      }
    });

    return res.status(201).json({ success: true, notification });
  } catch (error) {
    console.error('Create notification error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function createAuditLog(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { user, role, action } = req.body;
    if (!user || !role || !action) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const auditLog = await prisma.auditLog.create({
      data: {
        user,
        role,
        action
      }
    });

    return res.status(201).json({ success: true, auditLog });
  } catch (error) {
    console.error('Create audit log error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
