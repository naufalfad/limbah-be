import { Request, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { z } from 'zod';

const prisma = new PrismaClient();

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(UserRole),
  transporterId: z.string().optional(),
  officerId: z.string().optional(),
  companyId: z.string().optional(),
});

export async function createUser(req: Request, res: Response) {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { name, email, password, role, transporterId, officerId, companyId } = parsed.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        transporterId,
        officerId,
        companyId,
      },
    });

    // Write audit log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          user: req.user.email,
          role: req.user.role,
          action: `Membuat akun user baru: ${email} (${role})`,
        },
      });
    }

    return res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        transporterId: newUser.transporterId,
        officerId: newUser.officerId,
        companyId: newUser.companyId,
      },
    });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
