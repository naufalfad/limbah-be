import { PrismaClient, InvoiceType, InvoiceStatus } from '@prisma/client';

export async function seedInvoices(prisma: PrismaClient) {
  console.log('Seeding invoices...');
  await prisma.invoice.createMany({
    data: [
      { id: 'INV-2026-001', companyId: 'COM-001', type: InvoiceType.Pengangkutan, amount: 450000.0, date: '2026-06-08', status: InvoiceStatus.SETTLED },
      { id: 'INV-2026-002', companyId: 'COM-003', type: InvoiceType.Pengangkutan, amount: 150000.0, date: '2026-06-15', status: InvoiceStatus.UNPAID },
      { id: 'INV-2026-003', companyId: 'COM-009', type: InvoiceType.Retribusi_SPPL, amount: 250000.0, date: '2026-06-10', status: InvoiceStatus.UNPAID }
    ]
  });
}
