"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const perf_config_1 = require("./perf.config");
const percentile = (values, percentileRank) => {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
};
const round = (value, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
};
const flattenSamples = (samples) => samples.map((sample) => `${round(sample, 2)}ms`).join(', ');
const evaluateScenario = (scenario) => {
    const results = [];
    for (const run of scenario.runs) {
        const average = run.samplesMs.reduce((sum, sample) => sum + sample, 0) / run.samplesMs.length;
        const p95 = percentile(run.samplesMs, 95);
        const max = Math.max(...run.samplesMs);
        const passes = p95 <= scenario.targetP95Ms;
        console.log(`\nScenario: ${scenario.name}`);
        console.log(`Endpoint: ${scenario.endpoint}`);
        console.log(`Run: ${run.label}`);
        console.log(`Samples: ${flattenSamples(run.samplesMs)}`);
        console.log(`Metrics => avg: ${round(average)}ms, p95: ${round(p95)}ms, max: ${round(max)}ms (target p95 <= ${scenario.targetP95Ms}ms)`);
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
const main = async () => {
    console.log('BioHax API Performance Evaluation');
    console.log(`Base URL: ${perf_config_1.perfConfig.serviceBaseUrl}`);
    console.log(`Seeded user: ${perf_config_1.perfConfig.seededUserEmail}`);
    const results = [];
    for (const scenario of perf_config_1.perfConfig.scenarios) {
        results.push(...evaluateScenario(scenario));
    }
    const failed = results.some((result) => !result.passes);
    console.log('\nSummary');
    for (const result of results) {
        console.log(`[${result.passes ? 'PASS' : 'FAIL'}] ${result.scenario} (${result.run}) -> p95 ${result.p95Ms}ms (target ${result.targetP95Ms}ms)`);
    }
    if (failed) {
        console.error('\nPerformance targets not met.');
        process.exit(1);
    }
    console.log('\nAll performance targets satisfied.');
};
void main();
