import { jest } from '@jest/globals';

const suggestionsServiceMock = { getSuggestions: jest.fn() };
const prismaMock = {};
const searchServiceMock = {
  search: jest.fn(),
  suggest: jest.fn(),
  getAnalytics: jest.fn(),
  reindex: jest.fn(),
};

jest.unstable_mockModule('../services/suggestionsService.js', () => ({
  default: suggestionsServiceMock,
}));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/searchService.js', () => ({ default: searchServiceMock }));

const { default: searchController } = await import('../api/controllers/searchController.js');

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchController.getAutocompleteSuggestions', () => {
  it('delegates to suggestionsService keyed by the authenticated user', async () => {
    suggestionsServiceMock.getSuggestions.mockResolvedValue({
      escrows: [{ id: '1', title: 'Foo project' }],
      users: [],
      tags: [],
    });

    const req = { query: { q: 'foo' }, user: { userId: 7 } };
    const res = createMockRes();

    await searchController.getAutocompleteSuggestions(req, res);

    expect(suggestionsServiceMock.getSuggestions).toHaveBeenCalledWith(prismaMock, 7, 'foo');
    expect(res.body.escrows).toHaveLength(1);
  });

  it('returns 500 with a helpful error when the service throws', async () => {
    suggestionsServiceMock.getSuggestions.mockRejectedValue(new Error('boom'));

    const req = { query: { q: 'foo' }, user: { userId: 7 } };
    const res = createMockRes();

    await searchController.getAutocompleteSuggestions(req, res);

    expect(res.statusCode).toBe(500);
  });
});
