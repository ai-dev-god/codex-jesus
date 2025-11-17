#!/usr/bin/env node

require('ts-node/register');

const { createHash } = require('crypto');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || '/Users/aurel/codex-jesus/.secrets/biohax-777.json';
process.env.GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'biohax-777';
process.env.LAB_UPLOAD_BUCKET = process.env.LAB_UPLOAD_BUCKET || 'galeata-hax';
process.env.LAB_UPLOAD_INLINE_INGEST = process.env.LAB_UPLOAD_INLINE_INGEST || 'true';

const { labUploadBucket } = require('../src/lib/storage');
const { runLabUploadIngestion } = require('../src/modules/lab-upload/ingestion-processor');
const { LabIngestionSupervisor } = require('../src/modules/lab-upload/ingestion-supervisor');

const run = async () => {
  const uploadId = `upload-${Date.now()}`;
  const userId = `user-${Date.now()}`;
  const storageKey = `labs/manual-smoke/${uploadId}.txt`;
  const sampleContent = Buffer.from(
    [
      'Glucose 92 mg/dL',
      'ApoB 110 mg/dL',
      'Triglycerides 145 mg/dL',
      'Vitamin D 45 ng/mL',
      'hsCRP 1.1 mg/L'
    ].join('\n'),
    'utf8'
  );
  const sha256 = createHash('sha256').update(sampleContent).digest('hex');

  await labUploadBucket.file(storageKey).save(sampleContent, {
    contentType: 'text/plain',
    resumable: false
  });

  const prismaMock = {
    panelUpload: {
      findFirst: async (query) => {
        if (query?.where?.id !== uploadId) {
          return null;
        }
        return {
          id: uploadId,
          userId,
          storageKey,
          sha256Hash: sha256,
          contentType: 'text/plain',
          rawMetadata: { fileName: 'lab-smoke.txt' },
          sealedStorageKey: null,
          sealedKeyVersion: null
        };
      }
    },
    biomarker: {
      findMany: async () => [
        { id: 'bm-glucose', name: 'Glucose', unit: 'mg/dL', slug: 'glucose' },
        { id: 'bm-apob', name: 'ApoB', unit: 'mg/dL', slug: 'apob' },
        { id: 'bm-triglycerides', name: 'Triglycerides', unit: 'mg/dL', slug: 'triglycerides' },
        { id: 'bm-vitamin-d', name: 'Vitamin D', unit: 'ng/mL', slug: 'vitamind' },
        { id: 'bm-hscrp', name: 'hsCRP', unit: 'mg/L', slug: 'hscrp' }
      ]
    }
  };

  const supervisor = new LabIngestionSupervisor(prismaMock);

  const applyCalls = [];
  const result = await runLabUploadIngestion(uploadId, userId, {
    prisma: prismaMock,
    panelIngestion: {
      applyAutomatedIngestion: async (_userId, _uploadId, payload) => {
        applyCalls.push(payload);
        return payload;
      }
    },
    planLinkService: {
      autoLink: async () => {}
    },
    supervisor
  });

  console.log(
    JSON.stringify(
      {
        uploadId,
        measurementCount: result.measurementCount,
        sealedStorageKey: result.sealedStorageKey,
        normalizedPreview: applyCalls[0]?.normalizedPayload?.extractedMeasurements?.slice(0, 5)
      },
      null,
      2
    )
  );
};

run()
  .catch((error) => {
    console.error('Lab upload smoke test failed:', error);
    process.exitCode = 1;
  });


