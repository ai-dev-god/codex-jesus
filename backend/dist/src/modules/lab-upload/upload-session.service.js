"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.labUploadSessionService = exports.LabUploadSessionService = void 0;
const crypto_1 = require("crypto");
const env_1 = __importDefault(require("../../config/env"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const storage_1 = require("../../lib/storage");
const http_error_1 = require("../observability-ops/http-error");
const logger_1 = require("../../observability/logger");
const logger = logger_1.baseLogger.with({ component: 'lab-upload-storage' });
const MAX_METADATA_LENGTH = 256;
const sanitizeFileName = (fileName) => {
    const normalized = fileName.toLowerCase();
    const lastDot = normalized.lastIndexOf('.');
    const base = (lastDot > 0 ? normalized.slice(0, lastDot) : normalized).replace(/[^a-z0-9]+/g, '-');
    const extension = lastDot > 0 ? normalized.slice(lastDot + 1).replace(/[^a-z0-9]+/g, '') : '';
    const baseSlug = base.replace(/^-+|-+$/g, '') || 'lab-upload';
    return extension ? `${baseSlug}.${extension}` : baseSlug;
};
class LabUploadSessionService {
    constructor(prisma = prisma_1.default) {
        this.bucket = storage_1.labUploadBucket;
        this.maxBytes = env_1.default.LAB_UPLOAD_MAX_SIZE_MB * 1024 * 1024;
        this.ttlMs = env_1.default.LAB_UPLOAD_SIGNED_URL_TTL_SECONDS * 1000;
        this.prisma = prisma;
    }
    async createSession(input) {
        this.assertInput(input);
        const sanitizedName = sanitizeFileName(input.fileName).slice(0, MAX_METADATA_LENGTH);
        const storageKey = `labs/${input.userId}/${Date.now()}-${(0, crypto_1.randomUUID)()}-${sanitizedName}`;
        const expiresAt = new Date(Date.now() + this.ttlMs);
        const kmsKeyName = env_1.default.LAB_UPLOAD_KMS_KEY_NAME ?? null;
        const extensionHeaders = {
            'x-goog-content-sha256': input.sha256
        };
        if (kmsKeyName) {
            extensionHeaders['x-goog-encryption-kms-key-name'] = kmsKeyName;
        }
        else {
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
        }
        catch (error) {
            logger.error('Failed to create signed upload URL', {
                error: error instanceof Error ? error.message : error
            });
            throw new http_error_1.HttpError(502, 'Unable to create upload session', 'LAB_UPLOAD_SESSION_FAILED');
        }
    }
    async markExpiredSessions(now = new Date()) {
        const { count } = await this.prisma.panelUploadSession.updateMany({
            where: {
                status: 'PENDING',
                expiresAt: { lt: now }
            },
            data: { status: 'EXPIRED' }
        });
        return count;
    }
    assertInput(input) {
        if (!input.userId) {
            throw new http_error_1.HttpError(400, 'User is required', 'LAB_UPLOAD_NO_USER');
        }
        if (!input.fileName?.trim()) {
            throw new http_error_1.HttpError(400, 'File name is required', 'LAB_UPLOAD_NO_FILENAME');
        }
        if (!input.contentType?.trim()) {
            throw new http_error_1.HttpError(400, 'Content type is required', 'LAB_UPLOAD_NO_CONTENT_TYPE');
        }
        if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
            throw new http_error_1.HttpError(400, 'Invalid file size', 'LAB_UPLOAD_INVALID_SIZE');
        }
        if (input.byteSize > this.maxBytes) {
            throw new http_error_1.HttpError(413, `File exceeds ${env_1.default.LAB_UPLOAD_MAX_SIZE_MB}MB limit`, 'LAB_UPLOAD_TOO_LARGE');
        }
        if (!/^[a-f0-9]{64}$/i.test(input.sha256)) {
            throw new http_error_1.HttpError(400, 'Invalid SHA-256 hash', 'LAB_UPLOAD_INVALID_HASH');
        }
    }
}
exports.LabUploadSessionService = LabUploadSessionService;
exports.labUploadSessionService = new LabUploadSessionService();
