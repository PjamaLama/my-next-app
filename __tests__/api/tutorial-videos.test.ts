import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/tutorial-videos';

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

describe('/api/tutorial-videos', () => {
  let mockDb: any;
  let mockCollection: any;
  let mockQuery: any;
  let mockSnap: any;
  let mockReq: Partial<NextApiRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSnap = {
      forEach: jest.fn(),
      empty: false,
      size: 0,
    };

    mockQuery = {
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(mockSnap),
    };

    mockCollection = jest.fn().mockReturnValue(mockQuery);

    mockDb = {
      collection: mockCollection,
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

  describe('Successful video retrieval', () => {
    it('should return videos from Firestore when they exist', async () => {
      const mockDocs = [
        {
          id: 'video1',
          data: () => ({
            title: 'Video 1',
            description: 'Description 1',
            youtubeId: 'abc123',
            order: 1,
          }),
        },
        {
          id: 'video2',
          data: () => ({
            title: 'Video 2',
            description: 'Description 2',
            youtubeId: 'def456',
            order: 2,
          }),
        },
      ];

      mockSnap.forEach.mockImplementation((callback: Function) => {
        mockDocs.forEach(callback);
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockDb.collection).toHaveBeenCalledWith('tutorial-videos');
      expect(mockQuery.orderBy).toHaveBeenCalledWith('order');
      expect(mockQuery.get).toHaveBeenCalled();

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videos: [
          {
            id: 'video1',
            title: 'Video 1',
            description: 'Description 1',
            youtubeId: 'abc123',
            order: 1,
          },
          {
            id: 'video2',
            title: 'Video 2',
            description: 'Description 2',
            youtubeId: 'def456',
            order: 2,
          },
        ],
      });
    });

    it('should handle empty Firestore collection and return default videos', async () => {
      // Empty collection
      mockSnap.forEach.mockImplementation(() => {
        // No documents
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videos: expect.arrayContaining([
          expect.objectContaining({ id: 'welcome' }),
          expect.objectContaining({ id: 'setup' }),
          expect.objectContaining({ id: 'connect' }),
          expect.objectContaining({ id: 'chat' }),
        ]),
      });
    });

    it('should handle documents with missing fields', async () => {
      const mockDocs = [
        {
          id: 'video1',
          data: () => ({
            // Missing some fields
            title: 'Video 1',
            youtubeId: 'abc123',
          }),
        },
      ];

      mockSnap.forEach.mockImplementation((callback: Function) => {
        mockDocs.forEach(callback);
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockJson).toHaveBeenCalledWith({
        videos: [
          {
            id: 'video1',
            title: 'Video 1',
            description: '', // Should default to empty string
            youtubeId: 'abc123',
            order: 0, // Should default to 0
          },
        ],
      });
    });
  });

  describe('Error handling and fallbacks', () => {

    it('should return default videos when Firestore query fails', async () => {
      mockQuery.get.mockRejectedValue(new Error('Firestore connection failed'));

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videos: [
          expect.objectContaining({ id: 'welcome' }),
          expect.objectContaining({ id: 'setup' }),
          expect.objectContaining({ id: 'connect' }),
          expect.objectContaining({ id: 'chat' }),
        ],
      });
    });

    it('should return default videos when database initialization fails', async () => {
      getAdminDb.mockImplementation(() => {
        throw new Error('Firebase initialization failed');
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        videos: expect.arrayContaining([
          expect.objectContaining({ id: 'welcome' }),
          expect.objectContaining({ id: 'setup' }),
          expect.objectContaining({ id: 'connect' }),
          expect.objectContaining({ id: 'chat' }),
        ]),
      });
    });
  });

  describe('Ordering', () => {
    it('should order videos by order field', async () => {
      const mockDocs = [
        {
          id: 'video3',
          data: () => ({
            title: 'Video 3',
            description: 'Description 3',
            youtubeId: 'ghi789',
            order: 3,
          }),
        },
        {
          id: 'video1',
          data: () => ({
            title: 'Video 1',
            description: 'Description 1',
            youtubeId: 'abc123',
            order: 1,
          }),
        },
        {
          id: 'video2',
          data: () => ({
            title: 'Video 2',
            description: 'Description 2',
            youtubeId: 'def456',
            order: 2,
          }),
        },
      ];

      mockSnap.forEach.mockImplementation((callback: Function) => {
        // Sort documents by order before calling callback to simulate Firestore ordering
        const sortedDocs = [...mockDocs].sort((a, b) => {
          const orderA = a.data().order || 0;
          const orderB = b.data().order || 0;
          return orderA - orderB;
        });
        sortedDocs.forEach(callback);
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      const result = mockJson.mock.calls[0][0];

      // Check that videos are ordered by their order field
      expect(result.videos).toHaveLength(3);
      expect(result.videos[0]).toEqual(
        expect.objectContaining({
          id: 'video1',
          order: 1,
        })
      );
      expect(result.videos[1]).toEqual(
        expect.objectContaining({
          id: 'video2',
          order: 2,
        })
      );
      expect(result.videos[2]).toEqual(
        expect.objectContaining({
          id: 'video3',
          order: 3,
        })
      );
    });
  });


});
