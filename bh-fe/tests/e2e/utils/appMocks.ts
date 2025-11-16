import type { Page, Route } from '@playwright/test'

const STORAGE_KEY = 'biohax-session'

const now = new Date()
const nowIso = now.toISOString()

const testUser = {
  id: 'user-mobile',
  email: 'mobile@biohax.pro',
  role: 'MEMBER',
  status: 'ACTIVE',
  createdAt: nowIso,
  updatedAt: nowIso,
}

const testProfile = {
  userId: testUser.id,
  displayName: 'Mobile Tester',
  timezone: 'America/Los_Angeles',
  baselineSurvey: null,
  consents: [],
  onboardingCompletedAt: nowIso,
  deleteRequested: false,
}

const dashboardSummary = {
  readinessScore: 82,
  strainScore: 3.4,
  sleepScore: 78,
  latestWhoopSyncAt: nowIso,
  todaysInsight: {
    id: 'insight-1',
    userId: testUser.id,
    title: 'Your readiness is trending up',
    summary: 'HRV is trending higher while resting heart rate remains optimal.',
    body: {
      insights: ['HRV up 6% week-over-week', 'Resting HR steady at 48 bpm'],
      recommendations: ['Continue Zone 2 sessions (3x/week)', 'Add magnesium glycinate before bed'],
      metadata: {
        confidenceScore: 0.82,
        agreementRatio: 0.74,
        disagreements: { insights: [], recommendations: [] },
        engines: [],
      },
    },
    status: 'READY',
    modelUsed: 'Gemini',
    generatedAt: nowIso,
    promptMetadata: null,
  },
  biomarkerTrends: [
    {
      biomarkerId: 'bm-hrv',
      biomarker: {
        id: 'bm-hrv',
        slug: 'hrv',
        name: 'HRV',
        unit: 'ms',
        referenceLow: 40,
        referenceHigh: 80,
        source: 'WEARABLE',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      direction: 'UP',
      delta: 5,
      windowDays: 7,
    },
  ],
  actionItems: [
    {
      id: 'action-log',
      title: 'Log morning HRV',
      description: 'Capture HRV after hydration to maintain data quality',
      ctaType: 'LOG_BIOMARKER',
    },
  ],
  tiles: [
    {
      id: 'readinessScore',
      heading: 'Readiness',
      value: 82,
      delta: 2.4,
      direction: 'UP',
      description: 'Daily readiness index',
      testId: 'tile-readiness',
    },
    {
      id: 'strainScore',
      heading: 'Strain',
      value: 45,
      delta: -1.2,
      direction: 'DOWN',
      description: 'Training strain',
      testId: 'tile-strain',
    },
    {
      id: 'sleepScore',
      heading: 'Sleep',
      value: 78,
      delta: 0.4,
      direction: 'UP',
      description: 'Sleep performance',
      testId: 'tile-sleep',
    },
  ],
  emptyStates: {
    needsBiomarkerLogs: false,
    needsInsight: false,
    needsWhoopLink: false,
  },
  generatedAt: nowIso,
  cacheState: 'HIT',
}

const longevityPlans = [
  {
    id: 'plan-1',
    userId: testUser.id,
    status: 'READY',
    title: 'Metabolic Optimization Sprint',
    summary: 'Focus on glucose control, sleep, and inflammation reduction.',
    focusAreas: ['glucose', 'sleep'],
    sections: [
      {
        id: 'sec-1',
        heading: 'Sleep',
        summary: 'Wind-down and recovery enhancements',
        interventions: [
          {
            id: 'int-1',
            type: 'Lifestyle',
            recommendation: '60-minute blue-light curfew',
            rationale: 'Supports melatonin production',
            evidence_strength: 'strong',
            evidence_type: 'guideline',
            guideline_alignment: 'in_guidelines',
          },
        ],
      },
      {
        id: 'sec-2',
        heading: 'Metabolic',
        summary: 'Stabilize glucose with time-restricted eating',
        interventions: [
          {
            id: 'int-2',
            type: 'Nutrition',
            recommendation: '14:10 fasting protocol',
            rationale: 'Improves insulin sensitivity',
            evidence_strength: 'moderate',
            evidence_type: 'observational',
            guideline_alignment: 'neutral',
            disclaimer: 'Consult practitioner if underweight',
          },
        ],
      },
    ],
    evidence: [],
    safetyState: {
      blocked: false,
      requiresHandoff: false,
      riskFlags: [],
      disclaimers: [],
      scorecard: [
        {
          name: 'Metabolic load',
          score: 24,
          risk: 'low',
          driver: 'Stable fasting glucose',
          recommendation: 'Maintain current fasting window',
        },
      ],
    },
    validatedBy: 'Gemini Safety',
    validatedAt: nowIso,
    requestedAt: nowIso,
    completedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
]

const panelUploads = [
  {
    id: 'upload-1',
    status: 'NORMALIZED',
    source: 'LAB_REPORT',
    storageKey: 'uploads/longevity-panel.pdf',
    contentType: 'application/pdf',
    pageCount: 6,
    rawMetadata: { fileName: 'Longevity Panel.pdf' },
    normalizedPayload: { summary: 'Parsed' },
    measurementCount: 18,
    processedAt: nowIso,
    errorCode: null,
    errorMessage: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    planId: longevityPlans[0].id,
    plan: {
      id: longevityPlans[0].id,
      title: longevityPlans[0].title,
      status: longevityPlans[0].status,
      createdAt: nowIso,
    },
    biomarkerTags: [
      {
        id: 'tag-1',
        taggedAt: nowIso,
        biomarker: { id: 'bm-hrv', name: 'HRV', unit: 'ms' },
      },
    ],
    measurements: [
      { id: 'm-1', markerName: 'HRV', biomarkerId: 'bm-hrv', value: 68, unit: 'ms', capturedAt: nowIso },
      { id: 'm-2', markerName: 'CRP', biomarkerId: 'bm-crp', value: 1.2, unit: 'mg/L', capturedAt: nowIso },
      { id: 'm-3', markerName: 'A1C', biomarkerId: 'bm-a1c', value: 5.1, unit: '%', capturedAt: nowIso },
    ],
  },
  {
    id: 'upload-2',
    status: 'PENDING',
    source: 'LAB_REPORT',
    storageKey: 'uploads/whoop-export.csv',
    contentType: 'text/csv',
    pageCount: null,
    rawMetadata: { fileName: 'whoop-export.csv' },
    normalizedPayload: null,
    measurementCount: 0,
    processedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    planId: null,
    plan: null,
    biomarkerTags: [],
    measurements: [],
  },
]

const biomarkerDefinitions = [
  {
    id: 'bm-hrv',
    slug: 'hrv',
    name: 'Heart Rate Variability',
    unit: 'ms',
    referenceLow: 40,
    referenceHigh: 80,
    source: 'WEARABLE',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'bm-crp',
    slug: 'crp',
    name: 'CRP',
    unit: 'mg/L',
    referenceLow: 0,
    referenceHigh: 3,
    source: 'LAB_UPLOAD',
    createdAt: nowIso,
    updatedAt: nowIso,
  },
]

const communityFeedResponse = {
  data: [
    {
      id: 'post-1',
      body: 'Dialed in Zone 2 and recovered HRV this week. Protocol adherence at 92% 🔥',
      tags: ['training', 'hrv'],
      visibility: 'GLOBAL',
      flagged: false,
      commentCount: 4,
      reactionSummary: { pulse: 18 },
      author: {
        id: 'coach-ava',
        displayName: 'Coach Ava',
        avatarUrl: null,
      },
      viewerActions: {
        reacted: false,
        reactionType: null,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ],
  meta: {
    nextCursor: null,
    hasMore: false,
  },
}

const refreshResponse = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresIn: 3600,
  refreshExpiresIn: 86400,
}

const respondJson = (route: Route, payload: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  })

const createTestSession = () => {
  const nowMs = Date.now()
  return {
    user: testUser,
    tokens: {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresIn: 3600,
      refreshExpiresIn: 86400,
      accessTokenExpiresAt: nowMs + 60 * 60 * 1000,
      refreshTokenExpiresAt: nowMs + 7 * 24 * 60 * 60 * 1000,
    },
  }
}

export const seedTestSession = async (page: Page) => {
  const session = createTestSession()
  await page.addInitScript(
    ({ storageKey, value }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(value))
    },
    { storageKey: STORAGE_KEY, value: session },
  )
}

export const mockApiRoutes = async (page: Page) => {
  await page.route('**/auth/me', (route) => respondJson(route, testUser))
  await page.route('**/auth/refresh', (route) => respondJson(route, refreshResponse))
  await page.route('**/profiles/me', (route) => respondJson(route, testProfile))
  await page.route('**/dashboard/summary', (route) => respondJson(route, dashboardSummary))
  await page.route('**/community/feed**', (route) => respondJson(route, communityFeedResponse))
  await page.route('**/biomarkers/definitions', (route) => respondJson(route, biomarkerDefinitions))

  await page.route('**/ai/plans*', (route) => {
    if (route.request().method() === 'GET') {
      return respondJson(route, longevityPlans)
    }
    return respondJson(route, { plan: longevityPlans[0] })
  })

  await page.route(/.*\/ai\/uploads\/[^/]+\/download/, (route) =>
    respondJson(route, { url: 'https://example.com/mock.pdf' }),
  )

  await page.route(/.*\/ai\/uploads\/[^/]+\/tags/, (route) => respondJson(route, panelUploads[0]))

  await page.route('**/ai/uploads/sessions', (route) =>
    respondJson(route, {
      sessionId: 'session-mock',
      storageKey: 'uploads/longevity-panel.pdf',
      uploadUrl: 'https://storage.googleapis.com/mock-upload',
      expiresAt: nowIso,
      requiredHeaders: {
        'Content-Type': 'application/pdf',
        'x-goog-content-sha256': 'a'.repeat(64),
      },
      kmsKeyName: null,
      maxBytes: 25 * 1024 * 1024,
    }),
  )
  await page.route('https://storage.googleapis.com/mock-upload', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: 'mock-pdf' }),
  )

  await page.route('**/ai/uploads**', (route) => {
    if (route.request().method() === 'GET') {
      return respondJson(route, panelUploads)
    }
    return respondJson(route, panelUploads[0])
  })
}

export const setupAuthenticatedApp = async (page: Page) => {
  await mockApiRoutes(page)
  await seedTestSession(page)
}

