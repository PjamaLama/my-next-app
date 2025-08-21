"use client";

import React from 'react';
import { DialogProvider } from './providers/DialogProvider';
import { FirebaseProvider } from './providers/FirebaseProvider';
import { SheetProvider } from './providers/SheetProvider';
import { ServiceAccountProvider } from './providers/ServiceAccountProvider';
import { ChatProvider } from './providers/ChatProvider';
import { TutorialProvider } from './providers/TutorialProvider';
import SidePanel from './components/SidePanel';
import FeedbackButton from './components/FeedbackButton';
import FeedbackNudge from './components/FeedbackNudge';
import { ClientGatedLayout } from './providers/ClientGatedLayout';
import PWAInstaller from './components/PWAInstaller';
import InteractiveTutorial from './components/InteractiveTutorial';

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  return (
    <DialogProvider>
      <FirebaseProvider>
        <SheetProvider>
          <ServiceAccountProvider>
            <ChatProvider>
              <TutorialProvider>
                {/* InteractiveTutorial rendered at top level so it's accessible from anywhere */}
                <InteractiveTutorial />
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
              </TutorialProvider>
            </ChatProvider>
          </ServiceAccountProvider>
        </SheetProvider>
      </FirebaseProvider>
    </DialogProvider>
  );
}


