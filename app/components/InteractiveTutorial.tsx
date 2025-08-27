import React, { useState, useEffect } from 'react';
import { Play, ChevronLeft, ChevronRight, CheckCircle, BookOpen, Download, Settings, FileText, Shield } from 'lucide-react';
import { useTutorial } from '../providers/TutorialProvider';
import { useServiceAccount } from '../providers/ServiceAccountProvider';
import ServiceAccountInfo from './ServiceAccountInfo';
import WhatsAppLinkForm from './WhatsAppLinkForm';

const ServiceAccountInfoWrapper = () => {
  const { serviceAccountEmail, isLoading } = useServiceAccount();
  const [timeoutReached, setTimeoutReached] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeoutReached(true);
    }, 3000); // 3 second timeout for service account loading
    
    return () => clearTimeout(timer);
  }, []);
  
  if (isLoading && !timeoutReached) {
    return <div className="text-white/70">Loading service account email...</div>;
  }
  
  if (timeoutReached || !serviceAccountEmail) {
    return (
      <div className="text-red-400 text-sm">
        Service account not configured. Please check your setup.
      </div>
    );
  }
  
  return <ServiceAccountInfo serviceAccountEmail={serviceAccountEmail} />;
};

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
    description: 'Watch this short video to get started.',
    youtubeId: 'QEk5vY3eOE4', // First tutorial video
    order: 0,
    icon: <Play className="w-8 h-8 text-emerald-400" />,
  },
  {
    id: 'security',
    title: 'Data Security & Privacy',
    description: 'Learn how we protect your data and maintain your privacy.',
    youtubeId: 'nJadmf1MuRs', // YouTube video ID for the generic video section
    order: 1,
    icon: <Shield className="w-8 h-8 text-emerald-400" />,
    content: (
      <div className="text-left space-y-6">
        {/* Video Section - Top and Side by Side */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-400" />
            Watch Security Overview
          </h3>
          <div className="space-y-4">
            {/* Content Side */}
            <div className="w-full space-y-4">
              <div className="bg-emerald-600/20 border border-emerald-600/30 rounded-lg p-4">
                <p className="text-sm font-medium text-emerald-300 mb-2">🔒 Zero Data Storage</p>
                <p className="text-xs text-emerald-200">We never store your spreadsheet data on our servers. Your data stays in your Google Sheets account only.</p>
              </div>
              <div className="bg-blue-600/20 border border-blue-600/30 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-300 mb-2">🔐 Secure Access</p>
                <p className="text-xs text-blue-200">We use Google's secure OAuth and service account authentication. No passwords are ever shared.</p>
              </div>
              <div className="bg-purple-600/20 border border-purple-600/30 rounded-lg p-4">
                <p className="text-sm font-medium text-purple-300 mb-2">📊 Temporary Processing</p>
                <p className="text-xs text-purple-200">Data is only processed in memory during your session and is immediately discarded when you close the app.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Privacy Features - Full Width Below */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            Privacy Features
          </h3>
          <div className="space-y-3 text-white/80">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
              <div>
                <p className="font-medium">No Data Logging</p>
                <p className="text-sm text-white/60">We don't log or track your spreadsheet contents, column names, or data values.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
              <div>
                <p className="font-medium">Session-Based Access</p>
                <p className="text-sm text-white/60">Access to your data is temporary and only exists while you're actively using the application.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
              <div>
                <p className="font-medium">Google's Security Standards</p>
                <p className="text-sm text-white/60">Your data remains protected by Google's enterprise-grade security infrastructure.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'setup',
    title: 'Service Account Setup',
    description: 'Configure your service account to connect to your Google Sheets.',
    youtubeId: 'Lcf1KNNq_oc', // Second tutorial video
    order: 2,
    icon: <Settings className="w-8 h-8 text-emerald-400" />,
    content: (
      <div className="text-left space-y-6">
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
                <p className="font-medium">Copy the service account email below</p>
                <ServiceAccountInfoWrapper />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
              <div>
                <p className="font-medium">Share your Google Sheet with this email as "Editor"</p>
                <p className="text-sm text-white/60">This allows the AI to securely access and analyze your data.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'whatsapp',
    title: 'Link WhatsApp',
    description: 'Connect your WhatsApp to interact with your sheets on the go.',
    youtubeId: '',
    order: 3,
    icon: <Download className="w-8 h-8 text-emerald-400" />,
    content: (
      <div className="text-left space-y-6">
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-400" />
            Link Your WhatsApp
          </h3>
          <WhatsAppLinkForm />
        </div>
      </div>
    )
  },
  {
    id: 'structure',
    title: 'Template & Structure Rules',
    description: 'Download our template and follow these rules for the best results.',
    youtubeId: '',
    order: 4,
    icon: <FileText className="w-8 h-8 text-emerald-400" />,
    content: (
      <div className="text-left space-y-6">
        {/* Template Download Section */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-400" />
            Get Template
          </h3>
          <p className="text-white/80 mb-4">
            Use our structured template that follows the correct format for AI analysis.
          </p>
          <a
            href="https://docs.google.com/spreadsheets/d/1PKJQFrlahs0Q4p3OOC8m6qNt8FKEDWn-a6ryGHwNeTs/edit?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Open Template
          </a>
          <div className="mt-3 text-sm text-white/60">
            Click to open the template in Google Sheets, then make a copy to use for your data.
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
              <p className="font-medium mb-2">📊 Optional Total Row (Row 2)</p>
              <p className="text-sm text-white/60">You can add a second row above headers for column totals or summaries. This row is optional and won't interfere with data analysis.</p>
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
    title: 'All Set!',
    description: 'You\'re ready to start analyzing your data with AI',
    youtubeId: '',
    order: 5,
    icon: <CheckCircle className="w-8 h-8 text-emerald-400" />,
    content: (
      <div className="text-center space-y-6">
        <div className="bg-emerald-600/20 border border-emerald-600/30 rounded-xl p-8">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-2xl font-bold text-emerald-300 mb-3">You\'re All Set!</h3>
          <p className="text-lg text-emerald-200 mb-6">
            Your service account is configured and you\'re ready to start analyzing your data with AI.
          </p>
          <div className="space-y-3 text-emerald-100">
            <p>✅ Service account configured</p>
            <p>✅ Template downloaded</p>
            <p>✅ Structure rules understood</p>
            <p>✅ Ready to connect your spreadsheet</p>
          </div>
        </div>
        <div className="text-white/70">
          <p className="text-lg">Now you can:</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>• Upload your spreadsheet or connect to Google Sheets</li>
            <li>• Start chatting with your data</li>
            <li>• Get AI-powered insights and analysis</li>
          </ul>
        </div>
      </div>
    )
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
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Debug logging for production troubleshooting
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    const isProd = process.env.NODE_ENV === 'production';
    const debugMsg = `Tutorial Debug: isVisible=${isTutorialVisible}, loading=${loading}, error=${error}, step=${currentStep}, env=${process.env.NODE_ENV}`;
    setDebugInfo(debugMsg);
    
    if (isDev) {
      console.log('🔍 [InteractiveTutorial]', debugMsg);
    }
    
    // Production logging for troubleshooting
    if (isProd) {
      console.log('🔍 [InteractiveTutorial] Production mode:', debugMsg);
    }
  }, [isTutorialVisible, loading, error, currentStep]);

  // Load tutorial instantly - no external dependencies
  useEffect(() => {
    try {
      setTutorialSteps(defaultTutorialSteps);
      setLoading(false);
    } catch (err) {
      console.error('Error setting tutorial steps:', err);
      setError('Failed to load tutorial');
      setLoading(false);
    }
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

  // Safety check: if we have critical errors, don't render the tutorial
  if (error && error.includes('Failed to load')) {
    console.error('🔍 [InteractiveTutorial] Critical error, hiding tutorial');
    hideTutorial();
    return null;
  }

  console.log('🔍 [InteractiveTutorial] Rendering tutorial with step:', currentStep);

  // Remove dark overlay - just show loading inline or skip it entirely
  if (loading && !error) {
    return null; // Don't show anything while loading - instant experience
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
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
        <div className="text-center mb-8 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="flex justify-center mb-4">
            {step.icon}
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">{step.title}</h2>
          <p className="text-lg text-white/70 mb-6">{step.description}</p>
          
          {/* YouTube Video */}
          {step.youtubeId && (
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

          {/* Custom Content */}
          {step.content && (
            <div className="max-w-4xl mx-auto">
              {step.content}
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


        

      </div>
    </div>
  );
};

export default InteractiveTutorial;
