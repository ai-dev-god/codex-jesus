import { Card } from '../ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';

const biomarkerData = [
  { date: 'Jan 1', hrv: 58, glucose: 95, inflammation: 1.2, vo2max: 42 },
  { date: 'Jan 8', hrv: 62, glucose: 92, inflammation: 1.0, vo2max: 43 },
  { date: 'Jan 15', hrv: 65, glucose: 88, inflammation: 0.9, vo2max: 44 },
  { date: 'Jan 22', hrv: 63, glucose: 90, inflammation: 1.1, vo2max: 44 },
  { date: 'Jan 29', hrv: 68, glucose: 87, inflammation: 0.8, vo2max: 45 },
  { date: 'Feb 5', hrv: 70, glucose: 85, inflammation: 0.7, vo2max: 46 },
];

const recoveryData = [
  { date: 'Mon', recovery: 78, sleep: 7.2, strain: 12.5 },
  { date: 'Tue', recovery: 82, sleep: 7.8, strain: 10.2 },
  { date: 'Wed', recovery: 85, sleep: 8.1, strain: 9.5 },
  { date: 'Thu', recovery: 80, sleep: 7.5, strain: 11.8 },
  { date: 'Fri', recovery: 87, sleep: 8.3, strain: 8.9 },
  { date: 'Sat', recovery: 92, sleep: 8.5, strain: 7.2 },
  { date: 'Sun', recovery: 89, sleep: 8.0, strain: 8.5 },
];

const performanceData = [
  { date: 'Week 1', strength: 72, endurance: 68, power: 75 },
  { date: 'Week 2', strength: 75, endurance: 70, power: 77 },
  { date: 'Week 3', strength: 78, endurance: 73, power: 80 },
  { date: 'Week 4', strength: 80, endurance: 75, power: 82 },
  { date: 'Week 5', strength: 83, endurance: 78, power: 85 },
  { date: 'Week 6', strength: 85, endurance: 80, power: 87 },
];

interface BiomarkerTrendsProps {
  type?: 'biomarkers' | 'recovery' | 'performance';
}

export default function BiomarkerTrends({ type = 'biomarkers' }: BiomarkerTrendsProps) {
  const renderChart = () => {
    if (type === 'recovery') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={recoveryData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="recovery" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.6} name="Recovery %" />
            <Area type="monotone" dataKey="sleep" stroke="#8b5cf6" fill="#c4b5fd" fillOpacity={0.6} name="Sleep (hrs)" />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (type === 'performance') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={performanceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="strength" stroke="#ef4444" strokeWidth={2} name="Strength" />
            <Line type="monotone" dataKey="endurance" stroke="#3b82f6" strokeWidth={2} name="Endurance" />
            <Line type="monotone" dataKey="power" stroke="#f59e0b" strokeWidth={2} name="Power" />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={biomarkerData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" stroke="#9ca3af" />
          <YAxis stroke="#9ca3af" />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="hrv" stroke="#10b981" strokeWidth={2} name="HRV (ms)" />
          <Line type="monotone" dataKey="glucose" stroke="#3b82f6" strokeWidth={2} name="Glucose (mg/dL)" />
          <Line type="monotone" dataKey="vo2max" stroke="#8b5cf6" strokeWidth={2} name="VO2 Max" />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const getTitle = () => {
    if (type === 'recovery') return 'Recovery & Sleep Trends';
    if (type === 'performance') return 'Performance Metrics';
    return 'Key Biomarker Trends';
  };

  return (
    <Card className="p-6">
      <h3 className="text-neutral-900 mb-6">{getTitle()}</h3>
      {renderChart()}
    </Card>
  );
}
