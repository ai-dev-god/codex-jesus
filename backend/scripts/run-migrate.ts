import { spawnSync } from 'node:child_process';

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    env: process.env
  });

  const stdout = result.stdout ? result.stdout.toString() : '';
  const stderr = result.stderr ? result.stderr.toString() : '';

  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }

  return {
    status: result.status,
    stdout,
    stderr
  };
}

const isFallbackEnabled = (): boolean => {
  const raw = process.env.ALLOW_DB_MIGRATE_FALLBACK;
  if (!raw) {
    return true;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off';
};

function runMigrateDeploy(): CommandResult {
  console.info('[db:migrate] Running prisma migrate deploy');
  return runCommand('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
}

function runDiffFallback(): CommandResult {
  console.info('[db:migrate] Database unreachable, generating SQL diff fallback');
  const result = runCommand('npx', [
    'prisma',
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--script'
  ]);
  if (result.status === 0) {
    console.info(
      '[db:migrate] Fallback completed — migration SQL generated without applying to a live database'
    );
  }
  return result;
}

function main() {
  const fallbackEnabled = isFallbackEnabled();
  const deployResult = runMigrateDeploy();

  if (deployResult.status === 0) {
    return;
  }

  const combinedOutput = `${deployResult.stdout}\n${deployResult.stderr}`.toLowerCase();
  const isConnectionIssue =
    combinedOutput.includes('p1001') ||
    combinedOutput.includes("can't reach database server") ||
    combinedOutput.includes('connect ECONNREFUSED'.toLowerCase());

  if (isConnectionIssue && fallbackEnabled) {
    const fallbackResult = runDiffFallback();
    if (fallbackResult.status === 0) {
      return;
    }
    process.exit(fallbackResult.status ?? 1);
  } else {
    process.exit(deployResult.status ?? 1);
  }
}

main();
