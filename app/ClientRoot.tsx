"use client";

import React from 'react';
import { DialogProvider } from './providers/DialogProvider';
import { FirebaseProvider } from './providers/FirebaseProvider';
import { SheetProvider } from './providers/SheetProvider';
import { ServiceAccountProvider } from './providers/ServiceAccountProvider';
import { SettingsProvider } from './providers/SettingsProvider';
import { FirestoreSyncProvider } from './providers/FirestoreSyncProvider';
import { ChatProvider } from './providers/ChatProvider';
import SidePanel from './components/SidePanel';
import FeedbackButton from './components/FeedbackButton';
import FeedbackNudge from './components/FeedbackNudge';
import { ClientGatedLayout } from './providers/ClientGatedLayout';
import PWAInstaller from './components/PWAInstaller';

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  return (
    <DialogProvider>
      <FirebaseProvider>
        <SheetProvider>
          <ServiceAccountProvider>
            <SettingsProvider>
              <FirestoreSyncProvider>
                <ChatProvider>
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
                </ChatProvider>
              </FirestoreSyncProvider>
            </SettingsProvider>
          </ServiceAccountProvider>
        </SheetProvider>
      </FirebaseProvider>
    </DialogProvider>
  );
}


