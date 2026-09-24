import { jest } from '@jest/globals';
import prisma from '../lib/prisma.js';
import {
  addBookmark,
  removeBookmark,
  listBookmarks,
} from '../api/controllers/bookmarkController.js';

jest.mock('../lib/prisma.js');
jest.mock('../config/logger.js');

describe('bookmark mutations - idempotency support', () => {
  let mockRequest;
  let mockResponse;
  let mockEscrowBookmark;
  let mockEscrow;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      user: { address: 'G123456789' },
      params: { id: '100' },
      query: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockEscrowBookmark = {
      upsert: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };

    mockEscrow = {
      findMany: jest.fn().mockResolvedValue([]),
    };

    prisma.escrowBookmark = mockEscrowBookmark;
    prisma.escrow = mockEscrow;
  });

  describe('addBookmark - idempotent create', () => {
    it('creates a new bookmark on first call', async () => {
      const newBookmark = {
        id: 'bookmark_1',
        userAddress: 'G123456789',
        escrowId: 100n,
        createdAt: new Date(),
      };
      mockEscrowBookmark.upsert.mockResolvedValue(newBookmark);

      await addBookmark(mockRequest, mockResponse);

      expect(mockEscrowBookmark.upsert).toHaveBeenCalledWith({
        where: { userAddress_escrowId: { userAddress: 'G123456789', escrowId: 100n } },
        update: {},
        create: expect.objectContaining({
          userAddress: 'G123456789',
          escrowId: 100n,
        }),
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });

    it('returns existing bookmark on repeated create (idempotent)', async () => {
      const existingBookmark = {
        id: 'bookmark_1',
        userAddress: 'G123456789',
        escrowId: 100n,
        createdAt: new Date('2026-01-01'),
      };
      mockEscrowBookmark.upsert.mockResolvedValue(existingBookmark);

      await addBookmark(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          isBookmarked: true,
        }),
      );
    });

    it('uses upsert to handle concurrent duplicate requests', async () => {
      mockEscrowBookmark.upsert.mockResolvedValue({
        id: 'bookmark_1',
        userAddress: 'G123456789',
        escrowId: 100n,
      });

      await addBookmark(mockRequest, mockResponse);

      const upsertCall = mockEscrowBookmark.upsert.mock.calls[0][0];
      expect(upsertCall.update).toEqual({});
      expect(upsertCall.create).toBeDefined();
      expect(upsertCall.where.userAddress_escrowId).toBeDefined();
    });

    it('prevents duplicate bookmarks via unique constraint', async () => {
      const bookmark = {
        id: 'bookmark_1',
        userAddress: 'G123456789',
        escrowId: 100n,
      };
      mockEscrowBookmark.upsert.mockResolvedValue(bookmark);

      await addBookmark(mockRequest, mockResponse);
      await addBookmark(mockRequest, mockResponse);

      expect(mockEscrowBookmark.upsert).toHaveBeenCalledTimes(2);
      // Both calls should use the same where clause
      const call1 = mockEscrowBookmark.upsert.mock.calls[0][0];
      const call2 = mockEscrowBookmark.upsert.mock.calls[1][0];
      expect(call1.where).toEqual(call2.where);
    });

    it('requires authentication', async () => {
      mockRequest.user = undefined;

      await addBookmark(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('converts escrowId from string to BigInt', async () => {
      mockRequest.params.id = '999';
      mockEscrowBookmark.upsert.mockResolvedValue({
        id: 'bookmark_1',
        userAddress: 'G123456789',
        escrowId: 999n,
      });

      await addBookmark(mockRequest, mockResponse);

      const call = mockEscrowBookmark.upsert.mock.calls[0][0];
      expect(call.where.userAddress_escrowId.escrowId).toBe(999n);
    });

    it('returns escrowId as string in response', async () => {
      const bookmark = {
        id: 'bookmark_1',
        userAddress: 'G123456789',
        escrowId: 100n,
      };
      mockEscrowBookmark.upsert.mockResolvedValue(bookmark);

      await addBookmark(mockRequest, mockResponse);

      const response = mockResponse.json.mock.calls[0][0];
      expect(response.bookmark.escrowId).toBe('100');
    });
  });

  describe('removeBookmark - idempotent delete', () => {
    it('deletes existing bookmark', async () => {
      mockEscrowBookmark.deleteMany.mockResolvedValue({ count: 1 });

      await removeBookmark(mockRequest, mockResponse);

      expect(mockEscrowBookmark.deleteMany).toHaveBeenCalledWith({
        where: { userAddress: 'G123456789', escrowId: 100n },
      });
      expect(mockResponse.json).toHaveBeenCalledWith({ isBookmarked: false });
    });

    it('succeeds on repeated delete (idempotent no-op)', async () => {
      mockEscrowBookmark.deleteMany.mockResolvedValue({ count: 0 });

      await removeBookmark(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ isBookmarked: false });
    });

    it('handles deleteMany gracefully when bookmark does not exist', async () => {
      mockEscrowBookmark.deleteMany.mockResolvedValue({ count: 0 });

      await removeBookmark(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ isBookmarked: false });
    });

    it('requires authentication', async () => {
      mockRequest.user = undefined;

      await removeBookmark(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('converts escrowId from string to BigInt', async () => {
      mockRequest.params.id = '555';
      mockEscrowBookmark.deleteMany.mockResolvedValue({ count: 1 });

      await removeBookmark(mockRequest, mockResponse);

      const call = mockEscrowBookmark.deleteMany.mock.calls[0][0];
      expect(call.where.escrowId).toBe(555n);
    });

    it('is safe for concurrent delete requests', async () => {
      mockEscrowBookmark.deleteMany.mockResolvedValue({ count: 1 });

      await removeBookmark(mockRequest, mockResponse);

      const call1 = mockEscrowBookmark.deleteMany.mock.calls[0][0];
      expect(call1.where.userAddress).toBe('G123456789');
      expect(call1.where.escrowId).toBe(100n);
    });
  });

  describe('listBookmarks - listing bookmarks', () => {
    it('returns empty list when user has no bookmarks', async () => {
      mockRequest.params = { address: 'G123456789' };
      mockEscrowBookmark.findMany.mockResolvedValue([]);
      mockEscrowBookmark.count.mockResolvedValue(0);

      await listBookmarks(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        data: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });
    });

    it('returns paginated bookmarks with escrow details', async () => {
      mockRequest.params = { address: 'G123456789' };
      mockEscrowBookmark.findMany.mockResolvedValue([{ escrowId: 100n, createdAt: new Date() }]);
      mockEscrowBookmark.count.mockResolvedValue(1);
      mockEscrow.findMany.mockResolvedValue([
        {
          id: 100n,
          status: 'PENDING',
          totalAmount: 1000,
          remainingBalance: 1000,
          clientAddress: 'G111',
          freelancerAddress: 'G222',
          deadline: new Date(),
          createdAt: new Date(),
        },
      ]);

      await listBookmarks(mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ isBookmarked: true })]),
          total: 1,
        }),
      );
    });

    it('respects pagination parameters', async () => {
      mockRequest.params = { address: 'G123456789' };
      mockRequest.query = { page: '2', limit: '10' };
      mockEscrowBookmark.findMany.mockResolvedValue([]);
      mockEscrowBookmark.count.mockResolvedValue(50);

      await listBookmarks(mockRequest, mockResponse);

      const call = mockEscrowBookmark.findMany.mock.calls[0][0];
      expect(call.skip).toBe(10);
      expect(call.take).toBe(10);
    });

    it('limits max page size to 100', async () => {
      mockRequest.params = { address: 'G123456789' };
      mockRequest.query = { limit: '200' };
      mockEscrowBookmark.findMany.mockResolvedValue([]);
      mockEscrowBookmark.count.mockResolvedValue(0);
      mockEscrow.findMany.mockResolvedValue([]);

      await listBookmarks(mockRequest, mockResponse);

      expect(mockEscrowBookmark.findMany).toHaveBeenCalled();
      const call = mockEscrowBookmark.findMany.mock.calls[0][0];
      expect(call.take).toBeLessThanOrEqual(100);
    });

    it('orders bookmarks by creation date descending', async () => {
      mockRequest.params = { address: 'G123456789' };
      mockEscrowBookmark.findMany.mockResolvedValue([]);
      mockEscrowBookmark.count.mockResolvedValue(0);
      mockEscrow.findMany.mockResolvedValue([]);

      await listBookmarks(mockRequest, mockResponse);

      expect(mockEscrowBookmark.findMany).toHaveBeenCalled();
      const call = mockEscrowBookmark.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });
  });
});
