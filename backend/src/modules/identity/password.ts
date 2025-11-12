import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  if (!hash) {
    return false;
  }

  return bcrypt.compare(password, hash);
};
