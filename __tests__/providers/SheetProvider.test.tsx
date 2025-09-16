import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { SheetProvider, useSheet } from '../../app/providers/SheetProvider';

// Mock dependencies
jest.mock('../../app/providers/FirebaseProvider', () => ({
  useFirebase: () => ({
    user: { uid: 'test-user' },
    loading: false,
    signInWithGoogle: jest.fn(),
  }),
  getDb: jest.fn(() => ({})),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  collection: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  deleteDoc: jest.fn(),
}));

// Mock fetch for API calls
global.fetch = jest.fn();

// Test component to access useSheet hook
const TestComponent: React.FC<{ onSheetData: (data: any) => void }> = ({ onSheetData }) => {
  const sheetData = useSheet();
  React.useEffect(() => {
    onSheetData(sheetData);
  }, [sheetData, onSheetData]);
  return null;
};

describe('SheetProvider', () => {
  let mockOnSnapshot: jest.Mock;
  let mockCollection: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();

    // Setup firestore mocks
    mockOnSnapshot = jest.fn();
    mockCollection = jest.fn();

    const mockFirestore = require('firebase/firestore');
    mockFirestore.onSnapshot = mockOnSnapshot;
    mockFirestore.collection = mockCollection;
    mockFirestore.doc = jest.fn();
  });

  describe('Event-driven refresh system', () => {
    it('should listen for sheet-selector-refresh events and trigger prefetch', async () => {
      const mockDoPrefetch = jest.fn();

      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sheetNames: ['Sheet1', 'Sheet2'] }),
      });

      render(
        <SheetProvider>
          <TestComponent onSheetData={() => {}} />
        </SheetProvider>
      );

      // Simulate spreadsheet-removed event
      const refreshEvent = new CustomEvent('sheet-selector-refresh', {
        detail: { action: 'spreadsheet-removed' },
      });

      act(() => {
        window.dispatchEvent(refreshEvent);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/get-sheet-names', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            spreadsheetId: '',
            forceRefresh: true,
          }),
        }));
      });
    });

    it('should listen for force-refresh-sheet-names events', async () => {
      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sheetNames: ['Sheet1', 'Sheet2'] }),
      });

      render(
        <SheetProvider>
          <TestComponent onSheetData={() => {}} />
        </SheetProvider>
      );

      // Simulate force refresh event
      const refreshEvent = new CustomEvent('force-refresh-sheet-names', {
        detail: { spreadsheetId: 'test-spreadsheet-id' },
      });

      act(() => {
        window.dispatchEvent(refreshEvent);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/get-sheet-names', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            spreadsheetId: 'test-spreadsheet-id',
            forceRefresh: true,
          }),
        }));
      });
    });

    it('should handle refresh-needed action from sheet-selector-refresh events', async () => {
      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sheetNames: ['Sheet1', 'Sheet2'] }),
      });

      render(
        <SheetProvider>
          <TestComponent onSheetData={() => {}} />
        </SheetProvider>
      );

      // Simulate refresh-needed event
      const refreshEvent = new CustomEvent('sheet-selector-refresh', {
        detail: { action: 'refresh-needed' },
      });

      act(() => {
        window.dispatchEvent(refreshEvent);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/get-sheet-names', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            spreadsheetId: '',
            forceRefresh: true,
          }),
        }));
      });
    });
  });

  describe('useSheet hook', () => {
    it('should provide all required context values', async () => {
      let sheetData: any = null;

      render(
        <SheetProvider>
          <TestComponent onSheetData={(data) => { sheetData = data; }} />
        </SheetProvider>
      );

      await waitFor(() => {
        expect(sheetData).not.toBeNull();
      });

      expect(sheetData).toHaveProperty('defaultSpreadsheetId');
      expect(sheetData).toHaveProperty('selectedSheetNames');
      expect(sheetData).toHaveProperty('setDefaultSpreadsheetId');
      expect(sheetData).toHaveProperty('setSelectedSheetNames');
      expect(sheetData).toHaveProperty('allSheetNames');
      expect(sheetData).toHaveProperty('sheetDataCache');
      expect(sheetData).toHaveProperty('sheetsPrefetched');
      expect(sheetData).toHaveProperty('isSheetDataLoading');
      expect(sheetData).toHaveProperty('sheetStructureCache');
      expect(sheetData).toHaveProperty('unstructuredOverrides');
      expect(sheetData).toHaveProperty('setUnstructuredOverride');
      expect(sheetData).toHaveProperty('chosenBlockBySheet');
      expect(sheetData).toHaveProperty('setChosenBlockForSheet');
    });

    it('should handle spreadsheet selection changes', async () => {
      let sheetData: any = null;

      render(
        <SheetProvider>
          <TestComponent onSheetData={(data) => { sheetData = data; }} />
        </SheetProvider>
      );

      await waitFor(() => {
        expect(sheetData).not.toBeNull();
      });

      act(() => {
        sheetData.setDefaultSpreadsheetId('new-spreadsheet-id');
      });

      expect(sheetData.defaultSpreadsheetId).toBe('new-spreadsheet-id');
    });
  });
});
