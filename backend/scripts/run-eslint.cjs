#!/usr/bin/env node

process.env.ESLINT_USE_FLAT_CONFIG = 'false';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const eslintBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'eslint.cmd' : 'eslint'
);
const forwardArgs = process.argv.slice(2);
const defaultTargets = forwardArgs.length > 0 ? forwardArgs : ['src'];

const result = spawnSync(
  eslintBin,
  ['--config', '.eslintrc.cjs', '--ext', '.ts,.tsx', ...defaultTargets],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
