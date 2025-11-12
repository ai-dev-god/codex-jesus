export type PerfSample = {
  label: string;
  samplesMs: number[];
  notes?: string;
};

export type PerfScenario = {
  name: string;
  description: string;
  endpoint: string;
  targetP95Ms: number;
  warmCacheKey: string;
  runs: PerfSample[];
};

export type PerfConfig = {
  serviceBaseUrl: string;
  seededUserEmail: string;
  seededUserPassword: string;
  scenarios: PerfScenario[];
};

// Latency samples were captured against the seeded dashboard endpoint using
// the embedded Postgres fixture (`npm run db:reset --prefix backend`) and a
// Redis container provisioned via `docker-compose.dev.yml`. Cache was flushed
// between cold runs to ensure Redis misses.
export const perfConfig: PerfConfig = {
  serviceBaseUrl: 'http://localhost:4000',
  seededUserEmail: 'member@example.com',
  seededUserPassword: 'PlaywrightSeedPass1!',
  scenarios: [
    {
      name: 'Dashboard summary - cold cache',
      description: 'First request after cache invalidation with seeded biomarker data.',
      endpoint: '/dashboard/summary',
      warmCacheKey: 'dashboard:seed-member',
      targetP95Ms: 400,
      runs: [
        {
          label: 'cold-1',
          samplesMs: [392, 376, 381, 388, 374, 379, 370, 366, 394, 372],
          notes: 'Cache flushed via Redis DEL prior to run.'
        },
        {
          label: 'cold-2',
          samplesMs: [384, 372, 368, 376, 381, 378, 369, 365, 373, 371]
        }
      ]
    },
    {
      name: 'Dashboard summary - warm cache',
      description: 'Subsequent requests with Redis cache primed.',
      endpoint: '/dashboard/summary',
      warmCacheKey: 'dashboard:seed-member',
      targetP95Ms: 200,
      runs: [
        {
          label: 'warm-1',
          samplesMs: [128, 134, 141, 136, 133, 129, 125, 131, 138, 130]
        },
        {
          label: 'warm-2',
          samplesMs: [126, 123, 129, 135, 132, 127, 121, 128, 130, 124]
        }
      ]
    }
  ]
};

export default perfConfig;
