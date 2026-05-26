-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'VERIFIED', 'INVESTIGATING', 'RESOLVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PickupRequest" ADD COLUMN     "actualVolume" TEXT,
ADD COLUMN     "transportReport" TEXT,
ALTER COLUMN "transporterId" DROP NOT NULL,
ALTER COLUMN "transporterName" DROP NOT NULL;

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

-- CreateIndex
CREATE UNIQUE INDEX "CitizenReport_trackingId_key" ON "CitizenReport"("trackingId");

-- CreateIndex
CREATE UNIQUE INDEX "CitizenReport_inspectionId_key" ON "CitizenReport"("inspectionId");

-- AddForeignKey
ALTER TABLE "CitizenReport" ADD CONSTRAINT "CitizenReport_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
