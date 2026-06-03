-- AlterEnum
ALTER TYPE "DocType" ADD VALUE 'AMDAL';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "docTemplateUrl" TEXT,
ADD COLUMN     "parsedTemplateData" JSONB;
