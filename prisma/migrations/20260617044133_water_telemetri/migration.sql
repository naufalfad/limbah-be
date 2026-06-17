-- CreateTable
CREATE TABLE "WaterStationBaseline" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "bod" DOUBLE PRECISION NOT NULL,
    "cod" DOUBLE PRECISION NOT NULL,
    "do" DOUBLE PRECISION NOT NULL,
    "ph" DOUBLE PRECISION NOT NULL,
    "avgTemperature" DOUBLE PRECISION NOT NULL,
    "avgRainfallMm" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterStationBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaterStationBaseline_stationId_month_key" ON "WaterStationBaseline"("stationId", "month");

-- AddForeignKey
ALTER TABLE "WaterStationBaseline" ADD CONSTRAINT "WaterStationBaseline_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "WaterStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
