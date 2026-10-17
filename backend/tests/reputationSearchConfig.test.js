import { describe, expect, it } from '@jest/globals';
import { readReputationSearchConfig } from '../services/reputationSearchService.js';

describe('reputation search configuration', () => {
  it('accepts bounded settings', () => {
    expect(
      readReputationSearchConfig({
        REPUTATION_SEARCH_TIMEOUT_MS: '1000',
        REPUTATION_SEARCH_SYNC_BATCH: '250',
      }),
    ).toEqual({ requestTimeout: 1000, syncBatchSize: 250 });
  });

  it('rejects malformed bounds', () => {
    expect(() => readReputationSearchConfig({ REPUTATION_SEARCH_TIMEOUT_MS: 'fast' })).toThrow(
      'REPUTATION_SEARCH_TIMEOUT_MS',
    );
  });

  it('rejects API credentials without an endpoint', () => {
    expect(() => readReputationSearchConfig({ ELASTICSEARCH_API_KEY: 'configured' })).toThrow(
      'ELASTICSEARCH_URL',
    );
  });
});
