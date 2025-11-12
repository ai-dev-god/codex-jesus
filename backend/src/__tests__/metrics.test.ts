import { getMetricsSnapshot, recordHttpMetric, resetMetrics, __testing } from '../observability/metrics';

describe('metrics registry', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('limits stored duration samples per bucket', () => {
    const maxSamples = __testing.MAX_DURATION_SAMPLES;

    for (let i = 0; i < maxSamples + 50; i += 1) {
      recordHttpMetric({
        method: 'GET',
        route: '/limited',
        statusCode: 200,
        durationMs: i + 1
      });
    }

    expect(__testing.getSampleSize('GET', '/limited')).toBe(maxSamples);

    const snapshot = getMetricsSnapshot();
    const bucket = snapshot.http.find((entry) => entry.route === '/limited');
    expect(bucket).toBeDefined();
    expect(bucket?.count).toBe(maxSamples + 50);
    expect(bucket?.statusCounts['200']).toBe(maxSamples + 50);
    expect(bucket?.p95DurationMs).toBeGreaterThan(0);
  });
});
