import type { PrismaClient } from '@prisma/client';

import { LabUploadSessionService } from '../modules/lab-upload/upload-session.service';

jest.mock('../lib/storage', () => {
  const getSignedUrl = jest.fn().mockResolvedValue(['https://signed-upload-url']);
  const file = jest.fn(() => ({ getSignedUrl }));
  return {
    labUploadBucket: {
      file
    },
    __esModule: true,
    _fileMock: file,
    _signedUrlMock: getSignedUrl
  };
});

jest.mock('../config/env', () => ({
  __esModule: true,
  default: {
    LAB_UPLOAD_BUCKET: 'labs-dev',
    LAB_UPLOAD_KMS_KEY_NAME: 'projects/dev/locations/global/keyRings/ring/cryptoKeys/key',
    LAB_UPLOAD_SIGNED_URL_TTL_SECONDS: 900,
    LAB_UPLOAD_MAX_SIZE_MB: 25,
    LAB_UPLOAD_SEALING_KEY: Buffer.alloc(32).toString('base64'),
    NODE_ENV: 'test'
  }
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { labUploadBucket, _signedUrlMock } = require('../lib/storage');

describe('LabUploadSessionService', () => {
  const prisma = {
    panelUploadSession: {
      create: jest.fn()
    }
  } as unknown as PrismaClient;

  const service = new LabUploadSessionService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes CMEK headers when creating signed upload URLs', async () => {
    (prisma.panelUploadSession.create as jest.Mock).mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      storageKey: 'labs/user-1/file.pdf',
      contentType: 'application/pdf',
      byteSize: 1024,
      sha256Hash: 'a'.repeat(64),
      kmsKeyName: 'projects/dev/locations/global/keyRings/ring/cryptoKeys/key',
      expiresAt: new Date()
    });

    const session = await service.createSession({
      userId: 'user-1',
      fileName: 'file.pdf',
      contentType: 'application/pdf',
      byteSize: 2048,
      sha256: 'a'.repeat(64)
    });

    expect(session.requiredHeaders['x-goog-encryption-kms-key-name']).toBeDefined();
    expect(_signedUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionHeaders: expect.objectContaining({
          'x-goog-encryption-kms-key-name': 'projects/dev/locations/global/keyRings/ring/cryptoKeys/key'
        })
      })
    );
  });
});

