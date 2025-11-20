import {
  Prisma,
  PrismaClient,
  Role,
  UserStatus,
  BiomarkerSource,
  InsightStatus,
  PostVisibility,
  AuthProviderType,
  InsightActionType,
  InsightGenerationStatus,
  CloudTaskStatus,
  ReactionType,
  RoomStatus,
  RoomMembershipRole,
  RoomMembershipStatus,
  FlagStatus,
  FlagTargetType,
  WhoopSyncStatus,
  MembershipInviteStatus,
  MealType,
  NutritionEvidenceLevel,
  TemplateComplexity,
  MicronutrientStatus
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  const memberEmail = process.env.SEED_MEMBER_EMAIL ?? 'member@example.com';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const memberPassword = process.env.SEED_MEMBER_PASSWORD ?? 'PlaywrightSeedPass1!';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'PlaywrightAdminPass1!';
  const memberPasswordHash = await bcrypt.hash(memberPassword, 10);
  const adminPasswordHash =
    adminPassword === memberPassword ? memberPasswordHash : await bcrypt.hash(adminPassword, 10);

  const [hrvBiomarker, rhrBiomarker] = await Promise.all([
    prisma.biomarker.upsert({
      where: { slug: 'hrv' },
      update: {
        name: 'Heart Rate Variability',
        unit: 'ms',
        referenceLow: new Prisma.Decimal(60),
        referenceHigh: new Prisma.Decimal(120)
      },
      create: {
        id: 'seed-biomarker-hrv',
        slug: 'hrv',
        name: 'Heart Rate Variability',
        unit: 'ms',
        referenceLow: new Prisma.Decimal(60),
        referenceHigh: new Prisma.Decimal(120),
        source: BiomarkerSource.MANUAL
      }
    }),
    prisma.biomarker.upsert({
      where: { slug: 'resting-heart-rate' },
      update: {
        name: 'Resting Heart Rate',
        unit: 'bpm',
        referenceLow: new Prisma.Decimal(50),
        referenceHigh: new Prisma.Decimal(65)
      },
      create: {
        id: 'seed-biomarker-rhr',
        slug: 'resting-heart-rate',
        name: 'Resting Heart Rate',
        unit: 'bpm',
        referenceLow: new Prisma.Decimal(50),
        referenceHigh: new Prisma.Decimal(65),
        source: BiomarkerSource.MANUAL
      }
    })
  ]);

  const dualEngineInsightBody: Prisma.JsonObject = {
    insights: [
      'OpenAI 5: HRV trend is up 6% over the last 3 days — recovery window is expanding.',
      'Gemini 2.5 Pro: Subjective readiness aligns with improved HRV variance, indicating lower autonomic stress.'
    ],
    recommendations: [
      'Gemini 2.5 Pro: Extend Zone 2 cardio to 30 minutes and keep HRV logging daily.',
      'OpenChat 5: Add a magnesium glycinate dose 60 minutes before bed to reinforce parasympathetic tone.'
    ],
    metadata: {
      confidenceScore: 0.84,
      agreementRatio: 0.78,
      disagreements: {
        insights: [
          'OpenChat 5: Emphasized magnesium intake as primary driver.',
          'Gemini 2.5 Pro: Prioritized additional breathwork sessions.'
        ],
        recommendations: [
          'Gemini 2.5 Pro: Suggested one extra mobility block; OpenChat 5 skipped it.'
        ]
      },
      engines: [
        {
          id: 'OPENCHAT5',
          label: 'OpenChat 5',
          model: 'openrouter/openchat/openchat-5',
          completionId: 'seed-openchat5-completion',
          title: 'HRV trending up',
          summary: 'OpenChat 5 highlighted stronger recovery capacity tied to HRV gains.'
        },
        {
          id: 'GEMINI',
          label: 'Gemini 2.5 Pro',
          model: 'openrouter/google/gemini-2.5-pro',
          completionId: 'seed-gemini25-completion',
          title: 'Parasympathetic rebound detected',
          summary: 'Gemini underscored breathwork plus magnesium to lock in readiness.'
        }
      ]
    }
  };

  const dualEnginePromptMetadata: Prisma.JsonObject = {
    request: {
      focus: 'recovery',
      biomarkerWindowDays: 7,
      includeManualLogs: true
    },
    engines: ['OPENCHAT5', 'GEMINI']
  };

  const user = await prisma.user.upsert({
    where: { email: memberEmail },
    update: {
      passwordHash: memberPasswordHash,
      status: UserStatus.ACTIVE,
      profile: {
        update: {
          displayName: 'BioHax Member',
          timezone: 'America/Los_Angeles',
          deleteRequested: false
        }
      }
    },
    create: {
      email: memberEmail,
      passwordHash: memberPasswordHash,
      fullName: 'BioHax Member',
      role: Role.MEMBER,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          id: 'seed-profile-member',
          displayName: 'BioHax Member',
          timezone: 'America/Los_Angeles',
          baselineSurvey: { readiness: 'baseline-complete' },
          consents: [
            { type: 'TERMS_OF_SERVICE', granted: true, grantedAt: new Date().toISOString() },
            { type: 'PRIVACY_POLICY', granted: true, grantedAt: new Date().toISOString() }
          ],
          deleteRequested: false,
          onboardingCompletedAt: new Date()
        }
      },
      authProviders: {
        create: {
          id: 'seed-auth-provider-email',
          type: AuthProviderType.EMAIL_PASSWORD,
          providerUserId: memberEmail
        }
      },
      biomarkerLogs: {
        create: [
          {
            id: 'seed-log-hrv',
            biomarker: { connect: { slug: hrvBiomarker.slug } },
            value: new Prisma.Decimal(75),
            unit: 'ms',
            source: BiomarkerSource.MANUAL,
            capturedAt: new Date(Date.now() - 48 * 60 * 60 * 1000)
          },
          {
            id: 'seed-log-rhr',
            biomarker: { connect: { slug: rhrBiomarker.slug } },
            value: new Prisma.Decimal(54),
            unit: 'bpm',
            source: BiomarkerSource.MANUAL,
            capturedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        ]
      },
      insights: {
        create: [
          {
            id: 'seed-insight',
            title: 'Recovery trending up',
            summary: 'HRV improvements suggest readiness for increased workload.',
            body: dualEngineInsightBody,
            modelUsed: 'dual-engine',
            promptMetadata: dualEnginePromptMetadata,
            status: InsightStatus.DELIVERED,
            generatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
          }
        ]
      },
      feedPosts: {
        create: [
          {
            id: 'seed-feed-post',
            body: 'Excited to start optimizing recovery together!',
            tags: ['introduction', 'recovery'],
            visibility: PostVisibility.MEMBERS
          }
        ]
      }
    },
    include: {
      profile: true,
      authProviders: true,
      biomarkerLogs: true,
      insights: true,
      feedPosts: true,
      auditLogs: true
    }
  });

  const primaryInsight = user.insights[0];

  await prisma.macroGoals.upsert({
    where: { userId: user.id },
    update: {
      calories: 2400,
      protein: 180,
      carbs: 250,
      fats: 80
    },
    create: {
      id: 'seed-macro-goals',
      userId: user.id,
      calories: 2400,
      protein: 180,
      carbs: 250,
      fats: 80
    }
  });

  const seededMeals: Array<{
    id: string;
    name: string;
    type: MealType;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    items: string[];
    hour: number;
    minute: number;
  }> = [
    {
      id: 'seed-nutrition-breakfast',
      name: 'Longevity Power Bowl',
      type: MealType.BREAKFAST,
      calories: 520,
      protein: 42,
      carbs: 58,
      fats: 18,
      items: ['6 eggs', 'Spinach', 'Avocado', 'Sweet potato', 'Olive oil'],
      hour: 8,
      minute: 30
    },
    {
      id: 'seed-nutrition-lunch',
      name: 'Wild Salmon & Quinoa',
      type: MealType.LUNCH,
      calories: 680,
      protein: 52,
      carbs: 72,
      fats: 24,
      items: ['Wild salmon (6oz)', 'Quinoa', 'Broccoli', 'Mixed greens', 'Tahini'],
      hour: 13,
      minute: 0
    },
    {
      id: 'seed-nutrition-snack',
      name: 'Pre-Workout Snack',
      type: MealType.SNACK,
      calories: 280,
      protein: 28,
      carbs: 32,
      fats: 8,
      items: ['Greek yogurt', 'Blueberries', 'Honey', 'Almonds'],
      hour: 16,
      minute: 30
    }
  ];

  for (const meal of seededMeals) {
    const eatenAt = new Date();
    eatenAt.setHours(meal.hour, meal.minute, 0, 0);
    await prisma.nutritionLog.upsert({
      where: { id: meal.id },
      update: {
        name: meal.name,
        type: meal.type,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fats: meal.fats,
        items: meal.items,
        eatenAt
      },
      create: {
        id: meal.id,
        userId: user.id,
        name: meal.name,
        type: meal.type,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fats: meal.fats,
        items: meal.items,
        eatenAt
      }
    });
  }

  const seededProtocols: Array<{
    id: string;
    title: string;
    focus: string;
    durationWeeks: number;
    evidence: NutritionEvidenceLevel;
    adherence: number;
    impactSummary: string;
    timing: string;
    supplements: string[];
    citations: number;
    colorTheme: string;
  }> = [
    {
      id: 'seed-protocol-mitochondrial',
      title: 'Mitochondrial Support Protocol',
      focus: 'Energy production, cellular health',
      durationWeeks: 8,
      evidence: NutritionEvidenceLevel.HIGH,
      adherence: 87,
      impactSummary: 'Improves ATP output and reduces perceived fatigue.',
      timing: 'Morning with breakfast',
      supplements: ['NAD+ (500mg)', 'CoQ10 (200mg)', 'PQQ (20mg)', 'Alpha-Lipoic Acid (600mg)'],
      citations: 8,
      colorTheme: 'electric'
    },
    {
      id: 'seed-protocol-micronutrient',
      title: 'Longevity Micronutrient Stack',
      focus: 'Cellular repair, antioxidant support',
      durationWeeks: 12,
      evidence: NutritionEvidenceLevel.HIGH,
      adherence: 92,
      impactSummary: 'Supports methylation, bone density, and lipid balance.',
      timing: 'With largest meal',
      supplements: ['Vitamin D3 (5000 IU)', 'K2 (200mcg)', 'Magnesium (400mg)', 'Omega-3 (2g EPA/DHA)'],
      citations: 12,
      colorTheme: 'bio'
    },
    {
      id: 'seed-protocol-autophagy',
      title: 'Autophagy Enhancement',
      focus: 'Cellular cleanup, metabolic health',
      durationWeeks: 16,
      evidence: NutritionEvidenceLevel.MEDIUM,
      adherence: 78,
      impactSummary: 'Encourages senescent cell recycling and metabolic flexibility.',
      timing: 'During fasting window',
      supplements: ['Spermidine (1mg)', 'Resveratrol (500mg)', 'Berberine (1500mg)'],
      citations: 6,
      colorTheme: 'neural'
    }
  ];

  for (const protocol of seededProtocols) {
    await prisma.nutritionProtocol.upsert({
      where: { id: protocol.id },
      update: {
        title: protocol.title,
        focus: protocol.focus,
        durationWeeks: protocol.durationWeeks,
        evidence: protocol.evidence,
        adherence: protocol.adherence,
        impactSummary: protocol.impactSummary,
        timing: protocol.timing,
        supplements: protocol.supplements,
        citations: protocol.citations,
        colorTheme: protocol.colorTheme,
        userId: user.id
      },
      create: {
        id: protocol.id,
        userId: user.id,
        title: protocol.title,
        focus: protocol.focus,
        durationWeeks: protocol.durationWeeks,
        evidence: protocol.evidence,
        adherence: protocol.adherence,
        impactSummary: protocol.impactSummary,
        timing: protocol.timing,
        supplements: protocol.supplements,
        citations: protocol.citations,
        colorTheme: protocol.colorTheme
      }
    });
  }

  const seededTemplates: Array<{
    id: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    prepTimeMinutes: number;
    complexity: TemplateComplexity;
    description?: string;
  }> = [
    {
      id: 'seed-template-protein-breakfast',
      name: 'High Protein Breakfast',
      calories: 520,
      protein: 45,
      carbs: 48,
      fats: 18,
      prepTimeMinutes: 15,
      complexity: TemplateComplexity.EASY,
      description: 'Quick AM template to hit protein target without spiking glucose.'
    },
    {
      id: 'seed-template-mediterranean-lunch',
      name: 'Mediterranean Power Lunch',
      calories: 650,
      protein: 48,
      carbs: 68,
      fats: 22,
      prepTimeMinutes: 25,
      complexity: TemplateComplexity.MEDIUM,
      description: 'Balanced midday meal emphasizing polyphenols and fiber.'
    },
    {
      id: 'seed-template-recovery',
      name: 'Post-Workout Recovery',
      calories: 420,
      protein: 52,
      carbs: 42,
      fats: 8,
      prepTimeMinutes: 10,
      complexity: TemplateComplexity.EASY,
      description: 'Rapid absorption template to refuel glycogen and support muscle repair.'
    }
  ];

  for (const template of seededTemplates) {
    await prisma.mealTemplate.upsert({
      where: { id: template.id },
      update: {
        name: template.name,
        calories: template.calories,
        protein: template.protein,
        carbs: template.carbs,
        fats: template.fats,
        prepTimeMinutes: template.prepTimeMinutes,
        complexity: template.complexity,
        description: template.description,
        userId: user.id
      },
      create: {
        id: template.id,
        name: template.name,
        calories: template.calories,
        protein: template.protein,
        carbs: template.carbs,
        fats: template.fats,
        prepTimeMinutes: template.prepTimeMinutes,
        complexity: template.complexity,
        description: template.description,
        userId: user.id
      }
    });
  }

  const micronutrientsSeed: Array<{
    id: string;
    name: string;
    value: number;
    target: number;
    unit: string;
    status: MicronutrientStatus;
  }> = [
    { id: 'seed-micro-vitamin-d', name: 'Vitamin D', value: 58, target: 70, unit: 'ng/mL', status: MicronutrientStatus.LOW },
    { id: 'seed-micro-magnesium', name: 'Magnesium', value: 5.2, target: 6.0, unit: 'mg/dL', status: MicronutrientStatus.LOW },
    { id: 'seed-micro-omega3', name: 'Omega-3 Index', value: 7.8, target: 8.5, unit: '%', status: MicronutrientStatus.OPTIMAL },
    { id: 'seed-micro-b12', name: 'Vitamin B12', value: 580, target: 500, unit: 'pg/mL', status: MicronutrientStatus.OPTIMAL },
    { id: 'seed-micro-iron', name: 'Iron', value: 92, target: 100, unit: 'µg/dL', status: MicronutrientStatus.OPTIMAL }
  ];

  for (const nutrient of micronutrientsSeed) {
    await prisma.nutritionMicronutrient.upsert({
      where: { id: nutrient.id },
      update: {
        name: nutrient.name,
        value: nutrient.value,
        target: nutrient.target,
        unit: nutrient.unit,
        status: nutrient.status,
        recordedAt: new Date(),
        userId: user.id
      },
      create: {
        id: nutrient.id,
        userId: user.id,
        name: nutrient.name,
        value: nutrient.value,
        target: nutrient.target,
        unit: nutrient.unit,
        status: nutrient.status,
        recordedAt: new Date()
      }
    });
  }

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      profile: {
        update: {
          displayName: 'BioHax Admin',
          timezone: 'UTC',
          deleteRequested: false
        }
      },
      authProviders: {
        deleteMany: {
          type: AuthProviderType.EMAIL_PASSWORD
        },
        create: {
          id: 'seed-admin-auth-provider',
          type: AuthProviderType.EMAIL_PASSWORD,
          providerUserId: adminEmail
        }
      }
    },
    create: {
      id: 'seed-admin-user',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      fullName: 'BioHax Admin',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          id: 'seed-profile-admin',
          displayName: 'BioHax Admin',
          timezone: 'UTC',
          consents: [
            { type: 'TERMS_OF_SERVICE', granted: true, grantedAt: new Date().toISOString() },
            { type: 'PRIVACY_POLICY', granted: true, grantedAt: new Date().toISOString() }
          ],
          deleteRequested: false,
          onboardingCompletedAt: new Date()
        }
      },
      authProviders: {
        create: {
          id: 'seed-admin-auth-provider',
          type: AuthProviderType.EMAIL_PASSWORD,
          providerUserId: adminEmail
        }
      }
    },
    include: {
      profile: true
    }
  });

  const roomsHostEmail = 'rooms-host@example.com';
  const roomsHost = await prisma.user.upsert({
    where: { email: roomsHostEmail },
    update: {
      passwordHash: memberPasswordHash,
      status: UserStatus.ACTIVE,
      profile: {
        update: {
          displayName: 'Rooms Host',
          timezone: 'America/Los_Angeles',
          deleteRequested: false
        }
      }
    },
    create: {
      email: roomsHostEmail,
      passwordHash: memberPasswordHash,
      fullName: 'Rooms Host',
      role: Role.MEMBER,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          id: 'seed-profile-rooms-host',
          displayName: 'Rooms Host',
          timezone: 'America/Los_Angeles',
          baselineSurvey: Prisma.JsonNull,
          consents: [
            { type: 'TERMS_OF_SERVICE', granted: true, grantedAt: new Date().toISOString() },
            { type: 'PRIVACY_POLICY', granted: true, grantedAt: new Date().toISOString() }
          ],
          deleteRequested: false,
          onboardingCompletedAt: new Date()
        }
      },
      authProviders: {
        create: {
          id: 'seed-auth-provider-rooms-host',
          type: AuthProviderType.EMAIL_PASSWORD,
          providerUserId: roomsHostEmail
        }
      }
    },
    include: {
      profile: true
    }
  });

  await prisma.authProvider.upsert({
    where: { id: 'seed-auth-provider-rooms-host' },
    update: {
      type: AuthProviderType.EMAIL_PASSWORD,
      providerUserId: roomsHostEmail,
      userId: roomsHost.id
    },
    create: {
      id: 'seed-auth-provider-rooms-host',
      userId: roomsHost.id,
      type: AuthProviderType.EMAIL_PASSWORD,
      providerUserId: roomsHostEmail
    }
  });

  await prisma.authProvider.upsert({
    where: { id: 'seed-auth-provider-email' },
    update: {
      type: AuthProviderType.EMAIL_PASSWORD,
      providerUserId: memberEmail
    },
    create: {
      id: 'seed-auth-provider-email',
      userId: user.id,
      type: AuthProviderType.EMAIL_PASSWORD,
      providerUserId: memberEmail
    }
  });

  await prisma.authProvider.upsert({
    where: { id: 'seed-admin-auth-provider' },
    update: {
      type: AuthProviderType.EMAIL_PASSWORD,
      providerUserId: adminEmail,
      userId: adminUser.id
    },
    create: {
      id: 'seed-admin-auth-provider',
      userId: adminUser.id,
      type: AuthProviderType.EMAIL_PASSWORD,
      providerUserId: adminEmail
    }
  });
  if (primaryInsight) {
    await prisma.insightAction.upsert({
      where: { id: 'seed-insight-action' },
      update: {
        notes: 'Seed run refreshed.'
      },
      create: {
        id: 'seed-insight-action',
        insightId: primaryInsight.id,
        actorId: user.id,
        actionType: InsightActionType.ACCEPTED,
        notes: 'Baseline insight accepted by demo member.'
      }
    });
  }

  const feedPost = await prisma.feedPost.upsert({
    where: { id: 'seed-feed-post' },
    update: {
      body: 'Excited to start optimizing recovery together!',
      tags: { set: ['introduction', 'recovery'] }
    },
    create: {
      id: 'seed-feed-post',
      authorId: user.id,
      body: 'Excited to start optimizing recovery together!',
      tags: ['introduction', 'recovery'],
      visibility: PostVisibility.MEMBERS
    }
  });

  await prisma.comment.upsert({
    where: { id: 'seed-feed-comment' },
    update: {
      body: 'Welcome to the BioHax beta!'
    },
    create: {
      id: 'seed-feed-comment',
      postId: feedPost.id,
      authorId: user.id,
      body: 'Welcome to the BioHax beta!'
    }
  });

  await prisma.reaction.upsert({
    where: { id: 'seed-feed-reaction' },
    update: {},
    create: {
      id: 'seed-feed-reaction',
      type: ReactionType.BOOST,
      postId: feedPost.id,
      userId: user.id
    }
  });

  await prisma.feedPost.update({
    where: { id: feedPost.id },
    data: {
      commentCount: 1
    }
  });

  const now = new Date();
  const moderationOpenedAt = new Date(now.getTime() - 45 * 60 * 1000).toISOString();

  const openFlagAuditTrail: Prisma.JsonObject = {
    events: [
      {
        status: FlagStatus.OPEN,
        notes: 'Member reported potentially inaccurate recovery recommendations.',
        metadata: {
          severity: 'medium',
          source: 'community-report'
        },
        actorId: user.id,
        occurredAt: moderationOpenedAt
      }
    ]
  };

  const insightQueuePayload: Prisma.JsonObject = {
    jobType: 'insight-refresh',
    seeded: true
  };

  const whoopQueuePayload: Prisma.JsonObject = {
    scope: 'whoop-sync',
    seeded: true
  };

  await prisma.adminAuditLog.deleteMany({
    where: {
      targetType: 'FLAG',
      targetId: 'seed-flag-post-open'
    }
  });

  const moderationFlag = await prisma.flag.upsert({
    where: { id: 'seed-flag-post-open' },
    update: {
      status: FlagStatus.OPEN,
      reason: 'Reported misinformation on recovery plan',
      targetType: FlagTargetType.POST,
      postId: feedPost.id,
      commentId: null,
      insightId: null,
      biomarkerLogId: null,
      openedById: user.id,
      resolvedById: null,
      resolvedAt: null,
      auditTrail: openFlagAuditTrail
    },
    create: {
      id: 'seed-flag-post-open',
      targetType: FlagTargetType.POST,
      status: FlagStatus.OPEN,
      reason: 'Reported misinformation on recovery plan',
      postId: feedPost.id,
      openedById: user.id,
      auditTrail: openFlagAuditTrail
    }
  });

  await prisma.adminAuditLog.upsert({
    where: { id: 'seed-flag-audit-bootstrap' },
    update: {
      actorId: adminUser.id,
      action: 'FLAG_CREATED',
      targetType: 'FLAG',
      targetId: moderationFlag.id,
      metadata: {
        status: 'OPEN',
        seededAt: now.toISOString()
      }
    },
    create: {
      id: 'seed-flag-audit-bootstrap',
      actorId: adminUser.id,
      action: 'FLAG_CREATED',
      targetType: 'FLAG',
      targetId: moderationFlag.id,
      metadata: {
        status: 'OPEN',
        seededAt: now.toISOString()
      }
    }
  });

  const generationJob = primaryInsight
    ? await prisma.insightGenerationJob.upsert({
        where: { id: 'seed-insight-job' },
        update: {
          status: InsightGenerationStatus.SUCCEEDED,
          completedAt: new Date()
        },
        create: {
          id: 'seed-insight-job',
          insightId: primaryInsight.id,
          requestedById: user.id,
          status: InsightGenerationStatus.SUCCEEDED,
          cloudTaskName: 'seed-insight-job-task',
          queue: 'insights-generate',
          payload: { insightId: primaryInsight.id },
          scheduledAt: new Date(Date.now() - 15 * 60 * 1000),
          dispatchedAt: new Date(Date.now() - 12 * 60 * 1000),
          completedAt: new Date()
        }
      })
    : null;

  if (generationJob) {
    await prisma.cloudTaskMetadata.upsert({
      where: { taskName: 'seed-insight-job-task' },
      update: {
        status: CloudTaskStatus.SUCCEEDED,
        jobId: generationJob.id,
        attemptCount: 1,
        lastAttemptAt: new Date(),
        firstAttemptAt: new Date(Date.now() - 12 * 60 * 1000)
      },
      create: {
        id: 'seed-cloud-task',
        taskName: 'seed-insight-job-task',
        queue: 'insights-generate',
        status: CloudTaskStatus.SUCCEEDED,
        jobId: generationJob.id,
        payload: { jobId: generationJob.id },
        scheduleTime: new Date(Date.now() - 15 * 60 * 1000),
        firstAttemptAt: new Date(Date.now() - 12 * 60 * 1000),
        lastAttemptAt: new Date(),
        attemptCount: 1
      }
    });
  }

  await prisma.cloudTaskMetadata.upsert({
    where: { taskName: 'seed-pending-insight-task' },
    update: {
      queue: 'insights-generate',
      status: CloudTaskStatus.PENDING,
      scheduleTime: new Date(Date.now() - 25 * 60 * 1000),
      firstAttemptAt: null,
      lastAttemptAt: null,
      attemptCount: 0,
      payload: insightQueuePayload
    },
    create: {
      id: 'seed-cloud-task-pending',
      taskName: 'seed-pending-insight-task',
      queue: 'insights-generate',
      status: CloudTaskStatus.PENDING,
      scheduleTime: new Date(Date.now() - 25 * 60 * 1000),
      payload: insightQueuePayload
    }
  });

  await prisma.cloudTaskMetadata.upsert({
    where: { taskName: 'seed-whoop-sync-task' },
    update: {
      queue: 'whoop-sync',
      status: CloudTaskStatus.DISPATCHED,
      scheduleTime: new Date(Date.now() - 90 * 60 * 1000),
      firstAttemptAt: new Date(Date.now() - 80 * 60 * 1000),
      lastAttemptAt: new Date(Date.now() - 40 * 60 * 1000),
      attemptCount: 2,
      payload: whoopQueuePayload
    },
    create: {
      id: 'seed-cloud-task-whoop',
      taskName: 'seed-whoop-sync-task',
      queue: 'whoop-sync',
      status: CloudTaskStatus.DISPATCHED,
      scheduleTime: new Date(Date.now() - 90 * 60 * 1000),
      firstAttemptAt: new Date(Date.now() - 80 * 60 * 1000),
      lastAttemptAt: new Date(Date.now() - 40 * 60 * 1000),
      attemptCount: 2,
      payload: whoopQueuePayload
    }
  });

  await prisma.whoopIntegration.upsert({
    where: { userId: user.id },
    update: {
      syncStatus: WhoopSyncStatus.ACTIVE,
      lastSyncedAt: new Date(),
      whoopUserId: 'seed-whoop-member'
    },
    create: {
      id: 'seed-whoop-member-integration',
      userId: user.id,
      whoopUserId: 'seed-whoop-member',
      accessToken: 'seed-access-token',
      refreshToken: 'seed-refresh-token',
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      scope: ['read:recovery'],
      syncStatus: WhoopSyncStatus.ACTIVE,
      lastSyncedAt: new Date()
    }
  });

  await prisma.whoopIntegration.upsert({
    where: { userId: roomsHost.id },
    update: {
      syncStatus: WhoopSyncStatus.PENDING,
      lastSyncedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      whoopUserId: 'seed-whoop-host'
    },
    create: {
      id: 'seed-whoop-host-integration',
      userId: roomsHost.id,
      whoopUserId: 'seed-whoop-host',
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      scope: [],
      syncStatus: WhoopSyncStatus.PENDING,
      lastSyncedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    }
  });

  await prisma.adminAuditLog.upsert({
    where: { id: 'seed-audit-log' },
    update: {
      actorId: adminUser.id,
      metadata: { refreshedAt: new Date().toISOString() }
    },
    create: {
      id: 'seed-audit-log',
      actorId: adminUser.id,
      action: 'SEED_DATA_BOOTSTRAP',
      targetType: 'SYSTEM',
      metadata: {
        note: 'Baseline seed data created',
        executedAt: new Date().toISOString()
      }
    }
  });

  const openRoom = await prisma.room.upsert({
    where: { inviteCode: 'OPEN1234' },
    update: {
      name: 'Playwright Sync Room',
      status: RoomStatus.LOBBY,
      capacity: 8,
      hostId: roomsHost.id
    },
    create: {
      id: 'seed-room-open',
      name: 'Playwright Sync Room',
      inviteCode: 'OPEN1234',
      status: RoomStatus.LOBBY,
      capacity: 8,
      hostId: roomsHost.id
    }
  });

  await prisma.roomMembership.upsert({
    where: {
      roomId_userId: {
        roomId: openRoom.id,
        userId: roomsHost.id
      }
    },
    update: {
      role: RoomMembershipRole.HOST,
      status: RoomMembershipStatus.ACTIVE,
      joinedAt: new Date(),
      leftAt: null
    },
    create: {
      id: 'seed-room-open-host-membership',
      roomId: openRoom.id,
      userId: roomsHost.id,
      role: RoomMembershipRole.HOST,
      status: RoomMembershipStatus.ACTIVE,
      joinedAt: new Date()
    }
  });

  await prisma.roomMembership.deleteMany({
    where: {
      roomId: openRoom.id,
      userId: user.id
    }
  });

  const fullRoom = await prisma.room.upsert({
    where: { inviteCode: 'FULL9999' },
    update: {
      name: 'Capacity Lock Room',
      status: RoomStatus.LOBBY,
      capacity: 1,
      hostId: roomsHost.id
    },
    create: {
      id: 'seed-room-full',
      name: 'Capacity Lock Room',
      inviteCode: 'FULL9999',
      status: RoomStatus.LOBBY,
      capacity: 1,
      hostId: roomsHost.id
    }
  });

  await prisma.roomMembership.upsert({
    where: {
      roomId_userId: {
        roomId: fullRoom.id,
        userId: roomsHost.id
      }
    },
    update: {
      role: RoomMembershipRole.HOST,
      status: RoomMembershipStatus.ACTIVE,
      joinedAt: new Date(),
      leftAt: null
    },
    create: {
      id: 'seed-room-full-host-membership',
      roomId: fullRoom.id,
      userId: roomsHost.id,
      role: RoomMembershipRole.HOST,
      status: RoomMembershipStatus.ACTIVE,
      joinedAt: new Date()
    }
  });

  await prisma.roomMembership.deleteMany({
    where: {
      roomId: fullRoom.id,
      userId: user.id
    }
  });

  await prisma.membershipInvite.upsert({
    where: { code: 'BIOHAX-ALPHA' },
    update: {
      maxUses: 500,
      status: MembershipInviteStatus.ACTIVE,
      metadata: { note: 'Default internal invite' }
    },
    create: {
      id: 'seed-invite-alpha',
      code: 'BIOHAX-ALPHA',
      status: MembershipInviteStatus.ACTIVE,
      maxUses: 500,
      usedCount: 0,
      metadata: { note: 'Default internal invite' }
    }
  });

  await prisma.membershipInvite.upsert({
    where: { code: 'LAB-FOUNDERS' },
    update: {
      email: 'founder@biohax.pro',
      maxUses: 1,
      status: MembershipInviteStatus.ACTIVE
    },
    create: {
      id: 'seed-invite-founders',
      code: 'LAB-FOUNDERS',
      email: 'founder@biohax.pro',
      status: MembershipInviteStatus.ACTIVE,
      maxUses: 1,
      usedCount: 0
    }
  });

  console.info('[seed] Created base member account:', user.email);
}

seed()
  .then(() => {
    console.info('[seed] Completed successfully');
  })
  .catch((error) => {
    console.error('[seed] Failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
