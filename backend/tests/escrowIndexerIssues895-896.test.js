import { describe, expect, it } from '@jest/globals';
import { validateResumeCursor } from '../services/escrowIndexer.js';

describe('escrowIndexer resume cursor — issues 895-896', () => {
  it('validates resume cursors against chain tip', () => {
    expect(validateResumeCursor(10, 20)).toBe(10);
    expect(() => validateResumeCursor(-1, 5)).toThrow(/Invalid/);
    expect(() => validateResumeCursor(99, 50)).toThrow(/ahead/);
  });
});