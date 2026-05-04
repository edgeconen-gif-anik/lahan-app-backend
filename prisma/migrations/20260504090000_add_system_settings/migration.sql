CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "currentFiscalYear" TEXT NOT NULL,
    "chiefAdministrativeOfficerName" TEXT,
    "sectionChiefName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);
