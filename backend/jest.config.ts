import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/integration/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  setupFiles: ['dotenv/config', '<rootDir>/tests/jest.setup-db.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup-after-env.ts'],
  testTimeout: 30000
};

export default config;
