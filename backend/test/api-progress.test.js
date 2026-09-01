import { describe, it, expect } from 'vitest';
import { normalizeProgress } from '../src/lib/taskProgress.js';

describe('normalizeProgress', () => {
  it('returns 0 for nullish and invalid values', () => {
    expect(normalizeProgress(null)).toBe(0);
    expect(normalizeProgress(undefined)).toBe(0);
    expect(normalizeProgress('')).toBe(0);
    expect(normalizeProgress('abc')).toBe(0);
  });

  it('clamps to 0–100 and rounds', () => {
    expect(normalizeProgress(67)).toBe(67);
    expect(normalizeProgress(67.4)).toBe(67);
    expect(normalizeProgress(67.6)).toBe(68);
    expect(normalizeProgress(-5)).toBe(0);
    expect(normalizeProgress(150)).toBe(100);
    expect(normalizeProgress('42')).toBe(42);
  });
});
