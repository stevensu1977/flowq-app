import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Sparkles,
  Keyboard,
  Folder,
  ArrowRight,
  X,
  Check,
} from 'lucide-react';

interface OnboardingFlowProps {
  onComplete: () => void;
}

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  tip?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: <MessageSquare className="w-8 h-8 text-indigo-500" />,
    title: 'Welcome to FlowQ',
    description: 'Your intelligent AI assistant for information management. Start conversations to organize knowledge, create content, and more.',
    tip: 'Press ⌘N to start a new conversation',
  },
  {
    icon: <Folder className="w-8 h-8 text-amber-500" />,
    title: 'Workspace-Based Sessions',
    description: 'Each workspace maintains its own conversation history. Switch between projects seamlessly.',
    tip: 'Use the workspace selector in the bottom left',
  },
  {
    icon: <Sparkles className="w-8 h-8 text-purple-500" />,
    title: 'Smart Features',
    description: 'Enjoy rich markdown rendering, code highlighting, Mermaid diagrams, and LaTeX math formulas.',
    tip: 'Click on code blocks to view in fullscreen',
  },
  {
    icon: <Keyboard className="w-8 h-8 text-green-500" />,
    title: 'Keyboard Shortcuts',
    description: 'Work faster with keyboard shortcuts. Command palette, focus mode, and more at your fingertips.',
    tip: 'Press ⌘/ to see all shortcuts',
  },
];

const STORAGE_KEY = 'flowq-onboarding-completed';

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  // Check if onboarding has been completed
  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setIsVisible(true);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/90 to-purple-900/90 backdrop-blur-sm" />

      {/* Content */}
      <div className="relative w-full max-w-lg mx-4">
        {/* Skip button */}
        <button
          onClick={handleSkip}
          className="absolute -top-12 right-0 flex items-center gap-1 text-white/60 hover:text-white text-sm transition-colors"
        >
          Skip intro
          <X size={16} />
        </button>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 pt-6">
            {ONBOARDING_STEPS.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'w-6 bg-indigo-500'
                    : index < currentStep
                    ? 'bg-indigo-300'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="p-8 text-center">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
              {step.icon}
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {step.title}
            </h2>

            {/* Description */}
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              {step.description}
            </p>

            {/* Tip */}
            {step.tip && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-full text-sm text-gray-600 dark:text-gray-300">
                <Sparkles size={14} className="text-amber-500" />
                {step.tip}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-8 pb-8 flex items-center justify-between">
            {/* Step counter */}
            <span className="text-sm text-gray-400 dark:text-gray-500">
              {currentStep + 1} of {ONBOARDING_STEPS.length}
            </span>

            {/* Next/Complete button */}
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-xl transition-colors"
            >
              {isLastStep ? (
                <>
                  Get Started
                  <Check size={18} />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feature preview below card */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {['Code Blocks', 'Mermaid', 'LaTeX'].map((feature, i) => (
            <div
              key={feature}
              className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center"
            >
              <div className="text-white/90 text-sm font-medium">{feature}</div>
              <div className="text-white/50 text-xs mt-1">Built-in</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;

// Utility to reset onboarding (for testing)
export const resetOnboarding = () => {
  localStorage.removeItem(STORAGE_KEY);
};
