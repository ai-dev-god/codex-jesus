import { useState } from 'react';
import { Card } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Checkbox } from '../ui/checkbox';
import { Dumbbell, Plus, Clock, TrendingUp, Flame, Target, Trophy, BarChart3, PlayCircle, Edit2, Trash2, Copy } from 'lucide-react';
import { Progress } from '../ui/progress';

const workoutTemplates = [
  {
    id: '1',
    name: 'Longevity Strength Training',
    type: 'Strength',
    duration: '45 min',
    frequency: '3x/week',
    evidence: 'High',
    focus: 'Muscle preservation, bone density',
    exercises: [
      { name: 'Barbell Squat', sets: 3, reps: '8-12', rest: 120, load: 'Moderate' },
      { name: 'Deadlift', sets: 3, reps: '6-10', rest: 150, load: 'Heavy' },
      { name: 'Bench Press', sets: 3, reps: '8-12', rest: 120, load: 'Moderate' },
      { name: 'Pull-ups', sets: 3, reps: 'AMRAP', rest: 120, load: 'Bodyweight' },
    ],
  },
  {
    id: '2',
    name: 'Mitochondrial Zone 2 Cardio',
    type: 'Endurance',
    duration: '60 min',
    frequency: '4x/week',
    evidence: 'High',
    focus: 'Mitochondrial biogenesis, fat oxidation',
    exercises: [
      { name: 'Cycling (60-70% HR max)', sets: 1, reps: '60 min', rest: 0, load: 'Low' },
    ],
  },
  {
    id: '3',
    name: 'VO2 Max HIIT Protocol',
    type: 'HIIT',
    duration: '30 min',
    frequency: '2x/week',
    evidence: 'High',
    focus: 'Cardiovascular capacity, longevity',
    exercises: [
      { name: 'Sprint Intervals (90% HR max)', sets: 8, reps: '3 min', rest: 120, load: 'High' },
      { name: 'Active Recovery', sets: 8, reps: '2 min', rest: 0, load: 'Low' },
    ],
  },
];

const myWorkouts = [
  {
    id: 'w1',
    name: 'Upper Body Power',
    type: 'Strength',
    lastPerformed: '2 days ago',
    totalVolume: '12,450 lbs',
    avgDuration: '52 min',
    adherence: 94,
    exercises: 6,
  },
  {
    id: 'w2',
    name: 'Zone 2 Endurance',
    type: 'Cardio',
    lastPerformed: 'Yesterday',
    totalVolume: '480 cal',
    avgDuration: '45 min',
    adherence: 88,
    exercises: 1,
  },
];

const exerciseLibrary = [
  { name: 'Barbell Squat', category: 'Legs', equipment: 'Barbell' },
  { name: 'Deadlift', category: 'Full Body', equipment: 'Barbell' },
  { name: 'Bench Press', category: 'Chest', equipment: 'Barbell' },
  { name: 'Pull-ups', category: 'Back', equipment: 'Bodyweight' },
  { name: 'Romanian Deadlift', category: 'Legs', equipment: 'Barbell' },
  { name: 'Overhead Press', category: 'Shoulders', equipment: 'Barbell' },
  { name: 'Bent-Over Row', category: 'Back', equipment: 'Barbell' },
  { name: 'Lunges', category: 'Legs', equipment: 'Bodyweight' },
];

const workoutMetrics = [
  { label: 'Total Volume', value: '142,680 lbs', change: '+8%', trend: 'up' },
  { label: 'Avg Session Duration', value: '48 min', change: '-3 min', trend: 'neutral' },
  { label: 'Weekly Frequency', value: '5.2 sessions', change: '+1.2', trend: 'up' },
  { label: 'Energy Expenditure', value: '2,840 cal', change: '+12%', trend: 'up' },
];

export default function GymWorkoutCreator() {
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkoutName, setNewWorkoutName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-neutral-900 mb-2">Workout & Training Protocols</h1>
          <p className="text-neutral-600">
            Evidence-based training programs optimized for longevity and performance
          </p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600">
              <Plus className="w-4 h-4 mr-2" />
              Create Workout
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Custom Workout</DialogTitle>
              <DialogDescription>
                Build a personalized workout protocol based on your goals and biomarkers
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="workout-name">Workout Name</Label>
                <Input
                  id="workout-name"
                  placeholder="e.g., Morning Strength Session"
                  value={newWorkoutName}
                  onChange={(e) => setNewWorkoutName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="workout-type">Type</Label>
                  <Select>
                    <SelectTrigger id="workout-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strength">Strength</SelectItem>
                      <SelectItem value="cardio">Cardio</SelectItem>
                      <SelectItem value="hiit">HIIT</SelectItem>
                      <SelectItem value="flexibility">Flexibility</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Select>
                    <SelectTrigger id="duration">
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                      <SelectItem value="90">90 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Exercise Library</Label>
                <div className="border border-neutral-200 rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
                  {exerciseLibrary.map((exercise) => (
                    <div key={exercise.name} className="flex items-center justify-between p-2 hover:bg-neutral-50 rounded">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedExercises.includes(exercise.name)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedExercises([...selectedExercises, exercise.name]);
                            } else {
                              setSelectedExercises(selectedExercises.filter((e) => e !== exercise.name));
                            }
                          }}
                        />
                        <div>
                          <p className="text-neutral-900">{exercise.name}</p>
                          <p className="text-sm text-neutral-500">{exercise.category} • {exercise.equipment}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600">
                  Create Workout
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {workoutMetrics.map((metric) => (
          <Card key={metric.label} className="p-4">
            <p className="text-sm text-neutral-600 mb-1">{metric.label}</p>
            <p className="text-neutral-900 mb-1">{metric.value}</p>
            <div className="flex items-center gap-1 text-sm">
              <TrendingUp
                className={`w-4 h-4 ${
                  metric.trend === 'up' ? 'text-green-600' : 'text-neutral-500'
                }`}
              />
              <span
                className={
                  metric.trend === 'up' ? 'text-green-600' : 'text-neutral-600'
                }
              >
                {metric.change}
              </span>
              <span className="text-neutral-500">this week</span>
            </div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList>
          <TabsTrigger value="templates">Protocol Templates</TabsTrigger>
          <TabsTrigger value="my-workouts">My Workouts</TabsTrigger>
          <TabsTrigger value="history">Workout History</TabsTrigger>
          <TabsTrigger value="progress">Progress Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-6 space-y-4">
          {workoutTemplates.map((template) => (
            <Card key={template.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Dumbbell className="w-5 h-5 text-blue-600" />
                    <h3 className="text-neutral-900">{template.name}</h3>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {template.type}
                    </Badge>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      {template.evidence} Evidence
                    </Badge>
                  </div>
                  <p className="text-sm text-neutral-600 mb-3">{template.focus}</p>
                  <div className="flex items-center gap-4 text-sm text-neutral-600">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{template.duration}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="w-4 h-4" />
                      <span>{template.frequency}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Trophy className="w-4 h-4" />
                      <span>{template.exercises.length} exercises</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600">
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Start Workout
                  </Button>
                  <Button variant="outline">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Exercise List */}
              <div className="border-t border-neutral-200 pt-4 space-y-2">
                {template.exercises.map((exercise, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm text-blue-700">{idx + 1}</span>
                      </div>
                      <div>
                        <p className="text-neutral-900">{exercise.name}</p>
                        <p className="text-sm text-neutral-600">
                          {exercise.sets} sets × {exercise.reps} reps • Rest: {exercise.rest}s
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{exercise.load}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="my-workouts" className="mt-6 space-y-4">
          {myWorkouts.map((workout) => (
            <Card key={workout.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-neutral-900">{workout.name}</h3>
                    <Badge variant="outline">{workout.type}</Badge>
                  </div>
                  <p className="text-sm text-neutral-600 mb-3">
                    Last performed: {workout.lastPerformed}
                  </p>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-neutral-600">Total Volume</p>
                      <p className="text-neutral-900">{workout.totalVolume}</p>
                    </div>
                    <div>
                      <p className="text-sm text-neutral-600">Avg Duration</p>
                      <p className="text-neutral-900">{workout.avgDuration}</p>
                    </div>
                    <div>
                      <p className="text-sm text-neutral-600">Exercises</p>
                      <p className="text-neutral-900">{workout.exercises}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-neutral-600">Adherence</span>
                      <span className="text-sm text-neutral-900">{workout.adherence}%</span>
                    </div>
                    <Progress value={workout.adherence} className="h-2" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button>
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Start
                  </Button>
                  <Button variant="outline" size="icon">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
                <div>
                  <p className="text-neutral-900">Upper Body Power</p>
                  <p className="text-sm text-neutral-600">Nov 1, 2025 • 52 min</p>
                </div>
                <div className="text-right">
                  <p className="text-neutral-900">12,450 lbs</p>
                  <p className="text-sm text-green-600">+5% from last session</p>
                </div>
              </div>
              <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
                <div>
                  <p className="text-neutral-900">Zone 2 Endurance</p>
                  <p className="text-sm text-neutral-600">Oct 31, 2025 • 45 min</p>
                </div>
                <div className="text-right">
                  <p className="text-neutral-900">480 cal</p>
                  <p className="text-sm text-green-600">HR avg: 142 bpm</p>
                </div>
              </div>
              <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
                <div>
                  <p className="text-neutral-900">VO2 Max HIIT</p>
                  <p className="text-sm text-neutral-600">Oct 30, 2025 • 28 min</p>
                </div>
                <div className="text-right">
                  <p className="text-neutral-900">620 cal</p>
                  <p className="text-sm text-green-600">Peak HR: 178 bpm</p>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-neutral-900">Volume Progression</h3>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  +18% (30d)
                </Badge>
              </div>
              <div className="h-48 flex items-end justify-between gap-2">
                {[65, 72, 68, 78, 85, 82, 90, 95].map((value, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full bg-gradient-to-t from-blue-600 to-purple-600 rounded-t"
                      style={{ height: `${value}%` }}
                    />
                    <span className="text-xs text-neutral-600">W{idx + 1}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-neutral-900">Personal Records</h3>
                <Button variant="outline" size="sm">View All</Button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div>
                    <p className="text-neutral-900">Deadlift</p>
                    <p className="text-sm text-neutral-600">3 reps</p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-700">405 lbs</p>
                    <p className="text-xs text-neutral-600">Oct 28</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div>
                    <p className="text-neutral-900">Bench Press</p>
                    <p className="text-sm text-neutral-600">5 reps</p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-700">265 lbs</p>
                    <p className="text-xs text-neutral-600">Oct 25</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div>
                    <p className="text-neutral-900">Back Squat</p>
                    <p className="text-sm text-neutral-600">8 reps</p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-700">315 lbs</p>
                    <p className="text-xs text-neutral-600">Oct 22</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
