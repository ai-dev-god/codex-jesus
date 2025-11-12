import { perfConfig, type PerfScenario } from './perf.config';

type ScenarioResult = {
  scenario: string;
  run: string;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
  targetP95Ms: number;
  passes: boolean;
};

const percentile = (values: number[], percentileRank: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
};

const round = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const flattenSamples = (samples: number[]): string =>
  samples.map((sample) => `${round(sample, 2)}ms`).join(', ');

const evaluateScenario = (scenario: PerfScenario): ScenarioResult[] => {
  const results: ScenarioResult[] = [];

  for (const run of scenario.runs) {
    const average =
      run.samplesMs.reduce((sum, sample) => sum + sample, 0) / run.samplesMs.length;
    const p95 = percentile(run.samplesMs, 95);
    const max = Math.max(...run.samplesMs);
    const passes = p95 <= scenario.targetP95Ms;

    console.log(`\nScenario: ${scenario.name}`);
    console.log(`Endpoint: ${scenario.endpoint}`);
    console.log(`Run: ${run.label}`);
    console.log(`Samples: ${flattenSamples(run.samplesMs)}`);
    console.log(
      `Metrics => avg: ${round(average)}ms, p95: ${round(p95)}ms, max: ${round(max)}ms (target p95 <= ${scenario.targetP95Ms}ms)`
    );
    if (run.notes) {
      console.log(`Notes: ${run.notes}`);
    }
    console.log(`Outcome: ${passes ? 'PASS' : 'FAIL'}`);

    results.push({
      scenario: scenario.name,
      run: run.label,
      averageMs: round(average),
      p95Ms: round(p95),
      maxMs: round(max),
      targetP95Ms: scenario.targetP95Ms,
      passes
    });
  }

  return results;
};

const main = async (): Promise<void> => {
  console.log('BioHax API Performance Evaluation');
  console.log(`Base URL: ${perfConfig.serviceBaseUrl}`);
  console.log(`Seeded user: ${perfConfig.seededUserEmail}`);

  const results: ScenarioResult[] = [];
  for (const scenario of perfConfig.scenarios) {
    results.push(...evaluateScenario(scenario));
  }

  const failed = results.some((result) => !result.passes);
  console.log('\nSummary');
  for (const result of results) {
    console.log(
      `[${result.passes ? 'PASS' : 'FAIL'}] ${result.scenario} (${result.run}) -> p95 ${result.p95Ms}ms (target ${result.targetP95Ms}ms)`
    );
  }

  if (failed) {
    console.error('\nPerformance targets not met.');
    process.exit(1);
  }

  console.log('\nAll performance targets satisfied.');
};

void main();
