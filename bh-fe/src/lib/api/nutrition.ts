import { apiFetch } from './http';

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

export interface MacroMetric {
  current: number;
  target: number;
  unit: string;
  progress: number;
}

export interface MacroSummary {
  calories: MacroMetric;
  protein: MacroMetric;
  carbs: MacroMetric;
  fats: MacroMetric;
}

export interface MacroGoals {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface NutritionMeal {
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
}

export interface NutritionProtocolSummary {
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
}

export interface MealTemplateSummary {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  prepTimeLabel: string;
  complexity: string;
}

export interface MicronutrientSummary {
  id: string;
  name: string;
  value: number;
  target: number;
  unit: string;
  status: 'low' | 'optimal' | 'high';
  recordedAt: string;
}

export interface NutritionDashboardSummary {
  date: string;
  macros: MacroSummary;
  meals: NutritionMeal[];
  protocols: NutritionProtocolSummary[];
  templates: MealTemplateSummary[];
  micronutrients: MicronutrientSummary[];
  goals: MacroGoals;
}

export interface CreateLogInput {
  name: string;
  type: MealType;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  items?: string[];
  eatenAt?: string;
  notes?: string;
}

const buildQueryString = (params?: Record<string, string | undefined>): string => {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

export const nutritionApi = {
  createLog: async (accessToken: string, data: CreateLogInput): Promise<NutritionMeal> => {
    return apiFetch<NutritionMeal>('/nutrition/logs', {
      method: 'POST',
      authToken: accessToken,
      body: JSON.stringify(data)
    });
  },

  updateLog: async (
    accessToken: string,
    id: string,
    data: Partial<CreateLogInput>
  ): Promise<NutritionMeal> => {
    return apiFetch<NutritionMeal>(`/nutrition/logs/${id}`, {
      method: 'PATCH',
      authToken: accessToken,
      body: JSON.stringify(data)
    });
  },

  deleteLog: async (accessToken: string, id: string): Promise<void> => {
    return apiFetch<void>(`/nutrition/logs/${id}`, {
      method: 'DELETE',
      authToken: accessToken
    });
  },

  setGoals: async (accessToken: string, data: MacroGoals): Promise<MacroGoals> => {
    return apiFetch<MacroGoals>('/nutrition/goals', {
      method: 'PUT',
      authToken: accessToken,
      body: JSON.stringify(data)
    });
  },

  getGoals: async (accessToken: string): Promise<MacroGoals | null> => {
    return apiFetch<MacroGoals | null>('/nutrition/goals', {
      method: 'GET',
      authToken: accessToken
    });
  },

  getSummary: async (
    accessToken: string,
    date?: string
  ): Promise<NutritionDashboardSummary> => {
    const query = buildQueryString(date ? { date } : undefined);
    return apiFetch<NutritionDashboardSummary>(`/nutrition/summary${query}`, {
      method: 'GET',
      authToken: accessToken
    });
  }
};

