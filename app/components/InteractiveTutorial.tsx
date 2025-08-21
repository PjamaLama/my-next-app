import React, { useState } from 'react';
import { Play, ChevronLeft, ChevronRight, CheckCircle, BookOpen } from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
  youtubeId: string;
  icon?: React.ReactNode;
}

const tutorialSteps: TutorialStep[] = [
  {
    title: 'Welcome to Sheety AI',
    description: 'Get started with AI-powered data analysis',
    youtubeId: 'dQw4w9WgXcQ', // Placeholder - replace with actual tutorial video
    icon: <BookOpen className="w-8 h-8 text-emerald-400" />
  },
  {
    title: 'Connect Your Spreadsheet',
    description: 'Link your Google Sheets to begin analyzing',
    youtubeId: 'dQw4w9WgXcQ', // Placeholder - replace with actual tutorial video
    icon: <CheckCircle className="w-8 h-8 text-emerald-400" />
  },
  {
    title: 'Chat with Your Data',
    description: 'Ask questions and get intelligent insights',
    youtubeId: 'dQw4w9WgXcQ', // Placeholder - replace with actual tutorial video
    icon: <Play className="w-8 h-8 text-emerald-400" />
  },
];

interface InteractiveTutorialProps {
  onClose: () => void;
}

const InteractiveTutorial: React.FC<InteractiveTutorialProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose(); // Tutorial finished
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const step = tutorialSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900/95 border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-4xl relative max-h-[90vh] overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
        >
          &times;
        </button>

        {/* Progress indicator */}
        <div className="flex justify-center mb-6">
          <div className="flex space-x-2">
            {tutorialSteps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentStep ? 'bg-emerald-400' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            {step.icon}
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">{step.title}</h2>
          <p className="text-lg text-white/70 mb-6">{step.description}</p>
          
          {/* YouTube Video */}
          <div className="aspect-w-16 aspect-h-9 mb-6">
            <iframe
              className="w-full h-96 rounded-xl border border-white/10"
              src={`https://www.youtube.com/embed/${step.youtubeId}?rel=0&modestbranding=1`}
              title={`${step.title} - Tutorial Video`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={isFirstStep}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
              isFirstStep
                ? 'text-gray-500 cursor-not-allowed'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            Previous
          </button>

          <div className="text-sm text-white/50">
            {currentStep + 1} of {tutorialSteps.length}
          </div>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
          >
            {isLastStep ? (
              <>
                Get Started
                <CheckCircle className="w-5 h-5" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>

        {/* Skip option */}
        {!isFirstStep && (
          <div className="text-center mt-6">
            <button
              onClick={handleSkip}
              className="text-sm text-white/50 hover:text-white/80 underline"
            >
              Skip tutorial
            </button>
          </div>
        )}
        

      </div>
    </div>
  );
};

export default InteractiveTutorial;
