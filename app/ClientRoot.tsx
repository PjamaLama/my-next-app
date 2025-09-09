"use client";

import React from 'react';
import { DialogProvider } from './providers/DialogProvider';
import { FirebaseProvider } from './providers/FirebaseProvider';
import { SheetProvider } from './providers/SheetProvider';
import { ServiceAccountProvider } from './providers/ServiceAccountProvider';
import { ChatProvider } from './providers/ChatProvider';
import { TutorialProvider } from './providers/TutorialProvider';
import { UpgradeModalProvider } from './providers/UpgradeModalProvider';
import SidePanel from './components/SidePanel';
import FeedbackButton from './components/FeedbackButton';
import FeedbackNudge from './components/FeedbackNudge';
import { ClientGatedLayout } from './providers/ClientGatedLayout';
import PWAInstaller from './components/PWAInstaller';
import InteractiveTutorial from './components/InteractiveTutorial';
import AnalyticsTracker from './components/AnalyticsTracker';
import { useTutorial } from './providers/TutorialProvider';

// Component to use tutorial context
function TutorialWrapper() {
  const { isTutorialVisible, hideTutorial } = useTutorial();
  return (
    <InteractiveTutorial
      isVisible={isTutorialVisible}
      onClose={hideTutorial}
    />
  );
}

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  return (
    <DialogProvider>
      <FirebaseProvider>
        <SheetProvider>
          <ServiceAccountProvider>
            <ChatProvider>
              <TutorialProvider>
                <UpgradeModalProvider>
                  {/* Analytics tracking - handles page views and initialization */}
                  <AnalyticsTracker />

                  {/* InteractiveTutorial rendered at top level so it's accessible from anywhere */}
                  <TutorialWrapper />
                  {/* Sidebar + NavBar hidden on landing by ClientGatedLayout/SidePanel */}
                  <SidePanel />
                  <div className="transition-all min-h-screen flex flex-col">
                    <ClientGatedLayout>
                      {children}
                    </ClientGatedLayout>
                    <FeedbackNudge />
                    <FeedbackButton />
                    <PWAInstaller />
                  </div>
                </UpgradeModalProvider>
              </TutorialProvider>
            </ChatProvider>
          </ServiceAccountProvider>
        </SheetProvider>
      </FirebaseProvider>
    </DialogProvider>
  );
}


