import React, { useState } from 'react';

interface TutorialStep {
  title: string;
  description: string;
  youtubeId: string;
}

const tutorialSteps: TutorialStep[] = [
  {
    title: 'Welcome to Report AI!',
    description: 'This quick tutorial will guide you through the main features.',
    youtubeId: 'dQw4w9WgXcQ', // Placeholder YouTube ID
  },
  {
    title: 'Uploading Your First Sheet',
    description: 'Learn how to easily upload your data to get started.',
    youtubeId: 'dQw4w9WgXcQ', // Placeholder YouTube ID
  },
  {
    title: 'Interacting with Your Data',
    description: 'Discover how to ask questions and get insights from your sheets.',
    youtubeId: 'dQw4w9WgXcQ', // Placeholder YouTube ID
  },
  {
    title: 'Saving and Managing Reports',
    description: 'Understand how to save your progress and manage multiple reports.',
    youtubeId: 'dQw4w9WgXcQ', // Placeholder YouTube ID
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

  const step = tutorialSteps[currentStep];

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-2xl font-bold"
        >
          &times;
        </button>
        <h2 className="text-2xl font-bold mb-4">{step.title}</h2>
        <p className="mb-6 text-gray-700">{step.description}</p>

        <div className="aspect-w-16 aspect-h-9 mb-6">
          <iframe
            className="w-full h-full rounded-md"
            src={`https://www.youtube.com/embed/${step.youtubeId}`}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>

        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {currentStep === tutorialSteps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InteractiveTutorial;
