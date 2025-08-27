import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/landing-page';

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

describe('/api/landing-page', () => {
  let mockDb: any;
  let mockDoc: any;
  let mockSnap: any;
  let mockReq: Partial<NextApiRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSnap = {
      exists: true,
      data: jest.fn(),
    };

    mockDoc = {
      get: jest.fn().mockResolvedValue(mockSnap),
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
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Method not allowed'
      });
    });
  });

  describe('Successful data retrieval', () => {
    it('should return data from Firestore when document exists', async () => {
      const firestoreData = {
        videoUrl: 'https://example.com/video',
        videoTitle: 'Custom Title',
        updatedAt: new Date('2023-01-01'),
      };

      mockSnap.data.mockReturnValue(firestoreData);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(getAdminDb).toHaveBeenCalled();
      expect(mockDb.doc).toHaveBeenCalledWith('landingPage/content');
      expect(mockDoc.get).toHaveBeenCalled();
      expect(mockSnap.data).toHaveBeenCalled();

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videoUrl: 'https://example.com/video',
        videoTitle: 'Custom Title',
        updatedAt: new Date('2023-01-01'),
      });
    });

    it('should return default values when document does not exist', async () => {
      mockSnap.exists = false;

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videoUrl: 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
        videoTitle: 'SheetyAI Demo Video',
        updatedAt: undefined,
      });
    });

    it('should return default values when data fields are missing', async () => {
      mockSnap.data.mockReturnValue({
        videoUrl: undefined,
        videoTitle: undefined,
        updatedAt: undefined,
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videoUrl: 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
        videoTitle: 'SheetyAI Demo Video',
        updatedAt: undefined,
      });
    });

    it('should handle partial data from Firestore', async () => {
      mockSnap.data.mockReturnValue({
        videoUrl: 'https://example.com/custom-video',
        // videoTitle and updatedAt are missing
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videoUrl: 'https://example.com/custom-video',
        videoTitle: 'SheetyAI Demo Video', // Should use default
        updatedAt: undefined,
      });
    });
  });

  describe('Error handling', () => {
    it('should return default values on Firestore error', async () => {
      mockDoc.get.mockRejectedValue(new Error('Firestore connection failed'));

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videoUrl: 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
        videoTitle: 'SheetyAI Demo Video',
      });
    });

    it('should handle database initialization errors', async () => {
      getAdminDb.mockImplementation(() => {
        throw new Error('Firebase initialization failed');
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videoUrl: 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
        videoTitle: 'SheetyAI Demo Video',
      });
    });
  });
});
