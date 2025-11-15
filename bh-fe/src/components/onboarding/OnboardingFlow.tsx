import { useState } from 'react';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { X, Activity, FileText, Dna, User } from 'lucide-react';
import WearableConnection from './WearableConnection';
import LabUpload from './LabUpload';
import GeneticUpload from './GeneticUpload';
import HealthQuestionnaire from './HealthQuestionnaire';

interface OnboardingFlowProps {
  onComplete: () => Promise<void>;
  onDismiss?: () => void;
}

const steps = [
  { id: 1, title: 'Health Profile', icon: User },
  { id: 2, title: 'Connect Wearables', icon: Activity },
  { id: 3, title: 'Upload Labs', icon: FileText },
  { id: 4, title: 'Genetic Data', icon: Dna },
];

export default function OnboardingFlow({ onComplete, onDismiss }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isCompleting, setIsCompleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const progress = (currentStep / steps.length) * 100;

  const finishFlow = async () => {
    setIsCompleting(true);
    setErrorMessage(null);
    try {
      await onComplete();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to complete onboarding right now.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
      return;
    }
    void finishFlow();
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      void finishFlow();
    }
  };

  const handleSkip = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      void finishFlow();
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <HealthQuestionnaire />;
      case 2:
        return <WearableConnection />;
      case 3:
        return <LabUpload />;
      case 4:
        return <GeneticUpload />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="neo-card p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="mb-2">Welcome to BioHax</h2>
              <p className="text-steel">Let's set up your personalized performance profile</p>
            </div>
            <button 
              onClick={handleDismiss}
              className="w-11 h-11 rounded-xl bg-pearl hover:bg-cloud transition-colors flex items-center justify-center"
              disabled={isCompleting}
            >
              <X className="w-5 h-5 text-steel" />
            </button>
          </div>
          
          {/* Progress */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Step {currentStep} of {steps.length}</span>
              <span className="tag text-electric">{Math.round(progress)}% COMPLETE</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>
        </div>

        {/* Step Indicators */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            
            return (
              <div
                key={step.id}
                className={`p-4 rounded-xl transition-all ${
                  isActive
                    ? 'neo-card-electric'
                    : isCompleted
                    ? 'neo-card-bio'
                    : 'neo-card'
                }`}
              >
                <Icon className={`w-6 h-6 mx-auto mb-2 ${
                  isActive
                    ? 'text-electric'
                    : isCompleted
                    ? 'text-bio'
                    : 'text-steel'
                }`} />
                <div className={`text-xs text-center font-semibold ${
                  isActive
                    ? 'text-electric'
                    : isCompleted
                    ? 'text-bio'
                    : 'text-steel'
                }`}>
                  {step.title}
                </div>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="neo-card p-8 mb-6 max-h-[50vh] overflow-y-auto">
          {renderStepContent()}
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-pulse/30 bg-pulse/10 px-4 py-3 text-sm text-pulse mb-4">
            {errorMessage}
          </div>
        )}

        {/* Footer Actions */}
        <div className="neo-card p-6 flex items-center justify-between">
          <Button variant="ghost" onClick={handleSkip} className="text-steel" disabled={isCompleting}>
            Skip for now
          </Button>
          <div className="flex items-center gap-3">
            {currentStep > 1 && (
              <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)} disabled={isCompleting}>
                Back
              </Button>
            )}
            <Button onClick={handleNext} disabled={isCompleting}>
              {isCompleting ? 'Verifying…' : currentStep === steps.length ? 'Complete Setup' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
