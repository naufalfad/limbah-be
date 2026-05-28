-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN_DLH', 'PETUGAS_LAPANGAN', 'PERUSAHAAN', 'PENGANGKUT', 'AUDITOR');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('SPPL', 'UKL-UPL');

-- CreateEnum
CREATE TYPE "WasteLogStatus" AS ENUM ('Terverifikasi', 'Proses Verifikasi', 'Terjadwal Pickup', 'Ditolak');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('PENDING', 'PRICED', 'PAID', 'ON_THE_ROAD', 'LOADED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('Pengangkutan', 'Retribusi SPPL', 'Retribusi UKL-UPL', 'Denda');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'ESCROW', 'SETTLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('Selesai', 'Terjadwal', 'Dibatalkan');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('WARNING', 'INFO', 'SUCCESS', 'DANGER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'VERIFIED', 'INVESTIGATING', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "companyId" TEXT,
    "transporterId" TEXT,
    "officerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "nib" TEXT NOT NULL,
    "npwp" TEXT NOT NULL,
    "picName" TEXT NOT NULL,
    "picPhone" TEXT NOT NULL,
    "picRole" TEXT NOT NULL,
    "investmentType" TEXT NOT NULL,
    "yearBuilt" TEXT NOT NULL,
    "buildingArea" DOUBLE PRECISION NOT NULL,
    "operationalHours" TEXT NOT NULL,
    "rawMaterials" TEXT NOT NULL,
    "waterSource" TEXT NOT NULL,
    "powerSource" TEXT NOT NULL,
    "kbli" TEXT NOT NULL,
    "investment" DOUBLE PRECISION NOT NULL,
    "landArea" DOUBLE PRECISION NOT NULL,
    "employees" INTEGER NOT NULL,
    "lat" TEXT NOT NULL,
    "lng" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION,
    "wasteInfo" TEXT,
    "hasTps" BOOLEAN NOT NULL DEFAULT false,
    "docNibUrl" TEXT,
    "docNpwpUrl" TEXT,
    "docSiteplanUrl" TEXT,
    "certificateActiveUntil" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "picId" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WasteLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" "WasteLogStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WasteLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "wasteType" TEXT NOT NULL,
    "volume" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "PickupStatus" NOT NULL DEFAULT 'PENDING',
    "transporterId" TEXT,
    "transporterName" TEXT,
    "cost" DOUBLE PRECISION,
    "plateNo" TEXT,
    "driverName" TEXT,
    "evidencePhoto" TEXT,
    "invoiceId" TEXT,
    "address" TEXT,
    "actualVolume" TEXT,
    "transportReport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "inspectorName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "status" "InspectionStatus" NOT NULL DEFAULT 'Terjadwal',
    "location" TEXT NOT NULL,
    "notes" TEXT,
    "photo" TEXT,
    "bapSigned" BOOLEAN NOT NULL DEFAULT false,
    "checklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitizenReport" (
    "id" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "reporterName" TEXT,
    "reporterContact" TEXT,
    "incidentType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lat" TEXT NOT NULL,
    "lng" TEXT NOT NULL,
    "evidencePhoto" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "inspectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CitizenReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemNotification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SystemNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_nib_key" ON "Company"("nib");

-- CreateIndex
CREATE UNIQUE INDEX "CitizenReport_trackingId_key" ON "CitizenReport"("trackingId");

-- CreateIndex
CREATE UNIQUE INDEX "CitizenReport_inspectionId_key" ON "CitizenReport"("inspectionId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_picId_fkey" FOREIGN KEY ("picId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteLog" ADD CONSTRAINT "WasteLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitizenReport" ADD CONSTRAINT "CitizenReport_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
