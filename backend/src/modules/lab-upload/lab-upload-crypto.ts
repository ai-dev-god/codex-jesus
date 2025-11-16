import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import env from '../../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

const DEFAULT_DEV_KEY = Buffer.from('dev-lab-seal-key-32byte-secret!!');

const decodeSealingKey = (): Buffer => {
  const raw = env.LAB_UPLOAD_SEALING_KEY ?? '';
  if (!raw) {
    if (env.NODE_ENV === 'production') {
      throw new Error('LAB_UPLOAD_SEALING_KEY is not configured');
    }
    return DEFAULT_DEV_KEY;
  }

  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length !== KEY_LENGTH) {
    if (env.NODE_ENV === 'production') {
      throw new Error('LAB_UPLOAD_SEALING_KEY must be a base64-encoded 256-bit value');
    }
    return DEFAULT_DEV_KEY;
  }
  return buffer;
};

let cachedKey: Buffer | null = null;

const getSealingKey = (): Buffer => {
  if (!cachedKey) {
    cachedKey = decodeSealingKey();
  }
  return cachedKey;
};

export type SealedPayload = {
  ciphertext: Buffer;
  iv: string;
  authTag: string;
  algorithm: string;
};

export const sealLabPayload = (payload: Buffer): SealedPayload => {
  const key = getSealingKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    algorithm: ALGORITHM
  };
};

export const unsealLabPayload = (sealed: SealedPayload): Buffer => {
  const key = getSealingKey();
  const iv = Buffer.from(sealed.iv, 'base64');
  const tag = Buffer.from(sealed.authTag, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
};

