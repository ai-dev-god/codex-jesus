ALTER TABLE "PanelUpload" ADD COLUMN "planId" TEXT;

CREATE TABLE "PanelUploadBiomarkerTag" (
    "id" TEXT NOT NULL,
    "panelUploadId" TEXT NOT NULL,
    "biomarkerId" TEXT NOT NULL,
    "taggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PanelUploadBiomarkerTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PanelUploadBiomarkerTag_panelUploadId_biomarkerId_key"
    ON "PanelUploadBiomarkerTag"("panelUploadId", "biomarkerId");

CREATE INDEX "PanelUploadBiomarkerTag_biomarkerId_idx"
    ON "PanelUploadBiomarkerTag"("biomarkerId");

ALTER TABLE "PanelUpload" ADD CONSTRAINT "PanelUpload_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "LongevityPlan"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PanelUploadBiomarkerTag" ADD CONSTRAINT "PanelUploadBiomarkerTag_panelUploadId_fkey"
    FOREIGN KEY ("panelUploadId") REFERENCES "PanelUpload"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PanelUploadBiomarkerTag" ADD CONSTRAINT "PanelUploadBiomarkerTag_biomarkerId_fkey"
    FOREIGN KEY ("biomarkerId") REFERENCES "Biomarker"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PanelUpload_planId_idx" ON "PanelUpload"("planId");
