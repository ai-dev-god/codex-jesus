"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.__testing = exports.resetMetrics = exports.getMetricsSnapshot = exports.recordHttpMetric = void 0;
const MAX_DURATION_SAMPLES = 200;
const httpMetrics = new Map();
const toKey = (method, route) => `${method.toUpperCase()}:${route}`;
const computePercentile = (values, percentile) => {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
};
const recordHttpMetric = ({ method, route, statusCode, durationMs }) => {
    const key = toKey(method, route);
    const bucket = httpMetrics.get(key) ?? {
        method: method.toUpperCase(),
        route,
        count: 0,
        errorCount: 0,
        durationSamples: [],
        sumDuration: 0,
        maxDuration: 0,
        lastStatusAt: null,
        statusCounts: {}
    };
    bucket.count += 1;
    if (statusCode >= 500) {
        bucket.errorCount += 1;
    }
    bucket.durationSamples.push(durationMs);
    if (bucket.durationSamples.length > MAX_DURATION_SAMPLES) {
        bucket.durationSamples.shift();
    }
    bucket.sumDuration += durationMs;
    bucket.maxDuration = Math.max(bucket.maxDuration, durationMs);
    bucket.lastStatusAt = new Date().toISOString();
    const statusBucket = bucket.statusCounts[String(statusCode)] ?? 0;
    bucket.statusCounts[String(statusCode)] = statusBucket + 1;
    httpMetrics.set(key, bucket);
};
exports.recordHttpMetric = recordHttpMetric;
const getMetricsSnapshot = () => {
    const generatedAt = new Date().toISOString();
    const http = [];
    for (const bucket of httpMetrics.values()) {
        const durations = bucket.durationSamples;
        const average = bucket.count > 0 ? bucket.sumDuration / bucket.count : 0;
        const p95 = computePercentile(durations, 95);
        http.push({
            method: bucket.method,
            route: bucket.route,
            count: bucket.count,
            errorCount: bucket.errorCount,
            averageDurationMs: Number(average.toFixed(2)),
            maxDurationMs: Number(bucket.maxDuration.toFixed(2)),
            p95DurationMs: Number(p95.toFixed(2)),
            lastStatusAt: bucket.lastStatusAt,
            statusCounts: { ...bucket.statusCounts }
        });
    }
    return {
        generatedAt,
        http
    };
};
exports.getMetricsSnapshot = getMetricsSnapshot;
const resetMetrics = () => {
    httpMetrics.clear();
};
exports.resetMetrics = resetMetrics;
exports.__testing = {
    MAX_DURATION_SAMPLES,
    getSampleSize(method, route) {
        const key = toKey(method, route);
        const bucket = httpMetrics.get(key);
        return bucket?.durationSamples.length ?? 0;
    }
};
