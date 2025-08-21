import React, { useState } from 'react';
import { Play, ChevronLeft, ChevronRight, CheckCircle, BookOpen } from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
  content: string;
  icon?: React.ReactNode;
}

const tutorialSteps: TutorialStep[] = [
  {
    title: 'Welcome to Report AI!',
    description: 'Your AI-powered data analysis companion',
    content: `Report AI transforms your Google Sheets into intelligent, conversational data insights. 
    
    • Ask questions in plain English
    • Get instant analysis and visualizations
    • Automate data updates and reporting
    • Collaborate with AI on complex data tasks`,
    icon: <BookOpen className="w-8 h-8 text-emerald-500" />
  },
  {
    title: 'Connect Your Spreadsheet',
    description: 'Link your Google Sheets to get started',
    content: `1. Click "Manage" in the Spreadsheets section
    2. Enter your Google Sheet ID or URL
    3. Grant necessary permissions
    4. Select which sheets to analyze
    
    Your data stays in Google Sheets - we just read and analyze it securely.`,
    icon: <CheckCircle className="w-8 h-8 text-blue-500" />
  },
  {
    title: 'Chat with Your Data',
    description: 'Ask questions and get intelligent answers',
    content: `Simply type your questions in natural language:
    
    • "Show me sales by region"
    • "What's the trend in customer satisfaction?"
    • "Create a summary of Q4 performance"
    • "Find anomalies in the data"
    
    AI understands context and provides relevant insights.`,
    icon: <Play className="w-8 h-8 text-purple-500" />
  },
  {
    title: 'Review & Apply Changes',
    description: 'Preview updates before applying them',
    content: `When AI suggests data changes:
    
    1. Review the proposed updates in the preview table
    2. Click "Approve" to apply changes to your sheet
    3. Click "Reject" to cancel and try again
    4. Use "Edit" to modify specific values before applying
    
    You're always in control of your data.`,
    icon: <CheckCircle className="w-8 h-8 text-green-500" />
  },
  {
    title: 'Manage Multiple Reports',
    description: 'Organize your analysis and insights',
    content: `• Create new chat sessions for different analyses
    • Switch between spreadsheets seamlessly
    • Save important insights and reports
    • Export data and visualizations
    
    Ready to get started? Let's dive in!`,
    icon: <BookOpen className="w-8 h-8 text-emerald-500" />
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
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-4xl relative max-h-[90vh] overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
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
                  index === currentStep ? 'bg-emerald-500' : 'bg-gray-300'
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
          <h2 className="text-3xl font-bold text-gray-900 mb-3">{step.title}</h2>
          <p className="text-lg text-gray-600 mb-6">{step.description}</p>
          
          <div className="bg-gray-50 rounded-xl p-6 text-left max-h-64 overflow-y-auto">
            <div className="whitespace-pre-line text-gray-700 leading-relaxed">
              {step.content}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={isFirstStep}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
              isFirstStep
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            Previous
          </button>

          <div className="text-sm text-gray-500">
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
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Skip tutorial
            </button>
          </div>
        )}
        
        {/* Reset tutorial option for testing */}
        <div className="text-center mt-4">
          <button
            onClick={() => {
              localStorage.removeItem('hasSeenTutorial');
              onClose();
            }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Reset tutorial (for testing)
          </button>
        </div>
      </div>
    </div>
  );
};

export default InteractiveTutorial;
