import { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';

export default function HealthQuestionnaire() {
  const [formData, setFormData] = useState({
    age: '',
    sex: '',
    height: '',
    weight: '',
    activityLevel: '',
    sleepHours: '',
    currentConditions: '',
    medications: '',
  });

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-2">Tell us about yourself</h3>
        <p className="text-steel">This helps us personalize your experience and recommendations</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Age */}
        <div className="space-y-2">
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            type="number"
            placeholder="30"
            value={formData.age}
            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
          />
        </div>

        {/* Sex */}
        <div className="space-y-2">
          <Label htmlFor="sex">Biological Sex</Label>
          <Select value={formData.sex} onValueChange={(value) => setFormData({ ...formData, sex: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Height */}
        <div className="space-y-2">
          <Label htmlFor="height">Height (cm)</Label>
          <Input
            id="height"
            type="number"
            placeholder="175"
            value={formData.height}
            onChange={(e) => setFormData({ ...formData, height: e.target.value })}
          />
        </div>

        {/* Weight */}
        <div className="space-y-2">
          <Label htmlFor="weight">Weight (kg)</Label>
          <Input
            id="weight"
            type="number"
            placeholder="70"
            value={formData.weight}
            onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
          />
        </div>

        {/* Activity Level */}
        <div className="space-y-2 col-span-2">
          <Label htmlFor="activityLevel">Activity Level</Label>
          <Select value={formData.activityLevel} onValueChange={(value) => setFormData({ ...formData, activityLevel: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select your typical activity..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sedentary">Sedentary (little or no exercise)</SelectItem>
              <SelectItem value="light">Lightly active (exercise 1-3 days/week)</SelectItem>
              <SelectItem value="moderate">Moderately active (exercise 3-5 days/week)</SelectItem>
              <SelectItem value="very">Very active (exercise 6-7 days/week)</SelectItem>
              <SelectItem value="extra">Extremely active (intense exercise daily)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sleep Hours */}
        <div className="space-y-2 col-span-2">
          <Label htmlFor="sleepHours">Average Sleep (hours/night)</Label>
          <Input
            id="sleepHours"
            type="number"
            step="0.5"
            placeholder="7.5"
            value={formData.sleepHours}
            onChange={(e) => setFormData({ ...formData, sleepHours: e.target.value })}
          />
        </div>

        {/* Current Conditions */}
        <div className="space-y-2 col-span-2">
          <Label htmlFor="currentConditions">Current Health Conditions (optional)</Label>
          <Textarea
            id="currentConditions"
            placeholder="e.g., Type 2 diabetes, hypertension, thyroid issues..."
            value={formData.currentConditions}
            onChange={(e) => setFormData({ ...formData, currentConditions: e.target.value })}
            rows={3}
          />
          <p className="text-xs text-steel">This information is encrypted and only used to personalize your AI recommendations</p>
        </div>

        {/* Medications */}
        <div className="space-y-2 col-span-2">
          <Label htmlFor="medications">Current Medications/Supplements (optional)</Label>
          <Textarea
            id="medications"
            placeholder="e.g., Metformin 500mg, Vitamin D3 5000IU, Omega-3 2g..."
            value={formData.medications}
            onChange={(e) => setFormData({ ...formData, medications: e.target.value })}
            rows={3}
          />
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="p-4 rounded-xl bg-electric/5 border-2 border-electric/20">
        <p className="text-sm text-steel leading-relaxed">
          <span className="font-bold text-electric">Privacy Protected:</span> All health data is encrypted at rest and in transit. 
          We never sell your data and comply with HIPAA/GDPR regulations.
        </p>
      </div>
    </div>
  );
}
