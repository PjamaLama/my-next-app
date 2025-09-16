import { renderHook, act } from '@testing-library/react';
import { useUserProfile } from '../../../app/hooks/useUserProfile';

// Mock Firebase
jest.mock('../../../app/providers/FirebaseProvider', () => ({
  getDb: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        onSnapshot: jest.fn(),
        setDoc: jest.fn()
      }))
    }))
  }))
}));

// Mock Firebase auth
jest.mock('firebase/auth', () => ({
  User: jest.fn()
}));

describe('useUserProfile', () => {
  const mockUser = {
    uid: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return default values when no user is provided', () => {
    const { result } = renderHook(() => useUserProfile(null));

    expect(result.current).toEqual({
      geminiApiKey: '',
      waId: null,
      message_count: 0,
      userType: 'free',
      isBetaUser: false,
      subscription: null,
      setGeminiApiKey: expect.any(Function),
      saveGeminiApiKey: expect.any(Function)
    });
  });

  it('should initialize user profile for new users', () => {
    // Mock Firestore operations
    const mockSetDoc = jest.fn();
    const mockGetDoc = jest.fn(() => Promise.resolve({
      exists: () => false
    }));

    const mockDoc = jest.fn(() => ({
      setDoc: mockSetDoc,
      get: mockGetDoc
    }));

    const mockCollection = jest.fn(() => ({
      doc: mockDoc
    }));

    const mockDb = require('../../../app/providers/FirebaseProvider').getDb;
    mockDb.mockReturnValue({
      collection: mockCollection
    });

    const { result } = renderHook(() => useUserProfile(mockUser as any));

    expect(mockCollection).toHaveBeenCalledWith('users');
    expect(mockDoc).toHaveBeenCalledWith('test-user-id');
    expect(mockDoc).toHaveBeenCalledWith('test-user-id', 'private', 'profile');
  });

  it('should handle existing user data correctly', () => {
    const mockUserData = {
      message_count: 5,
      wa_id: 'test-wa-id',
      userType: 'pro',
      isBetaUser: false,
      subscription: {
        status: 'active',
        plan: 'pro',
        endDate: new Date()
      }
    };

    const mockProfileData = {
      geminiApiKey: 'test-key'
    };

    // Mock Firestore listeners
    const mockOnSnapshot = jest.fn((callback) => {
      callback({
        exists: () => true,
        data: () => mockUserData
      });
      return jest.fn(); // unsubscribe function
    });

    const mockProfileOnSnapshot = jest.fn((callback) => {
      callback({
        exists: () => true,
        data: () => mockProfileData
      });
      return jest.fn();
    });

    const mockDoc = jest.fn()
      .mockReturnValueOnce({ onSnapshot: mockOnSnapshot }) // user doc
      .mockReturnValueOnce({ onSnapshot: mockProfileOnSnapshot }); // profile doc

    const mockCollection = jest.fn(() => ({
      doc: mockDoc
    }));

    const mockDb = require('../../../app/providers/FirebaseProvider').getDb;
    mockDb.mockReturnValue({
      collection: mockCollection
    });

    const { result } = renderHook(() => useUserProfile(mockUser as any));

    expect(result.current.message_count).toBe(5);
    expect(result.current.waId).toBe('test-wa-id');
    expect(result.current.userType).toBe('pro');
    expect(result.current.isBetaUser).toBe(false);
    expect(result.current.subscription).toEqual({
      status: 'active',
      plan: 'pro',
      endDate: mockUserData.subscription.endDate,
      cancelledAt: undefined
    });
  });

  it('should handle subscription update events', () => {
    const mockUserData = {
      message_count: 0,
      userType: 'free',
      subscription: null
    };

    const mockOnSnapshot = jest.fn((callback) => {
      callback({
        exists: () => true,
        data: () => mockUserData
      });
      return jest.fn();
    });

    const mockDoc = jest.fn()
      .mockReturnValueOnce({ onSnapshot: mockOnSnapshot })
      .mockReturnValueOnce({ onSnapshot: jest.fn(() => jest.fn()) });

    const mockCollection = jest.fn(() => ({
      doc: mockDoc
    }));

    const mockDb = require('../../../app/providers/FirebaseProvider').getDb;
    mockDb.mockReturnValue({
      collection: mockCollection
    });

    const { result } = renderHook(() => useUserProfile(mockUser as any));

    // Simulate subscription update event
    act(() => {
      window.dispatchEvent(new CustomEvent('subscription-updated'));
    });

    // The event handler should have been called
    expect(result.current).toBeDefined();
  });

  it('should save Gemini API key correctly', async () => {
    const mockSetDoc = jest.fn(() => Promise.resolve());

    const mockDoc = jest.fn(() => ({
      onSnapshot: jest.fn(() => jest.fn()),
      setDoc: mockSetDoc
    }));

    const mockCollection = jest.fn(() => ({
      doc: mockDoc
    }));

    const mockDb = require('../../../app/providers/FirebaseProvider').getDb;
    mockDb.mockReturnValue({
      collection: mockCollection
    });

    const { result } = renderHook(() => useUserProfile(mockUser as any));

    await act(async () => {
      await result.current.saveGeminiApiKey('new-api-key');
    });

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.any(Object),
      { geminiApiKey: 'new-api-key' },
      { merge: true }
    );
  });

  it('should handle Firestore errors gracefully', () => {
    const mockOnSnapshot = jest.fn(() => {
      throw new Error('Firestore error');
    });

    const mockDoc = jest.fn(() => ({
      onSnapshot: mockOnSnapshot
    }));

    const mockCollection = jest.fn(() => ({
      doc: mockDoc
    }));

    const mockDb = require('../../../app/providers/FirebaseProvider').getDb;
    mockDb.mockReturnValue({
      collection: mockCollection
    });

    // Should not throw error
    const { result } = renderHook(() => useUserProfile(mockUser as any));

    expect(result.current).toBeDefined();
  });
});
