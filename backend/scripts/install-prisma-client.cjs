#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../prisma/generated/client');
const dest = path.resolve(__dirname, '../node_modules/.prisma/client');

if (!fs.existsSync(src)) {
  console.warn('[prisma-install] Skipping client sync; missing prisma/generated/client');
  process.exit(0);
}

const rmRecursive = (target) => {
  if (!fs.existsSync(target)) {
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
};

const copyRecursive = (from, to) => {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
  } else {
    fs.copyFileSync(from, to);
  }
};

fs.mkdirSync(path.dirname(dest), { recursive: true });
rmRecursive(dest);
copyRecursive(src, dest);
console.log('[prisma-install] Synced pre-generated Prisma client assets.');
