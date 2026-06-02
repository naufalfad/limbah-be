/*
  Warnings:

  - You are about to drop the column `inspectionId` on the `CitizenReport` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "CitizenReport" DROP CONSTRAINT "CitizenReport_inspectionId_fkey";

-- DropIndex
DROP INDEX "CitizenReport_inspectionId_key";

-- AlterTable
ALTER TABLE "CitizenReport" DROP COLUMN "inspectionId";
