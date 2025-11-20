import { useState, useEffect, useCallback } from 'react';
import { Card } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Apple, Plus, Target, Flame, Droplets, Beef, Calendar, Clock, Award, ChevronRight, Edit2, Copy, Trash2 } from 'lucide-react';
import {
  nutritionApi,
  type MealType,
  type NutritionMeal,
  type MacroSummary,
  type MacroMetric,
  type NutritionProtocolSummary,
  type MealTemplateSummary,
  type MicronutrientSummary
} from '../../lib/api/nutrition';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth/AuthContext';

const DEFAULT_GOALS = {
  calories: 2400,
  protein: 180,
  carbs: 250,
  fats: 80
};

export default function NutritionView() {
  const { ensureAccessToken } = useAuth();
  const [isCreatingMeal, setIsCreatingMeal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meals, setMeals] = useState<NutritionMeal[]>([]);
  const [macros, setMacros] = useState<MacroSummary | null>(null);
  const [protocols, setProtocols] = useState<NutritionProtocolSummary[]>([]);
  const [templates, setTemplates] = useState<MealTemplateSummary[]>([]);
  const [micronutrients, setMicronutrients] = useState<MicronutrientSummary[]>([]);
  const [goals, setGoals] = useState<{ calories: number; protein: number; carbs: number; fats: number } | null>(null);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);

  // Form State
  const [mealName, setMealName] = useState('');
  const [mealType, setMealType] = useState<MealType>('BREAKFAST');
  const [mealTime, setMealTime] = useState('12:00');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [ingredients, setIngredients] = useState('');

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await ensureAccessToken();
      const data = await nutritionApi.getSummary(token);
      setMeals(data.meals);
      setMacros(data.macros);
      setProtocols(data.protocols);
      setTemplates(data.templates);
      setMicronutrients(data.micronutrients);
      setGoals(data.goals);
      setSummaryDate(data.date);
    } catch (err) {
      console.error('Failed to load nutrition data', err);
      setError('Failed to load nutrition data');
      toast.error('Failed to load nutrition data');
    } finally {
      setLoading(false);
    }
  }, [ensureAccessToken]);

  const handleCreateMeal = async () => {
    try {
      if (!mealName || !calories) {
        toast.error('Please provide a name and calories');
        return;
      }

      const eatenAt = new Date();
      const [hours, minutes] = mealTime.split(':').map(Number);
      eatenAt.setHours(hours, minutes, 0, 0);

      const token = await ensureAccessToken();
      await nutritionApi.createLog(token, {
        name: mealName,
        type: mealType,
        calories: Number(calories),
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fats: Number(fats) || 0,
        items: ingredients.split('\n').filter(i => i.trim()),
        eatenAt: eatenAt.toISOString()
      });

      toast.success('Meal logged successfully');
      setIsCreatingMeal(false);
      resetForm();
      await loadData();
    } catch (err) {
      console.error('Failed to create log', err);
      toast.error('Failed to log meal');
    }
  };

  const handleDeleteMeal = async (id: string) => {
    if (!confirm('Are you sure you want to delete this meal?')) return;
    try {
      const token = await ensureAccessToken();
      await nutritionApi.deleteLog(token, id);
      toast.success('Meal deleted');
      await loadData();
    } catch (err) {
      console.error('Failed to delete log', err);
      toast.error('Failed to delete meal');
    }
  };

  const resetForm = () => {
    setMealName('');
    setMealType('BREAKFAST');
    setMealTime('12:00');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFats('');
    setIngredients('');
  };

  const getMacroPercentage = (metric: MacroMetric) => metric.progress ?? 0;

  const resolvedGoals = goals ?? DEFAULT_GOALS;
  const dailyMacros: MacroSummary =
    macros ?? {
      calories: { current: 0, target: resolvedGoals.calories, unit: 'cal', progress: 0 },
      protein: { current: 0, target: resolvedGoals.protein, unit: 'g', progress: 0 },
      carbs: { current: 0, target: resolvedGoals.carbs, unit: 'g', progress: 0 },
      fats: { current: 0, target: resolvedGoals.fats, unit: 'g', progress: 0 }
    };

  return (
    <div className="min-h-screen mesh-gradient pt-28 pb-20 px-6" data-testid="view-nutrition">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 text-steel text-sm font-semibold">
            <Apple className="w-4 h-4" />
            <span>Nutrition Studio</span>
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold text-ink">Nutrition & Supplementation</h1>
            <p className="text-lg text-steel max-w-3xl mx-auto">
              Personalized protocols optimized for your biomarkers, daily routines, and recovery targets.
            </p>
          </div>
          <Dialog open={isCreatingMeal} onOpenChange={setIsCreatingMeal}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-600 to-purple-600">
                <Plus className="w-4 h-4 mr-2" />
                Log Meal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Log Meal</DialogTitle>
                <DialogDescription>
                  Add a meal to track your daily nutrition and macros
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="meal-name">Meal Name</Label>
                  <Input
                    id="meal-name"
                    placeholder="e.g., Breakfast Power Bowl"
                    value={mealName}
                    onChange={(e) => setMealName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="meal-type">Meal Type</Label>
                    <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
                      <SelectTrigger id="meal-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BREAKFAST">Breakfast</SelectItem>
                        <SelectItem value="LUNCH">Lunch</SelectItem>
                        <SelectItem value="DINNER">Dinner</SelectItem>
                        <SelectItem value="SNACK">Snack</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meal-time">Time</Label>
                    <Input 
                      id="meal-time" 
                      type="time" 
                      value={mealTime}
                      onChange={(e) => setMealTime(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="calories">Calories</Label>
                    <Input 
                      id="calories" 
                      type="number" 
                      placeholder="500" 
                      value={calories}
                      onChange={(e) => setCalories(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="protein">Protein (g)</Label>
                    <Input 
                      id="protein" 
                      type="number" 
                      placeholder="40"
                      value={protein}
                      onChange={(e) => setProtein(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="carbs">Carbs (g)</Label>
                    <Input 
                      id="carbs" 
                      type="number" 
                      placeholder="50"
                      value={carbs}
                      onChange={(e) => setCarbs(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fats">Fats (g)</Label>
                    <Input 
                      id="fats" 
                      type="number" 
                      placeholder="20"
                      value={fats}
                      onChange={(e) => setFats(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ingredients">Ingredients</Label>
                  <Textarea
                    id="ingredients"
                    placeholder="List the ingredients (one per line)"
                    rows={4}
                    value={ingredients}
                    onChange={(e) => setIngredients(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCreatingMeal(false)}>
                    Cancel
                  </Button>
                  <Button 
                    className="bg-gradient-to-r from-blue-600 to-purple-600"
                    onClick={handleCreateMeal}
                  >
                    Log Meal
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-8">
          {error && (
            <div className="neo-card border border-pulse/40 bg-pulse/5 text-pulse px-6 py-4">
              {error}
            </div>
          )}
          <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-neutral-900 mb-1">Today's Nutrition</h2>
            <p className="text-sm text-neutral-600">
              {summaryDate ? new Date(summaryDate).toLocaleDateString() : new Date().toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Target className="w-3 h-3 mr-1" />
              Target: {resolvedGoals.calories} cal
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {Object.entries(dailyMacros).map(([key, data]) => {
            const percentage = getMacroPercentage(data);
            const isComplete = percentage >= 95;
            
            return (
              <div key={key} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {key === 'calories' && <Flame className="w-4 h-4 text-orange-600" />}
                    {key === 'protein' && <Beef className="w-4 h-4 text-red-600" />}
                    {key === 'carbs' && <Apple className="w-4 h-4 text-green-600" />}
                    {key === 'fats' && <Droplets className="w-4 h-4 text-yellow-600" />}
                    <span className="text-sm text-neutral-600 capitalize">{key}</span>
                  </div>
                  <span className={`text-sm ${isComplete ? 'text-green-600' : 'text-neutral-900'}`}>
                    {data.current}/{data.target} {data.unit}
                  </span>
                </div>
                <Progress value={percentage} className="h-2" />
              </div>
            );
          })}
        </div>
          </Card>

          <div className="neo-card p-6">
            <Tabs defaultValue="meals" className="w-full">
              <TabsList className="flex w-full flex-wrap justify-center gap-2 bg-white/70 text-sm font-semibold">
                <TabsTrigger value="meals" className="min-w-[150px]">Today's Meals</TabsTrigger>
                <TabsTrigger value="protocols" className="min-w-[150px]">Supplement Protocols</TabsTrigger>
                <TabsTrigger value="templates" className="min-w-[150px]">Meal Templates</TabsTrigger>
                <TabsTrigger value="micronutrients" className="min-w-[150px]">Micronutrients</TabsTrigger>
              </TabsList>

              <TabsContent value="meals" className="mt-6 space-y-4">
          {loading ? (
            <Card className="p-6 text-center text-steel">Loading meals…</Card>
          ) : meals.length === 0 ? (
            <Card className="p-6 text-center text-steel">No meals logged today. Log your first meal to unlock personalized guidance.</Card>
          ) : (
            meals.map((meal) => (
              <Card key={meal.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-neutral-900">{meal.name}</h3>
                      <Badge variant="outline">{meal.type}</Badge>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <Award className="w-3 h-3 mr-1" />
                        Score: {meal.score}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-neutral-600 mb-3">
                      <Clock className="w-4 h-4" />
                      <span>{new Date(meal.eatenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                        <p className="text-xs text-neutral-600 mb-1">Calories</p>
                        <p className="text-neutral-900">{meal.calories}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                        <p className="text-xs text-neutral-600 mb-1">Protein</p>
                        <p className="text-neutral-900">{meal.protein}g</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                        <p className="text-xs text-neutral-600 mb-1">Carbs</p>
                        <p className="text-neutral-900">{meal.carbs}g</p>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
                        <p className="text-xs text-neutral-600 mb-1">Fats</p>
                        <p className="text-neutral-900">{meal.fats}g</p>
                      </div>
                    </div>

                    {meal.items.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {meal.items.map((item) => (
                          <span
                            key={item}
                            className="px-3 py-1 bg-neutral-50 rounded-full text-sm text-neutral-700 border border-neutral-200"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleDeleteMeal(meal.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

              <TabsContent value="protocols" className="mt-6 space-y-4">
          {loading ? (
            <Card className="p-6 text-center text-steel">Loading protocols…</Card>
          ) : protocols.length === 0 ? (
            <Card className="p-6 text-center text-steel">
              No active supplementation protocols yet. Generate a longevity plan to unlock personalized guidance.
            </Card>
          ) : (
            protocols.map((protocol, idx) => {
              const cardClass = `neo-card-${protocol.color}`;
              const gradientClass = `gradient-${protocol.color}`;
              const adherence = protocol.adherence ?? 0;
              const supplementList = protocol.supplements ?? [];

              return (
                <Card key={protocol.id} className={`${cardClass} p-6 hover:shadow-lg transition-shadow`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-neutral-900">{protocol.title}</h3>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {protocol.evidence} Evidence
                        </Badge>
                      </div>
                      <p className="text-sm text-neutral-600 mb-3">
                        {protocol.focus ?? protocol.category ?? 'Holistic optimization'}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-600 mb-4">
                        {protocol.duration && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>{protocol.duration}</span>
                          </div>
                        )}
                        {protocol.timing && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>{protocol.timing}</span>
                          </div>
                        )}
                        {protocol.citations !== null && (
                          <div className="flex items-center gap-1">
                            <Award className="w-4 h-4" />
                            <span>{protocol.citations} Citations</span>
                          </div>
                        )}
                      </div>

                      {protocol.impact && (
                        <div className={`${gradientClass} text-white rounded-lg px-4 py-3 mb-4`}>
                          <p className="text-sm font-semibold">Impact</p>
                          <p className="text-sm opacity-90">{protocol.impact}</p>
                        </div>
                      )}

                      <div className="mb-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                          <span className="text-sm text-neutral-600">Adherence</span>
                          <span className="text-sm text-neutral-900">
                            {adherence > 0 ? `${adherence}%` : '—'}
                          </span>
                        </div>
                        <Progress value={adherence} className="h-2" />
                      </div>

                      {supplementList.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {supplementList.map((supplement) => (
                            <span
                              key={`${protocol.id}-${supplement}`}
                              className="px-3 py-1 bg-blue-50 rounded-full text-sm text-blue-700 border border-blue-200"
                            >
                              {supplement}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button variant="outline" size="sm">
                      Learn More
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </TabsContent>

              <TabsContent value="templates" className="mt-6">
          {loading ? (
            <Card className="p-6 text-center text-steel">Loading templates…</Card>
          ) : templates.length === 0 ? (
            <Card className="p-6 text-center text-steel">
              No meal templates yet. We'll populate recommendations once a longevity plan is available.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                  <h3 className="text-neutral-900 mb-3">{template.name}</h3>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="text-neutral-600">Calories</span>
                      <span className="text-neutral-900">{template.calories} cal</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="text-neutral-600">Protein</span>
                      <span className="text-neutral-900">{template.protein}g</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="text-neutral-600">Carbs</span>
                      <span className="text-neutral-900">{template.carbs}g</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="text-neutral-600">Fats</span>
                      <span className="text-neutral-900">{template.fats}g</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-neutral-200">
                    <div className="flex items-center gap-4 text-sm text-neutral-600">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{template.prepTimeLabel}</span>
                      </div>
                      <Badge variant="outline" className="text-xs uppercase tracking-wide">{template.complexity}</Badge>
                    </div>
                    <Button size="sm" variant="outline">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

              <TabsContent value="micronutrients" className="mt-6">
          <Card className="p-6">
            <div className="mb-6">
              <h2 className="text-neutral-900 mb-2">Micronutrient Status</h2>
              <p className="text-sm text-neutral-600">
                Based on your latest lab results and supplementation protocol
              </p>
            </div>

            {loading ? (
              <div className="text-center py-6 text-steel">Loading micronutrient insights…</div>
            ) : micronutrients.length === 0 ? (
              <div className="text-center py-6 text-steel">
                No micronutrient data available yet. Upload lab results to unlock personalized guidance.
              </div>
            ) : (
              <>
                <div className="space-y-6">
                  {micronutrients.map((nutrient) => {
                    const percentage = nutrient.target > 0 ? (nutrient.value / nutrient.target) * 100 : 0;
                    const statusColor =
                      nutrient.status === 'optimal'
                        ? 'text-green-600'
                        : nutrient.status === 'low'
                        ? 'text-orange-600'
                        : 'text-red-600';
                    const badgeClass =
                      nutrient.status === 'optimal'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : nutrient.status === 'low'
                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                        : 'bg-red-50 text-red-700 border-red-200';

                    return (
                      <div key={nutrient.id}>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-900">{nutrient.name}</span>
                            <Badge variant="outline" className={badgeClass}>
                              {nutrient.status}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <span className={statusColor}>
                              {nutrient.value} {nutrient.unit}
                            </span>
                            <span className="text-neutral-600 text-sm ml-2">
                              / {nutrient.target} {nutrient.unit}
                            </span>
                          </div>
                        </div>
                        <Progress value={Math.min(percentage, 150)} className="h-2" />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-neutral-900 mb-2">💡 Optimization Recommendations</p>
                  <ul className="text-sm text-neutral-600 space-y-1 list-disc list-inside">
                    {(() => {
                      const actionable = micronutrients
                        .filter((nutrient) => nutrient.status === 'low' || nutrient.status === 'high')
                        .slice(0, 3)
                        .map((nutrient) =>
                          nutrient.status === 'low'
                            ? `Increase intake of ${nutrient.name} to reach ${nutrient.target} ${nutrient.unit}.`
                            : `Review supplementation: ${nutrient.name} is trending above optimal range.`
                        );
                      if (actionable.length === 0) {
                        actionable.push('Your micronutrient panel looks balanced. Maintain current protocol.');
                      }
                      return actionable.map((recommendation) => <li key={recommendation}>{recommendation}</li>);
                    })()}
                  </ul>
                </div>
              </>
            )}
          </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
