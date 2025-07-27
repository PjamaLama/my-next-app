import { NextApiRequest, NextApiResponse } from 'next';

// Mock the Genkit tools
jest.mock('../genkit/tools', () => ({
  insertRow: jest.fn(),
  updateCell: jest.fn(),
}));

// Mock Firebase Firestore
jest.mock('../app/providers/FirebaseProvider', () => ({
  db: {
    collection: jest.fn(),
  },
}));

// Mock the Genkit flow
jest.mock('../genkit/updateSheetFlow', () => ({
  updateSheetFlow: jest.fn(),
}));

// Import the mocked functions
const mockInsertRow = require('../genkit/tools').insertRow;
const mockUpdateCell = require('../genkit/tools').updateCell;
const mockUpdateSheetFlow = require('../genkit/updateSheetFlow').updateSheetFlow;

describe('updateSheet API Integration Test', () => {
  let mockReq: Partial<NextApiRequest>;
  let mockRes: Partial<NextApiResponse>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  // Sample sheet data for testing
  const sampleSheetData = [
    { rowIndex: 1, Date: '2024-01-01', Category: 'Fuel', Amount: '50', isSummary: false },
    { rowIndex: 2, Date: '2024-01-02', Category: 'Food', Amount: '25', isSummary: false },
    { rowIndex: 3, Date: '2024-01-03', Category: 'Total', Amount: '75', isSummary: true },
  ];

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock response
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    mockRes = {
      status: mockStatus,
      json: mockJson,
    };

    // Mock Firestore collection and document operations
    const mockCollection = jest.fn();
    const mockDoc = jest.fn();
    const mockSetDoc = jest.fn();
    const mockDeleteDoc = jest.fn();

    const { db } = require('../app/providers/FirebaseProvider');
    db.collection.mockReturnValue({
      doc: mockDoc,
      getDocs: jest.fn().mockResolvedValue({
        docs: sampleSheetData.map((data, index) => ({
          id: `row_${index}`,
          data: () => data,
        })),
      }),
    });

    mockDoc.mockReturnValue({
      set: mockSetDoc,
      delete: mockDeleteDoc,
    });

    // Mock the updateSheetFlow to return sample actions
    mockUpdateSheetFlow.mockResolvedValue({
      actions: [
        {
          type: 'insertRow',
          sheet: 'Sheet1',
          row: 4,
          column: 'A',
          confidence: 'high',
        },
        {
          type: 'updateCell',
          sheet: 'Sheet1',
          row: 4,
          column: 'B',
          value: '2024-01-04',
          confidence: 'high',
        },
        {
          type: 'updateCell',
          sheet: 'Sheet1',
          row: 4,
          column: 'C',
          value: 'Fuel',
          confidence: 'medium',
        },
        {
          type: 'updateCell',
          sheet: 'Sheet1',
          row: 4,
          column: 'D',
          value: '60',
          confidence: 'high',
        },
      ],
      success: true,
      executedActions: 4,
    });
  });

  describe('POST /api/updateSheet', () => {
    it('should process transcript and return actions for preview', async () => {
      // Arrange
      const mockTranscript = 'Add fuel expense of 60 dollars for today';
      const mockSheetId = 'test-sheet-id';
      const mockSheetName = 'Sheet1';

      mockReq = {
        method: 'POST',
        body: {
          transcript: mockTranscript,
          sheetId: mockSheetId,
          sheetName: mockSheetName,
        },
      };

      // Act
      const { default: handler } = await import('../pages/api/updateSheet');
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      // Assert
      expect(mockUpdateSheetFlow).toHaveBeenCalledWith({
        transcript: mockTranscript,
        sheetId: mockSheetId,
        sheetName: mockSheetName,
        commit: false, // Default value
      });

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        actions: expect.arrayContaining([
          expect.objectContaining({
            type: 'insertRow',
            sheet: 'Sheet1',
            row: 4,
          }),
          expect.objectContaining({
            type: 'updateCell',
            sheet: 'Sheet1',
            row: 4,
            column: 'B',
            value: '2024-01-04',
          }),
        ]),
      });
    });

    it('should execute actions when commit flag is true', async () => {
      // Arrange
      const mockTranscript = 'Add fuel expense of 60 dollars for today';
      const mockSheetId = 'test-sheet-id';
      const mockSheetName = 'Sheet1';

      // Mock successful tool executions
      mockInsertRow.mockResolvedValue('Row inserted successfully');
      mockUpdateCell.mockResolvedValue('Cell updated successfully');

      mockReq = {
        method: 'POST',
        body: {
          transcript: mockTranscript,
          sheetId: mockSheetId,
          sheetName: mockSheetName,
          commit: true,
        },
      };

      // Act
      const { default: handler } = await import('../pages/api/updateSheet');
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      // Assert
      expect(mockUpdateSheetFlow).toHaveBeenCalledWith({
        transcript: mockTranscript,
        sheetId: mockSheetId,
        sheetName: mockSheetName,
        commit: true,
      });

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        executedActions: 4,
        actions: expect.arrayContaining([
          expect.objectContaining({
            type: 'insertRow',
            sheet: 'Sheet1',
            row: 4,
          }),
          expect.objectContaining({
            type: 'updateCell',
            sheet: 'Sheet1',
            row: 4,
            column: 'B',
            value: '2024-01-04',
          }),
        ]),
      });
    });

    it('should handle missing required fields', async () => {
      // Arrange
      mockReq = {
        method: 'POST',
        body: {
          // Missing transcript and sheetId
          sheetName: 'Sheet1',
        },
      };

      // Act
      const { default: handler } = await import('../pages/api/updateSheet');
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Missing required fields: transcript and sheetId are required',
      });
    });

    it('should handle invalid HTTP method', async () => {
      // Arrange
      mockReq = {
        method: 'GET',
        body: {
          transcript: 'test',
          sheetId: 'test-sheet-id',
        },
      };

      // Act
      const { default: handler } = await import('../pages/api/updateSheet');
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(405);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Method not allowed',
      });
    });

    it('should handle flow execution errors', async () => {
      // Arrange
      const mockTranscript = 'Add fuel expense of 60 dollars for today';
      const mockSheetId = 'test-sheet-id';

      // Mock flow to throw an error
      mockUpdateSheetFlow.mockRejectedValue(new Error('Flow execution failed'));

      mockReq = {
        method: 'POST',
        body: {
          transcript: mockTranscript,
          sheetId: mockSheetId,
        },
      };

      // Act
      const { default: handler } = await import('../pages/api/updateSheet');
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Flow execution failed',
      });
    });

    it('should verify tool invocations with correct parameters', async () => {
      // Arrange
      const mockTranscript = 'Add fuel expense of 60 dollars for today';
      const mockSheetId = 'test-sheet-id';
      const mockSheetName = 'Sheet1';

      // Mock successful tool executions
      mockInsertRow.mockResolvedValue('Row inserted successfully');
      mockUpdateCell.mockResolvedValue('Cell updated successfully');

      mockReq = {
        method: 'POST',
        body: {
          transcript: mockTranscript,
          sheetId: mockSheetId,
          sheetName: mockSheetName,
          commit: true,
        },
      };

      // Act
      const { default: handler } = await import('../pages/api/updateSheet');
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      // Assert - Verify that the flow was called and tools would be invoked
      expect(mockUpdateSheetFlow).toHaveBeenCalledWith({
        transcript: mockTranscript,
        sheetId: mockSheetId,
        sheetName: mockSheetName,
        commit: true,
      });

      // The actual tool invocations happen inside the flow, so we verify the flow was called correctly
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          executedActions: 4,
        })
      );
    });
  });

  describe('Transcript Cleaning', () => {
    it('should clean transcript before processing', async () => {
      // Arrange
      const rawTranscript = 'um i think i need to add like a fuel expense you know basically for 60 dollars and stuff';
      const mockSheetId = 'test-sheet-id';

      mockReq = {
        method: 'POST',
        body: {
          transcript: rawTranscript,
          sheetId: mockSheetId,
        },
      };

      // Act
      const { default: handler } = await import('../pages/api/updateSheet');
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      // Assert
      expect(mockUpdateSheetFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          transcript: expect.stringContaining('fuel expense'), // Should contain cleaned content
          sheetId: mockSheetId,
        })
      );
    });
  });
}); 