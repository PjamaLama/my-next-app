import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/user-count';

// Mock Firebase Admin
jest.mock('../../lib/firebaseAdmin', () => ({
  getAdminAuth: jest.fn(),
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

const { getAdminAuth } = require('../../lib/firebaseAdmin');

describe('/api/user-count', () => {
  let mockAuth: any;
  let mockReq: Partial<NextApiRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuth = {
      listUsers: jest.fn(),
    };

    getAdminAuth.mockReturnValue(mockAuth);

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
        success: false,
        error: 'Method not allowed',
        userCount: 0
      });
    });
  });

  describe('Successful user count', () => {
    it('should return user count successfully', async () => {
      const mockUsers = [
        { uid: 'user1' },
        { uid: 'user2' },
        { uid: 'user3' }
      ];

      mockAuth.listUsers.mockResolvedValue({
        users: mockUsers
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(getAdminAuth).toHaveBeenCalled();
      expect(mockAuth.listUsers).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        userCount: 3
      });
    });

    it('should return 0 when no users exist', async () => {
      mockAuth.listUsers.mockResolvedValue({
        users: []
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        userCount: 0
      });
    });
  });

  describe('Error handling', () => {
    it('should handle Firebase auth errors', async () => {
      const errorMessage = 'Firebase authentication failed';
      mockAuth.listUsers.mockRejectedValue(new Error(errorMessage));

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: errorMessage,
        userCount: 0
      });
    });

    it('should handle generic errors', async () => {
      mockAuth.listUsers.mockRejectedValue('String error');

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Internal error',
        userCount: 0
      });
    });

    it('should handle errors with undefined message', async () => {
      const error = new Error();
      error.message = '';
      mockAuth.listUsers.mockRejectedValue(error);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Internal error',
        userCount: 0
      });
    });
  });
});
