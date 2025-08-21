import React, { useState, useEffect } from 'react';
import { Play, ChevronLeft, ChevronRight, CheckCircle, BookOpen, Download, Settings, FileText } from 'lucide-react';
import { useTutorial } from '../providers/TutorialProvider';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  order: number;
  icon?: React.ReactNode;
  content?: React.ReactNode;
}

// Default tutorial steps (fallback)
const defaultTutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Sheety AI',
    description: 'Get started with AI-powered data analysis',
    youtubeId: 'dQw4w9WgXcQ',
    order: 0,
    icon: <BookOpen className="w-8 h-8 text-emerald-400" />
  },
  {
    id: 'setup',
    title: 'Setup & Templates',
    description: 'Download templates and configure your service account',
    youtubeId: 'dQw4w9WgXcQ',
    order: 1,
    icon: <Settings className="w-8 h-8 text-emerald-400" />,
    content: (
      <div className="text-left space-y-6">
        {/* Template Download Section */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-400" />
            Download Template
          </h3>
          <p className="text-white/80 mb-4">
            Start with our structured template that follows the correct format for AI analysis.
          </p>
          <a
            href="/templates/structured-sheet-template.csv"
            download
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Download CSV Template
          </a>
          <div className="mt-3 text-sm text-white/60">
            After downloading, open in Google Sheets and save as a Google Sheet for full functionality.
          </div>
        </div>

        {/* Service Account Setup */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            Service Account Setup
          </h3>
          <div className="space-y-3 text-white/80">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
              <div>
                <p className="font-medium">Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google Cloud Console</a></p>
                <p className="text-sm text-white/60">Create a new project or select existing one</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
              <div>
                <p className="font-medium">Enable Google Sheets API</p>
                <p className="text-sm text-white/60">Search for "Google Sheets API" and enable it</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
              <div>
                <p className="font-medium">Create Service Account</p>
                <p className="text-sm text-white/60">Go to IAM & Admin → Service Accounts → Create</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</div>
              <div>
                <p className="font-medium">Download JSON Key</p>
                <p className="text-sm text-white/60">Create and download the private key file</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">5</div>
              <div>
                <p className="font-medium">Share Your Sheet</p>
                <p className="text-sm text-white/60">Share your Google Sheet with the service account email</p>
              </div>
            </div>
          </div>
        </div>

        {/* Template Structure */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            Template Structure Rules
          </h3>
          <div className="space-y-4 text-white/80">
            <div>
              <p className="font-medium mb-2">📋 Header Row (Row 1)</p>
              <p className="text-sm text-white/60">First row must contain column headers. Use clear, descriptive names.</p>
            </div>
            <div>
              <p className="font-medium mb-2">🔢 Data Rows (Row 2+)</p>
              <p className="text-sm text-white/60">All data starts from row 2. Keep headers in row 1 only.</p>
            </div>
            <div>
              <p className="font-medium mb-2">📊 Consistent Format</p>
              <p className="text-sm text-white/60">Each column should contain the same type of data throughout.</p>
            </div>
            <div>
              <p className="font-medium mb-2">🚫 No Empty Header Rows</p>
              <p className="text-sm text-white/60">Avoid blank rows between headers and data.</p>
            </div>
            <div className="bg-emerald-600/20 border border-emerald-600/30 rounded-lg p-3">
              <p className="text-sm font-medium text-emerald-300">💡 Pro Tip</p>
              <p className="text-xs text-emerald-200">Use our template as a starting point and modify the columns to match your data needs. The AI will automatically detect your structure!</p>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'connect',
    title: 'Connect Your Spreadsheet',
    description: 'Link your Google Sheets to begin analyzing',
    youtubeId: 'dQw4w9WgXcQ',
    order: 2,
    icon: <CheckCircle className="w-8 h-8 text-emerald-400" />
  },
  {
    id: 'chat',
    title: 'Chat with Your Data',
    description: 'Ask questions and get intelligent insights',
    youtubeId: 'dQw4w9WgXcQ',
    order: 3,
    icon: <Play className="w-8 h-8 text-emerald-400" />
  },
];

interface InteractiveTutorialProps {
  // Remove onClose prop since we're using the hook now
}

const InteractiveTutorial: React.FC<InteractiveTutorialProps> = () => {
  const { hideTutorial, isTutorialVisible } = useTutorial();
  const [currentStep, setCurrentStep] = useState(0);
  const [tutorialSteps, setTutorialSteps] = useState<TutorialStep[]>(defaultTutorialSteps);
  const [loading, setLoading] = useState(true);

  // Fetch tutorial videos from API
  useEffect(() => {
    const fetchTutorialVideos = async () => {
      try {
        const response = await fetch('/api/tutorial-videos');
        if (response.ok) {
          const data = await response.json();
          const apiSteps = data.videos || [];
          
          const mergedSteps = defaultTutorialSteps.map(defaultStep => {
            const apiStep = apiSteps.find((s: TutorialStep) => s.id === defaultStep.id);
            return { ...defaultStep, ...apiStep };
          });

          setTutorialSteps(mergedSteps);
        }
      } catch (error) {
        console.error('Failed to fetch tutorial videos:', error);
        // Use default steps on error
        setTutorialSteps(defaultTutorialSteps);
      } finally {
        setLoading(false);
      }
    };

    fetchTutorialVideos();
  }, []);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      hideTutorial(); // Tutorial finished
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    hideTutorial();
  };

  const step = tutorialSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tutorialSteps.length - 1;

  // Don't render if tutorial is not visible
  if (!isTutorialVisible) {
    console.log('🔍 [InteractiveTutorial] Not visible, returning null');
    return null;
  }

  console.log('🔍 [InteractiveTutorial] Rendering tutorial with step:', currentStep);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900/95 border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-4xl relative">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
            <div className="text-white text-lg">Loading tutorial...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {/* Debug indicator */}
      <div className="fixed top-4 left-4 bg-red-500 text-white px-2 py-1 rounded text-xs z-[9999]">
        InteractiveTutorial Rendered - Step {currentStep + 1}
      </div>
      
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
          
          {/* Custom Content or YouTube Video */}
          {step.content ? (
            <div className="max-w-4xl mx-auto">
              {step.content}
            </div>
          ) : (
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
          )}
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
