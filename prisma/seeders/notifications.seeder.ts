import { PrismaClient, NotificationType } from '@prisma/client';

export async function seedNotifications(prisma: PrismaClient) {
  console.log('Seeding system notifications...');
  await prisma.systemNotification.createMany({
    data: [
      { title: 'Inspeksi Baru Ditugaskan', message: 'Petugas Heryanto, S.T. telah ditugaskan untuk melakukan inspeksi di PT. Aspex Kumbong pada 25 Juni 2026.', type: NotificationType.INFO, read: false },
      { title: 'Laporan Pengaduan Terverifikasi', message: 'Laporan warga Dian Anggraeni tentang pencemaran air sungai Cileungsi telah verifikasi oleh Admin DLH.', type: NotificationType.SUCCESS, read: true },
      { title: 'Skor ESG Rendah Terdeteksi', message: 'PT. Argha Karya Prima Industry Tbk mendapatkan skor inspeksi 45.0 (di bawah batas aman 60). Diperlukan inspeksi ulang!', type: NotificationType.WARNING, read: false }
    ]
  });
}
