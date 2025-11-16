import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Clock,
  Copy,
  Dumbbell,
  Flame,
  HeartPulse,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCcw,
  Target,
  TrendingUp,
  Trophy
} from 'lucide-react';

import { useAuth } from '../../lib/auth/AuthContext';
import { getGymOverview, syncGymWorkouts, type GymOverview as GymOverviewResponse } from '../../lib/api/gym';
import { Card } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Checkbox } from '../ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Skeleton } from '../ui/skeleton';
import { Progress } from '../ui/progress';
import { cn } from '../ui/utils';

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

export default function GymWorkoutCreator() {
  const { ensureAccessToken } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkoutName, setNewWorkoutName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [overview, setOverview] = useState<GymOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const token = await ensureAccessToken();
      const data = await getGymOverview(token);
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load WHOOP workouts.');
    } finally {
      setLoading(false);
    }
  }, [ensureAccessToken]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const handleSync = useCallback(async () => {
    if (!overview?.linked || syncing) {
      return;
    }
    setSyncing(true);
    try {
      const token = await ensureAccessToken();
      await syncGymWorkouts(token);
      await fetchOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger WHOOP sync.');
    } finally {
      setSyncing(false);
    }
  }, [ensureAccessToken, fetchOverview, overview?.linked, syncing]);

  const metrics = useMemo(() => {
    const defaults = overview?.metrics;
    return [
      {
        label: 'Sessions (7d)',
        value: defaults ? defaults.totalWorkouts7d.toString() : '—',
        helper: 'WHOOP workouts synced',
        icon: Activity
      },
      {
        label: 'Avg Duration',
        value: defaults?.avgDurationMinutes7d ? `${defaults.avgDurationMinutes7d} min` : '—',
        helper: 'Last 7 days',
        icon: Clock
      },
      {
        label: 'Avg Strain',
        value: defaults?.avgStrain7d ? defaults.avgStrain7d.toFixed(1) : '—',
        helper: 'WHOOP strain score',
        icon: HeartPulse
      },
      {
        label: 'Calories Burned',
        value: defaults?.totalCalories7d ? `${defaults.totalCalories7d.toLocaleString()} kcal` : '—',
        helper: 'Cumulative (7d)',
        icon: Flame
      }
    ];
  }, [overview]);

  const recentWorkouts = overview?.workouts ?? [];
  const sportDistribution = overview?.sportDistribution ?? [];
  const weeklyTrend = overview?.weeklyStrain ?? [];
  const canSync = overview?.linked ?? false;
  const lastSyncLabel = overview?.lastSyncAt ? new Date(overview.lastSyncAt).toLocaleString() : 'Not synced yet';
  const syncStatus = overview?.syncStatus ?? 'NOT_LINKED';
  const statusLabel: Record<typeof syncStatus, string> = {
    ACTIVE: 'Active',
    PENDING: 'Pending',
    ERROR: 'Error',
    NOT_LINKED: 'Not linked'
  };
  const statusClasses: Record<typeof syncStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800 border-green-200',
    PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
    ERROR: 'bg-red-100 text-red-800 border-red-200',
    NOT_LINKED: 'bg-neutral-100 text-neutral-700 border-neutral-200'
  };

  const renderWeeklyTrend = () => {
    if (!weeklyTrend.length) {
      return <p className="text-sm text-neutral-500">Not enough workout history yet.</p>;
    }

    const maxValue = Math.max(...weeklyTrend.map((point) => point.avgStrain ?? 0), 1);

    return (
      <div className="flex items-end gap-3">
        {weeklyTrend.map((point) => {
          const height = ((point.avgStrain ?? 0) / maxValue) * 100;
          const date = new Date(point.weekStart);
          const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return (
            <div key={point.weekStart} className="flex-1 flex flex-col items-center gap-2">
              <div
                className="w-full bg-gradient-to-t from-blue-600 to-purple-600 rounded-t"
                style={{ height: `${Math.max(height, 5)}%` }}
              />
              <span className="text-xs text-neutral-500">{label}</span>
              <span className="text-xs text-neutral-600">{point.avgStrain ? point.avgStrain.toFixed(1) : '—'}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSportDistribution = () => {
    if (!sportDistribution.length) {
      return <p className="text-sm text-neutral-500">No recent WHOOP workouts detected.</p>;
    }

    const maxCount = Math.max(...sportDistribution.map((entry) => entry.count), 1);

    return (
      <div className="space-y-3">
        {sportDistribution.map((entry) => (
          <div key={entry.sport}>
            <div className="flex items-center justify-between text-sm text-neutral-600 mb-1">
              <span className="text-neutral-900">{entry.sport}</span>
              <span>{entry.count}</span>
            </div>
            <Progress value={(entry.count / maxCount) * 100} className="h-2" />
          </div>
        ))}
      </div>
    );
  };

  const renderRecentWorkouts = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`workout-skeleton-${index}`} className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      );
    }

    if (!recentWorkouts.length) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center text-neutral-500">
          <Dumbbell className="w-8 h-8 mb-3 text-neutral-400" />
          <p className="text-sm">
            No WHOOP workouts have been synced yet. Once your device syncs, workouts will appear here automatically.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {recentWorkouts.map((workout) => (
          <div key={workout.id} className="flex flex-col gap-2 border-b border-neutral-200 pb-4 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-neutral-900 font-medium">{workout.sport}</p>
                <p className="text-sm text-neutral-500">
                  {new Date(workout.startTime).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <Badge variant="outline">{workout.category}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-neutral-600">
              <div>
                <p className="text-neutral-500">Duration</p>
                <p className="text-neutral-900">{workout.durationMinutes ? `${workout.durationMinutes.toFixed(1)} min` : '—'}</p>
              </div>
              <div>
                <p className="text-neutral-500">Strain</p>
                <p className="text-neutral-900">{workout.strain ? workout.strain.toFixed(1) : '—'}</p>
              </div>
              <div>
                <p className="text-neutral-500">Avg HR</p>
                <p className="text-neutral-900">{workout.avgHeartRate ? `${workout.avgHeartRate} bpm` : '—'}</p>
              </div>
              <div>
                <p className="text-neutral-500">Calories</p>
                <p className="text-neutral-900">{workout.calories ? `${workout.calories} kcal` : '—'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen mesh-gradient pt-28 pb-20 px-6" data-testid="view-gym">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 text-steel text-sm font-semibold">
            <Dumbbell className="w-4 h-4" />
            <span>Training Control</span>
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold text-ink">Workout & Training Protocols</h1>
            <p className="text-lg text-steel max-w-3xl mx-auto">
              Evidence-backed programs, WHOOP insights, and AI templates unified in one clean workspace.
            </p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-start">
          <div className="space-y-8">
            <div className="neo-card p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 text-left">
                <div>
                  <p className="text-sm text-neutral-500">WHOOP sync status</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-neutral-600">
                    <Badge variant="outline" className={cn('capitalize', statusClasses[syncStatus])}>
                      {statusLabel[syncStatus]}
                    </Badge>
                    <span>Last sync: {lastSyncLabel}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    disabled={!canSync || syncing}
                    onClick={() => void handleSync()}
                    className="min-w-[150px]"
                  >
                    {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                    Sync WHOOP
                  </Button>
                  <Dialog open={isCreating} onOpenChange={setIsCreating}>
                    <DialogTrigger asChild>
                      <Button className="bg-gradient-to-r from-blue-600 to-purple-600 min-w-[150px]">
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          <div className="border border-neutral-200 rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto bg-white">
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
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Unable to sync workouts</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {!loading && overview && !overview.linked && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                  <AlertTitle>Connect your WHOOP</AlertTitle>
                  <AlertDescription>
                    Link your WHOOP in the Integrations tab to start importing workouts automatically.
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-sm text-neutral-500">
                WHOOP workouts sync automatically every hour. Trigger a manual sync anytime to refresh metrics instantly.
              </p>
            </div>

            <div className="neo-card p-6">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="flex w-full flex-wrap justify-center gap-2 bg-white/70 text-sm font-semibold">
                  <TabsTrigger value="overview" className="min-w-[150px]">WHOOP Overview</TabsTrigger>
                  <TabsTrigger value="templates" className="min-w-[150px]">Protocol Templates</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {metrics.map((metric) => (
                      <Card key={metric.label} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm text-neutral-600">{metric.label}</p>
                          <metric.icon className="w-4 h-4 text-neutral-400" />
                        </div>
                        <p className="text-neutral-900 text-xl font-semibold">{metric.value}</p>
                        <p className="text-xs text-neutral-500">{metric.helper}</p>
                      </Card>
                    ))}
                  </div>

                  <Card className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                      <h3 className="text-neutral-900">Recent Workouts</h3>
                      <Badge variant="outline">{recentWorkouts.length} tracked</Badge>
                    </div>
                    {renderRecentWorkouts()}
                  </Card>
                </TabsContent>

                <TabsContent value="templates" className="mt-6 space-y-4">
                  {workoutTemplates.map((template) => (
                    <Card key={template.id} className="p-6 hover:shadow-lg transition-shadow">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-3 mb-2">
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
                          <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-600">
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

                      <div className="border-t border-neutral-200 pt-4 space-y-2">
                        {template.exercises.map((exercise, idx) => (
                          <div
                            key={idx}
                            className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-50 rounded-lg"
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
              </Tabs>
            </div>
          </div>

          <div className="space-y-8">
            <div className="neo-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h3 className="text-neutral-900">Weekly Strain</h3>
                <TrendingUp className="w-4 h-4 text-neutral-400" />
              </div>
              {renderWeeklyTrend()}
            </div>
            <div className="neo-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h3 className="text-neutral-900">Sport Distribution</h3>
                <Activity className="w-4 h-4 text-neutral-400" />
              </div>
              {renderSportDistribution()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
