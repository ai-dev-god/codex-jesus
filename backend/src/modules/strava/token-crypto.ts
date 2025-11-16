import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

import env from '../../config/env';
import type { TokenCrypto } from '../wearable/token-crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'biohax-strava-token';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

const tokenKey = scryptSync(env.STRAVA_TOKEN_ENCRYPTION_KEY, SALT, KEY_LENGTH);

const encrypt = (token: string): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, tokenKey, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${authTag.toString('base64url')}`;
};

const decrypt = (payload: string): string | null => {
  const segments = payload.split('.');
  if (segments.length !== 3) {
    return null;
  }

  const [ivEncoded, dataEncoded, authTagEncoded] = segments;

  try {
    const iv = Buffer.from(ivEncoded, 'base64url');
    const encryptedData = Buffer.from(dataEncoded, 'base64url');
    const authTag = Buffer.from(authTagEncoded, 'base64url');

    const decipher = createDecipheriv(ALGORITHM, tokenKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
};

export const stravaTokenCrypto: TokenCrypto = {
  encrypt,
  decrypt
};

