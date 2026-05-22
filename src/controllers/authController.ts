import { Request, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'sijaga_secret_key_extremely_secure_12345';

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  role: z.nativeEnum(UserRole).optional(),
});

export async function register(req: Request, res: Response) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { name, email, password } = parsed.data;

    // Check if user already exists
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
        role: UserRole.PERUSAHAAN,
      },
    });

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Write audit log
    await prisma.auditLog.create({
      data: {
        user: newUser.email,
        role: newUser.role,
        action: 'Mendaftar PIC Perusahaan Baru',
      },
    });

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        companies: [],
        companyId: null,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { email, password, role } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        companies: true,
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Match role (only if explicitly provided)
    if (role && user.role !== role) {
      return res.status(403).json({ success: false, error: 'Role mismatch' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Fallback company ID compatibility
    const fallbackCompanyId = user.companies.length > 0 ? user.companies[0].id : null;

    // Log to audit log
    await prisma.auditLog.create({
      data: {
        user: user.email,
        role: user.role,
        action: 'Melakukan login sistem',
      },
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        transporterId: user.transporterId,
        officerId: user.officerId,
        companies: user.companies,
        companyId: user.companyId || fallbackCompanyId,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          user: req.user.email,
          role: req.user.role,
          action: 'Melakukan logout sistem',
        },
      });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
