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

const updateRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
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

export async function getTransporters(req: Request, res: Response) {
  try {
    // FIX: Menggunakan logika operator !== untuk menghindari strict-type error TypeScript pada array.includes
    if (!req.user || (req.user.role !== UserRole.ADMIN_DLH && req.user.role !== UserRole.SUPER_ADMIN)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges' });
    }

    const transporters = await prisma.user.findMany({
      where: { role: UserRole.PENGANGKUT },
      select: {
        id: true,
        name: true,
        email: true,
        transporterId: true,
      }
    });

    return res.status(200).json({ success: true, transporters });
  } catch (error) {
    console.error('Get transporters error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// FUNGSI BARU: Mengambil semua data pengguna untuk dashboard Super Admin
export async function getAllUsers(req: Request, res: Response) {
  try {
    // Keamanan Privasi: Batasi field yang di-select agar password tidak bocor ke FE
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        transporterId: true,
        officerId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, users });
  } catch (error) {
    console.error('Get all users error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// FUNGSI BARU: Memperbarui Role Pengguna
export async function updateUserRole(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const parsed = updateRoleSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors });
    }

    const { role } = parsed.data;

    // Cek apakah pengguna yang dituju ada di database
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Lakukan update (tanpa menyentuh relasi companyId/officerId untuk mencegah data loss)
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      }
    });

    // Otomatis catat jejak modifikasi ke dalam Audit Log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          user: req.user.email,
          role: req.user.role,
          action: `Mengubah hak akses (role) ${targetUser.email} menjadi ${role}`,
        },
      });
    }

    return res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Update user role error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}