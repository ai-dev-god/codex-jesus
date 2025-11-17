import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';

import env from '../../config/env';
import prismaClient from '../../lib/prisma';
import { labUploadBucket } from '../../lib/storage';
import { HttpError } from '../observability-ops/http-error';
import { baseLogger } from '../../observability/logger';

const logger = baseLogger.with({ component: 'lab-upload-storage' });

const MAX_METADATA_LENGTH = 256;

const sanitizeFileName = (fileName: string): string => {
  const normalized = fileName.toLowerCase();
  const lastDot = normalized.lastIndexOf('.');
  const base = (lastDot > 0 ? normalized.slice(0, lastDot) : normalized).replace(/[^a-z0-9]+/g, '-');
  const extension = lastDot > 0 ? normalized.slice(lastDot + 1).replace(/[^a-z0-9]+/g, '') : '';
  const baseSlug = base.replace(/^-+|-+$/g, '') || 'lab-upload';
  return extension ? `${baseSlug}.${extension}` : baseSlug;
};

export type CreateUploadSessionInput = {
  userId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
};

export type UploadSessionPayload = {
  sessionId: string;
  storageKey: string;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
  kmsKeyName: string | null;
  maxBytes: number;
};

export class LabUploadSessionService {
  private readonly prisma: PrismaClient;
  private readonly bucket = labUploadBucket;
  private readonly maxBytes = env.LAB_UPLOAD_MAX_SIZE_MB * 1024 * 1024;
  private readonly ttlMs = env.LAB_UPLOAD_SIGNED_URL_TTL_SECONDS * 1000;

  constructor(prisma: PrismaClient = prismaClient) {
    this.prisma = prisma;
  }

  async createSession(input: CreateUploadSessionInput): Promise<UploadSessionPayload> {
    this.assertInput(input);

    const sanitizedName = sanitizeFileName(input.fileName).slice(0, MAX_METADATA_LENGTH);
    const storageKey = `labs/${input.userId}/${Date.now()}-${randomUUID()}-${sanitizedName}`;
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const kmsKeyName = env.LAB_UPLOAD_KMS_KEY_NAME ?? null;

    const extensionHeaders: Record<string, string> = {
      'x-goog-content-sha256': input.sha256
    };

    if (kmsKeyName) {
      extensionHeaders['x-goog-encryption-kms-key-name'] = kmsKeyName;
    } else {
      extensionHeaders['x-goog-server-side-encryption'] = 'AES256';
    }

    const file = this.bucket.file(storageKey);

    try {
      const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expiresAt,
        contentType: input.contentType,
        extensionHeaders
      });

      const session = await this.prisma.panelUploadSession.create({
        data: {
          userId: input.userId,
          storageKey,
          contentType: input.contentType,
          byteSize: input.byteSize,
          sha256Hash: input.sha256,
          kmsKeyName,
          expiresAt
        }
      });

      return {
        sessionId: session.id,
        storageKey,
        uploadUrl,
        expiresAt: expiresAt.toISOString(),
        requiredHeaders: {
          'Content-Type': input.contentType,
          ...extensionHeaders
        },
        kmsKeyName,
        maxBytes: this.maxBytes
      };
    } catch (error) {
      logger.error('Failed to create signed upload URL', {
        error: error instanceof Error ? error.message : error
      });
      throw new HttpError(502, 'Unable to create upload session', 'LAB_UPLOAD_SESSION_FAILED');
    }
  }

  async markExpiredSessions(now = new Date()): Promise<number> {
    const { count } = await this.prisma.panelUploadSession.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now }
      },
      data: { status: 'EXPIRED' }
    });
    return count;
  }

  private assertInput(input: CreateUploadSessionInput): void {
    if (!input.userId) {
      throw new HttpError(400, 'User is required', 'LAB_UPLOAD_NO_USER');
    }
    if (!input.fileName?.trim()) {
      throw new HttpError(400, 'File name is required', 'LAB_UPLOAD_NO_FILENAME');
    }
    if (!input.contentType?.trim()) {
      throw new HttpError(400, 'Content type is required', 'LAB_UPLOAD_NO_CONTENT_TYPE');
    }
    if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
      throw new HttpError(400, 'Invalid file size', 'LAB_UPLOAD_INVALID_SIZE');
    }
    if (input.byteSize > this.maxBytes) {
      throw new HttpError(413, `File exceeds ${env.LAB_UPLOAD_MAX_SIZE_MB}MB limit`, 'LAB_UPLOAD_TOO_LARGE');
    }
    if (!/^[a-f0-9]{64}$/i.test(input.sha256)) {
      throw new HttpError(400, 'Invalid SHA-256 hash', 'LAB_UPLOAD_INVALID_HASH');
    }
  }
}

export const labUploadSessionService = new LabUploadSessionService();

