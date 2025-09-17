import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatInterface from '../../app/components/ChatInterface';

// Mock all the providers and hooks
jest.mock('../../app/providers/ChatProvider', () => ({
  useChat: () => ({
    chatMessages: [],
    addMessage: jest.fn(),
    error: null,
    ensureSession: jest.fn(),
    setChatMessages: jest.fn(),
    updateMessageTables: jest.fn(),
    currentSessionId: 'test-session',
    clearErrorAndCreateSession: jest.fn(),
    setAbortController: jest.fn(),
    cancelChatGeneration: jest.fn(),
  }),
}));

// Mock the analytics module
jest.mock('@/lib/analytics/safeAnalytics', () => ({
  trackConversion: jest.fn(),
  trackUserInteraction: jest.fn(),
  trackFeatureUsage: jest.fn(),
}));

jest.mock('../../app/providers/SheetProvider', () => ({
  useSheet: () => ({
    defaultSpreadsheetId: 'test-spreadsheet-id',
    selectedSheetNames: ['Sheet1'],
    sheetDataCache: {},
    isSheetDataLoading: false,
  }),
}));

jest.mock('../../app/providers/FirebaseProvider', () => ({
  useFirebase: () => ({
    user: { uid: 'test-user' },
    waId: null,
    userType: 'pro',
  }),
}));

jest.mock('../../app/hooks/useAdminMeta', () => ({
  useAdminMeta: () => ({ meta: null }),
}));

jest.mock('../../app/hooks/useMessageLimits', () => ({
  useMessageLimits: () => ({
    canSendMessage: true,
    incrementUsage: jest.fn(),
    isLimitReached: false,
    dailyUsage: 0,
    limit: 100,
  }),
}));

jest.mock('../../app/providers/UpgradeModalProvider', () => ({
  useUpgradeModal: () => ({ openModal: jest.fn() }),
}));

jest.mock('../../app/hooks/useWhatsAppBannerVisibility', () => ({
  useWhatsAppBannerVisibility: () => ({
    bannerMode: 'setup',
    isVisible: false,
  }),
}));

jest.mock('../../app/providers/TutorialProvider', () => ({
  useTutorial: () => ({
    isTutorialVisible: false,
    hideTutorial: jest.fn(),
  }),
}));

// Mock fetch for API calls
global.fetch = jest.fn();

describe('ChatInterface - Approve Handling', () => {
  const mockAddMessage = jest.fn();
  const mockUpdateMessageTables = jest.fn();
  const mockSetChatMessages = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the useChat hook to return our mocks
    require('../../app/providers/ChatProvider').useChat.mockReturnValue({
      chatMessages: [],
      addMessage: mockAddMessage,
      error: null,
      ensureSession: jest.fn(),
      setChatMessages: mockSetChatMessages,
      updateMessageTables: mockUpdateMessageTables,
      currentSessionId: 'test-session',
      clearErrorAndCreateSession: jest.fn(),
      setAbortController: jest.fn(),
      cancelChatGeneration: jest.fn(),
    });

    // Mock fetch for API calls
    global.fetch = jest.fn();
  });

  describe('handleApproveUpdate', () => {
    it('should approve table with sheetName specified', async () => {
      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ inserts: 2 }),
      });

      render(<ChatInterface />);

      // Simulate the approve event
      const approveEvent = new CustomEvent('chat:approve-update', {
        detail: {
          preview: {
            headers: ['Name', 'Age'],
            rows: [['John', '25'], ['Jane', '30']],
            messageId: 'msg-1',
            tableIndex: 0,
            title: 'Test Table',
            sheetName: 'Sheet1',
            meta: {
              sheetName: 'Sheet1',
              operations: { add: 2, update: 0 },
              updateRow: undefined,
            },
            uid: 'table-1',
          },
        },
      });

      window.dispatchEvent(approveEvent);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/ingest-rows', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            spreadsheetId: 'test-spreadsheet-id',
            sheetName: 'Sheet1',
            rows: [
              { Name: 'John', Age: '25' },
              { Name: 'Jane', Age: '30' },
            ],
            dryRun: false,
          }),
        }));
      });

      expect(mockAddMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: '✅ Changes applied successfully! 2 rows added to "Sheet1".',
      });
    });

    it('should handle update operation when updateRow is specified', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      render(<ChatInterface />);

      const approveEvent = new CustomEvent('chat:approve-update', {
        detail: {
          preview: {
            headers: ['Name', 'Age'],
            rows: [['John', '35']],
            messageId: 'msg-1',
            tableIndex: 0,
            title: 'Updated Data',
            sheetName: 'Sheet1',
            meta: {
              sheetName: 'Sheet1',
              operations: { add: 0, update: 1 },
              updateRow: 2,
            },
            uid: 'table-1',
          },
        },
      });

      window.dispatchEvent(approveEvent);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/update-sheet-row', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            spreadsheetId: 'test-spreadsheet-id',
            sheetName: 'Sheet1',
            rowIndex: 2,
            values: ['John', '35'],
          }),
        }));
      });
    });

    it('should show error when no spreadsheet is selected', async () => {
      // Mock useSheet to return no spreadsheet
      require('../../app/providers/SheetProvider').useSheet.mockReturnValue({
        defaultSpreadsheetId: '',
        selectedSheetNames: [],
        sheetDataCache: {},
        isSheetDataLoading: false,
      });

      render(<ChatInterface />);

      const approveEvent = new CustomEvent('chat:approve-update', {
        detail: {
          preview: {
            headers: ['Name'],
            rows: [['Test']],
            messageId: 'msg-1',
            tableIndex: 0,
            title: 'Test Table',
            sheetName: 'Sheet1',
            meta: { sheetName: 'Sheet1' },
            uid: 'table-1',
          },
        },
      });

      window.dispatchEvent(approveEvent);

      await waitFor(() => {
        expect(mockAddMessage).toHaveBeenCalledWith({
          role: 'assistant',
          content: '❌ Failed to apply changes: No spreadsheet selected. Please select a spreadsheet first using the sheet selector above.',
        });
      });
    });

    it('should show error when table has no sheetName', async () => {
      render(<ChatInterface />);

      const approveEvent = new CustomEvent('chat:approve-update', {
        detail: {
          preview: {
            headers: ['Name'],
            rows: [['Test']],
            messageId: 'msg-1',
            tableIndex: 0,
            title: 'Test Table',
            sheetName: undefined,
            meta: {},
            uid: 'table-1',
          },
        },
      });

      window.dispatchEvent(approveEvent);

      await waitFor(() => {
        expect(mockAddMessage).toHaveBeenCalledWith({
          role: 'assistant',
          content: '❌ Failed to apply changes: This table does not specify a target sheet. Please ensure the table has a target sheet defined before approving.',
        });
      });
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Sheet not found' }),
      });

      render(<ChatInterface />);

      const approveEvent = new CustomEvent('chat:approve-update', {
        detail: {
          preview: {
            headers: ['Name'],
            rows: [['Test']],
            messageId: 'msg-1',
            tableIndex: 0,
            title: 'Test Table',
            sheetName: 'Sheet1',
            meta: { sheetName: 'Sheet1' },
            uid: 'table-1',
          },
        },
      });

      window.dispatchEvent(approveEvent);

      await waitFor(() => {
        expect(mockAddMessage).toHaveBeenCalledWith({
          role: 'assistant',
          content: '❌ Failed to apply changes: Sheet not found',
        });
      });
    });
  });
});
