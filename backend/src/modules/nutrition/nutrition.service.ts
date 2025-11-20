import {
  PrismaClient,
  NutritionLog,
  MacroGoals,
  MealType,
  NutritionProtocol,
  MealTemplate,
  NutritionMicronutrient,
  NutritionEvidenceLevel,
  MicronutrientStatus
} from '@prisma/client';

import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';

type CreateNutritionLogInput = {
  name: string;
  type: MealType;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  items?: string[];
  eatenAt?: string;
  notes?: string;
};

type UpdateNutritionLogInput = Partial<CreateNutritionLogInput>;

type CreateMacroGoalsInput = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

type MacroMetric = {
  current: number;
  target: number;
  unit: string;
  progress: number;
};

type MacroSummary = {
  calories: MacroMetric;
  protein: MacroMetric;
  carbs: MacroMetric;
  fats: MacroMetric;
};

type MealSummary = {
  id: string;
  name: string;
  type: MealType;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  items: string[];
  eatenAt: string;
  score: number;
};

type ProtocolSummary = {
  id: string;
  title: string;
  focus: string | null;
  category: string | null;
  duration: string | null;
  evidence: 'High' | 'Medium' | 'Low';
  adherence: number | null;
  impact: string | null;
  timing: string | null;
  supplements: string[];
  citations: number | null;
  color: string;
};

type MealTemplateSummary = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  prepTimeLabel: string;
  complexity: string;
};

type MicronutrientSummary = {
  id: string;
  name: string;
  value: number;
  target: number;
  unit: string;
  status: 'low' | 'optimal' | 'high';
  recordedAt: string;
};

export type NutritionDashboardSummary = {
  date: string;
  macros: MacroSummary;
  meals: MealSummary[];
  protocols: ProtocolSummary[];
  templates: MealTemplateSummary[];
  micronutrients: MicronutrientSummary[];
  goals: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
};

const DEFAULT_MACRO_GOALS: CreateMacroGoalsInput = {
  calories: 2400,
  protein: 180,
  carbs: 250,
  fats: 80
};

const COLOR_PALETTE = ['electric', 'bio', 'neural', 'pulse', 'solar'];

export class NutritionService {
  constructor(private readonly prisma: PrismaClient = prismaClient) {}

  async logMeal(userId: string, input: CreateNutritionLogInput): Promise<NutritionLog> {
    return this.prisma.nutritionLog.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fats: input.fats,
        items: input.items ?? [],
        notes: input.notes,
        eatenAt: input.eatenAt ? new Date(input.eatenAt) : new Date()
      }
    });
  }

  async getDailyLogs(userId: string, date: Date): Promise<NutritionLog[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.nutritionLog.findMany({
      where: {
        userId,
        eatenAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      orderBy: {
        eatenAt: 'asc'
      }
    });
  }

  async updateLog(userId: string, logId: string, input: UpdateNutritionLogInput): Promise<NutritionLog> {
    const log = await this.prisma.nutritionLog.findFirst({
      where: { id: logId, userId }
    });

    if (!log) {
      throw new HttpError(404, 'Nutrition log not found', 'LOG_NOT_FOUND');
    }

    return this.prisma.nutritionLog.update({
      where: { id: logId },
      data: {
        name: input.name,
        type: input.type,
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fats: input.fats,
        items: input.items,
        notes: input.notes,
        eatenAt: input.eatenAt ? new Date(input.eatenAt) : undefined
      }
    });
  }

  async deleteLog(userId: string, logId: string): Promise<void> {
    const log = await this.prisma.nutritionLog.findFirst({
      where: { id: logId, userId }
    });

    if (!log) {
      throw new HttpError(404, 'Nutrition log not found', 'LOG_NOT_FOUND');
    }

    await this.prisma.nutritionLog.delete({
      where: { id: logId }
    });
  }

  async setMacroGoals(userId: string, input: CreateMacroGoalsInput): Promise<MacroGoals> {
    return this.prisma.macroGoals.upsert({
      where: { userId },
      update: {
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fats: input.fats
      },
      create: {
        userId,
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fats: input.fats
      }
    });
  }

  async getMacroGoals(userId: string): Promise<MacroGoals | null> {
    return this.prisma.macroGoals.findUnique({
      where: { userId }
    });
  }

  async getDailySummary(userId: string, date: Date): Promise<NutritionDashboardSummary> {
    const [logs, goals, protocols, templates, micronutrients] = await Promise.all([
      this.getDailyLogs(userId, date),
      this.getMacroGoals(userId),
      this.loadProtocols(userId),
      this.loadTemplates(userId),
      this.loadMicronutrients(userId)
    ]);

    const resolvedGoals: CreateMacroGoalsInput = goals
      ? {
          calories: goals.calories,
          protein: goals.protein,
          carbs: goals.carbs,
          fats: goals.fats
        }
      : DEFAULT_MACRO_GOALS;

    const totals = logs.reduce(
      (acc, log) => ({
        calories: acc.calories + log.calories,
        protein: acc.protein + log.protein,
        carbs: acc.carbs + log.carbs,
        fats: acc.fats + log.fats
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );

    const macros: MacroSummary = {
      calories: this.buildMacroMetric(totals.calories, resolvedGoals.calories, 'cal'),
      protein: this.buildMacroMetric(totals.protein, resolvedGoals.protein, 'g'),
      carbs: this.buildMacroMetric(totals.carbs, resolvedGoals.carbs, 'g'),
      fats: this.buildMacroMetric(totals.fats, resolvedGoals.fats, 'g')
    };

    const meals: MealSummary[] = logs.map((log) => ({
      id: log.id,
      name: log.name,
      type: log.type,
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fats: log.fats,
      items: log.items ?? [],
      eatenAt: log.eatenAt.toISOString(),
      score: this.computeMealScore(log, resolvedGoals)
    }));

    const protocolSummaries: ProtocolSummary[] = protocols.map((protocol, index) =>
      this.mapProtocol(protocol, index)
    );

    const templateSummaries: MealTemplateSummary[] = templates.map((template) =>
      this.mapTemplate(template)
    );

    const micronutrientSummaries: MicronutrientSummary[] = micronutrients.map((entry) =>
      this.mapMicronutrient(entry)
    );

    return {
      date: date.toISOString(),
      macros,
      meals,
      protocols: protocolSummaries,
      templates: templateSummaries,
      micronutrients: micronutrientSummaries,
      goals: {
        calories: resolvedGoals.calories,
        protein: resolvedGoals.protein,
        carbs: resolvedGoals.carbs,
        fats: resolvedGoals.fats
      }
    };
  }

  private buildMacroMetric(current: number, target: number, unit: string): MacroMetric {
    const safeTarget = target > 0 ? target : 1;
    const progress = Math.min(100, Math.round((current / safeTarget) * 100));
    return {
      current,
      target,
      unit,
      progress
    };
  }

  private computeMealScore(log: NutritionLog, goals: CreateMacroGoalsInput): number {
    const calorieRatio = goals.calories > 0 ? (log.calories / goals.calories) * 100 : 0;
    const proteinRatio = goals.protein > 0 ? (log.protein / goals.protein) * 100 : 0;
    const carbRatio = goals.carbs > 0 ? (log.carbs / goals.carbs) * 100 : 0;
    const fatRatio = goals.fats > 0 ? (log.fats / goals.fats) * 100 : 0;
    const average = (calorieRatio + proteinRatio + carbRatio + fatRatio) / 4;
    return Math.max(0, Math.min(100, Math.round(average)));
  }

  private async loadProtocols(userId: string): Promise<NutritionProtocol[]> {
    return this.prisma.nutritionProtocol.findMany({
      where: {
        OR: [{ userId }, { userId: null }]
      },
      orderBy: [
        { userId: 'desc' },
        { createdAt: 'asc' }
      ]
    });
  }

  private async loadTemplates(userId: string): Promise<MealTemplate[]> {
    return this.prisma.mealTemplate.findMany({
      where: {
        OR: [{ userId }, { userId: null }]
      },
      orderBy: [
        { userId: 'desc' },
        { createdAt: 'asc' }
      ]
    });
  }

  private async loadMicronutrients(userId: string): Promise<NutritionMicronutrient[]> {
    const records = await this.prisma.nutritionMicronutrient.findMany({
      where: { userId },
      orderBy: [
        { recordedAt: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    const seen = new Set<string>();
    const latestPerMarker: NutritionMicronutrient[] = [];
    for (const record of records) {
      const key = record.name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      latestPerMarker.push(record);
    }

    return latestPerMarker;
  }

  private mapProtocol(protocol: NutritionProtocol, index: number): ProtocolSummary {
    const evidence = this.mapEvidence(protocol.evidence);
    const color = protocol.colorTheme ?? COLOR_PALETTE[index % COLOR_PALETTE.length];
    return {
      id: protocol.id,
      title: protocol.title,
      focus: protocol.focus ?? null,
      category: protocol.category ?? null,
      duration: protocol.durationWeeks ? `${protocol.durationWeeks} weeks` : null,
      evidence,
      adherence: protocol.adherence ?? null,
      impact: protocol.impactSummary ?? null,
      timing: protocol.timing ?? null,
      supplements: protocol.supplements ?? [],
      citations: protocol.citations ?? null,
      color
    };
  }

  private mapTemplate(template: MealTemplate): MealTemplateSummary {
    const prepTimeLabel =
      template.prepTimeMinutes > 0 ? `${template.prepTimeMinutes} min` : '—';

    return {
      id: template.id,
      name: template.name,
      calories: template.calories,
      protein: template.protein,
      carbs: template.carbs,
      fats: template.fats,
      prepTimeLabel,
      complexity: this.mapTemplateComplexity(template.complexity)
    };
  }

  private mapMicronutrient(entry: NutritionMicronutrient): MicronutrientSummary {
    return {
      id: entry.id,
      name: entry.name,
      value: entry.value,
      target: entry.target,
      unit: entry.unit,
      status: this.mapMicronutrientStatus(entry.status),
      recordedAt: entry.recordedAt.toISOString()
    };
  }

  private mapEvidence(level: NutritionEvidenceLevel): 'High' | 'Medium' | 'Low' {
    switch (level) {
      case 'HIGH':
        return 'High';
      case 'MEDIUM':
        return 'Medium';
      default:
        return 'Low';
    }
  }

  private mapTemplateComplexity(value: MealTemplate['complexity']): string {
    switch (value) {
      case 'EASY':
        return 'Easy';
      case 'MEDIUM':
        return 'Medium';
      default:
        return 'Advanced';
    }
  }

  private mapMicronutrientStatus(status: MicronutrientStatus): 'low' | 'optimal' | 'high' {
    switch (status) {
      case 'LOW':
        return 'low';
      case 'HIGH':
        return 'high';
      default:
        return 'optimal';
    }
  }
}

export const nutritionService = new NutritionService();
