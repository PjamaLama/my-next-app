import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/beta-stats';

// Mock Firebase Admin
jest.mock('../../lib/firebaseAdmin', () => ({
  getAdminDb: jest.fn(),
}));

// Mock NextApiResponse
const mockJson = jest.fn();
const mockStatus = jest.fn(() => ({
  json: mockJson,
}));
const mockRes: Partial<NextApiResponse> = {
  status: mockStatus,
  json: mockJson,
};

const { getAdminDb } = require('../../lib/firebaseAdmin');

describe('/api/beta-stats', () => {
  let mockDb: any;
  let mockDoc: any;
  let mockSnap: any;
  let mockReq: Partial<NextApiRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSnap = {
      exists: true,
      get: jest.fn(),
      data: jest.fn(),
    };

    mockDoc = {
      get: jest.fn().mockResolvedValue(mockSnap),
      set: jest.fn().mockResolvedValue(undefined),
    };

    mockDb = {
      doc: jest.fn().mockReturnValue(mockDoc),
    };

    getAdminDb.mockReturnValue(mockDb);

    mockReq = {
      method: 'GET',
    };
  });

  describe('Method validation', () => {
    it('should return 405 for non-GET methods', async () => {
      mockReq.method = 'POST';

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(405);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });
  });

  describe('Successful stats retrieval', () => {
    it('should return beta stats when document exists with all fields', async () => {
      mockSnap.get.mockImplementation((field: string) => {
        switch (field) {
          case 'capacity': return 100;
          case 'testerCount': return 25;
          case 'open': return true;
          default: return undefined;
        }
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        capacity: 100,
        testerCount: 25,
        spotsLeft: Number.POSITIVE_INFINITY,
        open: true
      });
      expect(mockDoc.set).not.toHaveBeenCalled(); // Document exists, no need to initialize
    });

    it('should calculate spots left when beta is closed', async () => {
      mockSnap.get.mockImplementation((field: string) => {
        switch (field) {
          case 'capacity': return 50;
          case 'testerCount': return 30;
          case 'open': return false;
          default: return undefined;
        }
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockJson).toHaveBeenCalledWith({
        capacity: 50,
        testerCount: 30,
        spotsLeft: 20,
        open: false
      });
    });

    it('should handle zero spots left', async () => {
      mockSnap.get.mockImplementation((field: string) => {
        switch (field) {
          case 'capacity': return 25;
          case 'testerCount': return 25;
          case 'open': return false;
          default: return undefined;
        }
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockJson).toHaveBeenCalledWith({
        capacity: 25,
        testerCount: 25,
        spotsLeft: 0,
        open: false
      });
    });

    it('should handle negative spots (more testers than capacity)', async () => {
      mockSnap.get.mockImplementation((field: string) => {
        switch (field) {
          case 'capacity': return 20;
          case 'testerCount': return 25;
          case 'open': return false;
          default: return undefined;
        }
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockJson).toHaveBeenCalledWith({
        capacity: 20,
        testerCount: 25,
        spotsLeft: 0, // Math.max(0, capacity - testerCount)
        open: false
      });
    });
  });

  describe('Document initialization', () => {
    it('should initialize document with default values when it does not exist', async () => {
      mockSnap.exists = false;

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockDoc.set).toHaveBeenCalledWith({
        capacity: 100,
        testerCount: 0,
        open: false,
        updatedAt: expect.any(Date)
      }, { merge: true });

      expect(mockJson).toHaveBeenCalledWith({
        capacity: 100,
        testerCount: 0,
        spotsLeft: 0,
        open: false
      });
    });

    it('should use default values when document fields are missing', async () => {
      mockSnap.get.mockReturnValue(undefined); // All fields missing

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockJson).toHaveBeenCalledWith({
        capacity: 100,
        testerCount: 0,
        spotsLeft: 0,
        open: false
      });
    });

    it('should handle invalid data types gracefully', async () => {
      mockSnap.get.mockImplementation((field: string) => {
        switch (field) {
          case 'capacity': return 'invalid'; // Should be number
          case 'testerCount': return null; // Should be number
          case 'open': return 'not boolean'; // Should be boolean
          default: return undefined;
        }
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockJson).toHaveBeenCalledWith({
        capacity: 100, // Falls back to default
        testerCount: 0, // Falls back to default
        spotsLeft: 0,
        open: false // Falls back to default
      });
    });
  });

  describe('Error handling', () => {
    it('should handle Firestore errors', async () => {
      const errorMessage = 'Firestore connection failed';
      mockDoc.get.mockRejectedValue(new Error(errorMessage));

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: errorMessage
      });
    });

    it('should handle document initialization errors', async () => {
      mockSnap.exists = false;
      const errorMessage = 'Permission denied';
      mockDoc.set.mockRejectedValue(new Error(errorMessage));

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: errorMessage
      });
    });

    it('should handle errors with undefined message', async () => {
      const error = new Error();
      error.message = '';
      mockDoc.get.mockRejectedValue(error);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal error'
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle very large capacity values', async () => {
      mockSnap.get.mockImplementation((field: string) => {
        switch (field) {
          case 'capacity': return 1000000;
          case 'testerCount': return 500000;
          case 'open': return true;
          default: return undefined;
        }
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockJson).toHaveBeenCalledWith({
        capacity: 1000000,
        testerCount: 500000,
        spotsLeft: Number.POSITIVE_INFINITY,
        open: true
      });
    });

    it('should handle zero capacity', async () => {
      mockSnap.get.mockImplementation((field: string) => {
        switch (field) {
          case 'capacity': return 0;
          case 'testerCount': return 0;
          case 'open': return false;
          default: return undefined;
        }
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockJson).toHaveBeenCalledWith({
        capacity: 0,
        testerCount: 0,
        spotsLeft: 0,
        open: false
      });
    });
  });
});
