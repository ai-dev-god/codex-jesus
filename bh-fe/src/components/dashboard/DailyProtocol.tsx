import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Check, Clock, Sun, Sunrise, Sunset, Moon } from 'lucide-react';
import { useState } from 'react';

const protocols = [
  {
    id: '1',
    time: '7:00 AM',
    period: 'Morning',
    icon: Sunrise,
    items: [
      { id: '1-1', name: 'NAD+ Precursor', dosage: '500mg', completed: true },
      { id: '1-2', name: 'Vitamin D3 + K2', dosage: '5000 IU + 200mcg', completed: true },
      { id: '1-3', name: '20min Zone 2 Cardio', dosage: '', completed: false },
    ],
    color: 'coral',
  },
  {
    id: '2',
    time: '12:00 PM',
    period: 'Midday',
    icon: Sun,
    items: [
      { id: '2-1', name: 'Omega-3 EPA/DHA', dosage: '2g', completed: true },
      { id: '2-2', name: 'Magnesium', dosage: '400mg', completed: false },
    ],
    color: 'sage',
  },
  {
    id: '3',
    time: '6:00 PM',
    period: 'Evening',
    icon: Sunset,
    items: [
      { id: '3-1', name: 'Strength Training', dosage: '45min', completed: false },
    ],
    color: 'sky',
  },
  {
    id: '4',
    time: '10:00 PM',
    period: 'Night',
    icon: Moon,
    items: [
      { id: '4-1', name: 'Magnesium Glycinate', dosage: '400mg', completed: false },
      { id: '4-2', name: 'L-Theanine', dosage: '200mg', completed: false },
    ],
    color: 'mint',
  },
];

export default function DailyProtocol() {
  const [completedItems, setCompletedItems] = useState(new Set(['1-1', '1-2', '2-1']));

  const toggleItem = (itemId: string) => {
    const newCompleted = new Set(completedItems);
    if (newCompleted.has(itemId)) {
      newCompleted.delete(itemId);
    } else {
      newCompleted.add(itemId);
    }
    setCompletedItems(newCompleted);
  };

  const totalItems = protocols.reduce((acc, p) => acc + p.items.length, 0);
  const completedCount = completedItems.size;

  return (
    <Card className="p-6 h-full flex flex-col">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl vitality-gradient flex items-center justify-center shadow-md">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-forest">Today's Protocol</h2>
            <p className="text-sm text-stone">November 1, 2025</p>
          </div>
        </div>
        
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone">Daily Progress</span>
            <span className="font-semibold text-forest">{completedCount}/{totalItems}</span>
          </div>
          <div className="h-3 bg-cloud rounded-full overflow-hidden">
            <div
              className="h-full wellness-gradient rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${(completedCount / totalItems) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Protocols List */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {protocols.map((protocol) => {
          const Icon = protocol.icon;
          const allCompleted = protocol.items.every(item => completedItems.has(item.id));
          
          const colorClasses = {
            coral: { bg: 'bg-coral/10', text: 'text-coral-dark' },
            sage: { bg: 'bg-sage/10', text: 'text-sage-dark' },
            sky: { bg: 'bg-sky/10', text: 'text-sky-dark' },
            mint: { bg: 'bg-mint/10', text: 'text-mint-dark' },
          };
          
          const colors = colorClasses[protocol.color as keyof typeof colorClasses];
          
          return (
            <div key={protocol.id} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-forest">{protocol.period}</p>
                  <p className="text-xs text-stone">{protocol.time}</p>
                </div>
                {allCompleted && (
                  <Badge variant="success" className="text-xs">
                    <Check className="w-3 h-3 mr-1" />
                    Done
                  </Badge>
                )}
              </div>

              <div className="ml-13 space-y-2">
                {protocol.items.map((item) => {
                  const isCompleted = completedItems.has(item.id);
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        isCompleted
                          ? 'bg-mint/5 border-mint/25'
                          : 'bg-white border-[rgba(123,165,145,0.1)] hover:border-sage/25 hover:bg-cloud'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'mint-gradient border-mint-dark'
                          : 'border-stone'
                      }`}>
                        {isCompleted && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-sm font-medium ${isCompleted ? 'text-stone line-through' : 'text-forest'}`}>
                          {item.name}
                        </p>
                        {item.dosage && (
                          <p className="text-xs text-stone">{item.dosage}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action */}
      <div className="mt-6 pt-6 border-t-2 border-[rgba(123,165,145,0.1)]">
        <Button className="w-full">
          <Check className="w-4 h-4 mr-2" />
          Mark All Complete
        </Button>
      </div>
    </Card>
  );
}
