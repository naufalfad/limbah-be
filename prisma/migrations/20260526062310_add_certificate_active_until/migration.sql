-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "certificateActiveUntil" TEXT;

-- AlterTable
ALTER TABLE "PickupRequest" ADD COLUMN     "actualVolume" TEXT,
ADD COLUMN     "transportReport" TEXT,
ALTER COLUMN "transporterId" DROP NOT NULL,
ALTER COLUMN "transporterName" DROP NOT NULL;
