import { useState } from 'react';
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
import { Apple, Plus, TrendingUp, Target, Flame, Droplets, Beef, Calendar, Clock, Award, ChevronRight, Edit2, Copy } from 'lucide-react';

const dailyMacros = {
  calories: { current: 2140, target: 2400, unit: 'cal' },
  protein: { current: 165, target: 180, unit: 'g' },
  carbs: { current: 198, target: 240, unit: 'g' },
  fats: { current: 68, target: 80, unit: 'g' },
};

const todaysMeals = [
  {
    id: 'm1',
    name: 'Longevity Power Bowl',
    time: '8:30 AM',
    type: 'Breakfast',
    calories: 520,
    protein: 42,
    carbs: 58,
    fats: 18,
    items: ['6 eggs', 'Spinach', 'Avocado', 'Sweet potato', 'Olive oil'],
    score: 95,
  },
  {
    id: 'm2',
    name: 'Wild Salmon & Quinoa',
    time: '1:00 PM',
    type: 'Lunch',
    calories: 680,
    protein: 52,
    carbs: 72,
    fats: 24,
    items: ['Wild salmon (6oz)', 'Quinoa', 'Broccoli', 'Mixed greens', 'Tahini'],
    score: 92,
  },
  {
    id: 'm3',
    name: 'Pre-Workout Snack',
    time: '4:30 PM',
    type: 'Snack',
    calories: 280,
    protein: 28,
    carbs: 32,
    fats: 8,
    items: ['Greek yogurt', 'Blueberries', 'Honey', 'Almonds'],
    score: 88,
  },
  {
    id: 'm4',
    name: 'Grass-Fed Steak & Veggies',
    time: '7:00 PM',
    type: 'Dinner',
    calories: 660,
    protein: 43,
    carbs: 36,
    fats: 18,
    items: ['Grass-fed steak (8oz)', 'Asparagus', 'Sweet potato', 'Butter'],
    score: 90,
  },
];

const nutritionProtocols = [
  {
    id: 'np1',
    name: 'Mitochondrial Support Protocol',
    duration: '8 weeks',
    evidence: 'High',
    focus: 'Energy production, cellular health',
    adherence: 87,
    supplements: ['NAD+ (500mg)', 'CoQ10 (200mg)', 'PQQ (20mg)', 'Alpha-Lipoic Acid (600mg)'],
    timing: 'Morning with breakfast',
    citations: 8,
  },
  {
    id: 'np2',
    name: 'Longevity Micronutrient Stack',
    duration: '12 weeks',
    evidence: 'High',
    focus: 'Cellular repair, antioxidant support',
    adherence: 92,
    supplements: ['Vitamin D3 (5000 IU)', 'K2 (200mcg)', 'Magnesium (400mg)', 'Omega-3 (2g EPA/DHA)'],
    timing: 'With largest meal',
    citations: 12,
  },
  {
    id: 'np3',
    name: 'Autophagy Enhancement',
    duration: '16 weeks',
    evidence: 'Medium',
    focus: 'Cellular cleanup, metabolic health',
    adherence: 78,
    supplements: ['Spermidine (1mg)', 'Resveratrol (500mg)', 'Berberine (1500mg)'],
    timing: 'During fasting window',
    citations: 6,
  },
];

const mealTemplates = [
  {
    id: 'mt1',
    name: 'High Protein Breakfast',
    calories: 520,
    protein: 45,
    carbs: 48,
    fats: 18,
    prepTime: '15 min',
    complexity: 'Easy',
  },
  {
    id: 'mt2',
    name: 'Mediterranean Power Lunch',
    calories: 650,
    protein: 48,
    carbs: 68,
    fats: 22,
    prepTime: '25 min',
    complexity: 'Medium',
  },
  {
    id: 'mt3',
    name: 'Post-Workout Recovery',
    calories: 420,
    protein: 52,
    carbs: 42,
    fats: 8,
    prepTime: '10 min',
    complexity: 'Easy',
  },
];

const micronutrientStatus = [
  { name: 'Vitamin D', value: 58, target: 70, unit: 'ng/mL', status: 'low' },
  { name: 'Magnesium', value: 5.2, target: 6.0, unit: 'mg/dL', status: 'low' },
  { name: 'Omega-3 Index', value: 7.8, target: 8.5, unit: '%', status: 'optimal' },
  { name: 'B12', value: 580, target: 500, unit: 'pg/mL', status: 'optimal' },
  { name: 'Iron', value: 92, target: 100, unit: 'μg/dL', status: 'optimal' },
  { name: 'Zinc', value: 88, target: 90, unit: 'μg/dL', status: 'optimal' },
];

export default function NutritionView() {
  const [isCreatingMeal, setIsCreatingMeal] = useState(false);
  const [mealName, setMealName] = useState('');

  const getMacroPercentage = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-neutral-900 mb-2">Nutrition & Supplementation</h1>
          <p className="text-neutral-600">
            Personalized nutrition protocols optimized for your biomarkers and performance goals
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="meal-type">Meal Type</Label>
                  <Select>
                    <SelectTrigger id="meal-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakfast">Breakfast</SelectItem>
                      <SelectItem value="lunch">Lunch</SelectItem>
                      <SelectItem value="dinner">Dinner</SelectItem>
                      <SelectItem value="snack">Snack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meal-time">Time</Label>
                  <Input id="meal-time" type="time" defaultValue="12:00" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="calories">Calories</Label>
                  <Input id="calories" type="number" placeholder="500" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="protein">Protein (g)</Label>
                  <Input id="protein" type="number" placeholder="40" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="carbs">Carbs (g)</Label>
                  <Input id="carbs" type="number" placeholder="50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fats">Fats (g)</Label>
                  <Input id="fats" type="number" placeholder="20" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ingredients">Ingredients</Label>
                <Textarea
                  id="ingredients"
                  placeholder="List the ingredients (one per line)"
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreatingMeal(false)}>
                  Cancel
                </Button>
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600">
                  Log Meal
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Daily Macros Overview */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-neutral-900 mb-1">Today's Nutrition</h2>
            <p className="text-sm text-neutral-600">November 1, 2025</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Target className="w-3 h-3 mr-1" />
              89% of target
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {Object.entries(dailyMacros).map(([key, data]) => {
            const percentage = getMacroPercentage(data.current, data.target);
            const isComplete = percentage >= 95;
            
            return (
              <div key={key} className="space-y-3">
                <div className="flex items-center justify-between">
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

      <Tabs defaultValue="meals" className="w-full">
        <TabsList>
          <TabsTrigger value="meals">Today's Meals</TabsTrigger>
          <TabsTrigger value="protocols">Supplement Protocols</TabsTrigger>
          <TabsTrigger value="templates">Meal Templates</TabsTrigger>
          <TabsTrigger value="micronutrients">Micronutrients</TabsTrigger>
        </TabsList>

        <TabsContent value="meals" className="mt-6 space-y-4">
          {todaysMeals.map((meal) => (
            <Card key={meal.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
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
                    <span>{meal.time}</span>
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
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="protocols" className="mt-6 space-y-4">
          {nutritionProtocols.map((protocol) => (
            <Card key={protocol.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-neutral-900">{protocol.name}</h3>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {protocol.evidence} Evidence
                    </Badge>
                  </div>
                  <p className="text-sm text-neutral-600 mb-3">{protocol.focus}</p>
                  
                  <div className="flex items-center gap-4 text-sm text-neutral-600 mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{protocol.duration}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{protocol.timing}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Award className="w-4 h-4" />
                      <span>{protocol.citations} Citations</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-neutral-600">Adherence</span>
                      <span className="text-sm text-neutral-900">{protocol.adherence}%</span>
                    </div>
                    <Progress value={protocol.adherence} className="h-2" />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {protocol.supplements.map((supplement) => (
                      <span
                        key={supplement}
                        className="px-3 py-1 bg-blue-50 rounded-full text-sm text-blue-700 border border-blue-200"
                      >
                        {supplement}
                      </span>
                    ))}
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  View Details
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mealTemplates.map((template) => (
              <Card key={template.id} className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                <h3 className="text-neutral-900 mb-3">{template.name}</h3>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Calories</span>
                    <span className="text-neutral-900">{template.calories} cal</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Protein</span>
                    <span className="text-neutral-900">{template.protein}g</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Carbs</span>
                    <span className="text-neutral-900">{template.carbs}g</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Fats</span>
                    <span className="text-neutral-900">{template.fats}g</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
                  <div className="flex items-center gap-4 text-sm text-neutral-600">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{template.prepTime}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{template.complexity}</Badge>
                  </div>
                  <Button size="sm" variant="outline">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="micronutrients" className="mt-6">
          <Card className="p-6">
            <div className="mb-6">
              <h2 className="text-neutral-900 mb-2">Micronutrient Status</h2>
              <p className="text-sm text-neutral-600">
                Based on your latest lab results and supplementation protocol
              </p>
            </div>

            <div className="space-y-6">
              {micronutrientStatus.map((nutrient) => {
                const percentage = (nutrient.value / nutrient.target) * 100;
                const statusColor =
                  nutrient.status === 'optimal' ? 'text-green-600' :
                  nutrient.status === 'low' ? 'text-orange-600' :
                  'text-neutral-600';

                return (
                  <div key={nutrient.name}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-900">{nutrient.name}</span>
                        <Badge
                          variant="outline"
                          className={`${
                            nutrient.status === 'optimal'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-orange-50 text-orange-700 border-orange-200'
                          }`}
                        >
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
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-sm text-neutral-900 mb-2">💡 Optimization Recommendations</p>
              <ul className="text-sm text-neutral-600 space-y-1 list-disc list-inside">
                <li>Consider increasing Vitamin D supplementation to 7,000 IU daily</li>
                <li>Add Magnesium Glycinate (400mg) before bed for optimal absorption</li>
                <li>Your Omega-3 index is excellent - continue current protocol</li>
              </ul>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
