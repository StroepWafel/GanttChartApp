import { describe, it, expect } from 'vitest';
import { validateName, validateDateRange, validatePriority } from '../src/validation.js';

describe('validateName', () => {
  it('accepts valid names', () => {
    expect(validateName('Task 1').ok).toBe(true);
    expect(validateName('Task 1').value).toBe('Task 1');
  });
  it('trims whitespace', () => {
    expect(validateName('  foo  ').value).toBe('foo');
  });
  it('rejects null/undefined', () => {
    expect(validateName(null).ok).toBe(false);
    expect(validateName(undefined).ok).toBe(false);
  });
  it('rejects empty string', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
  });
  it('rejects names over 500 chars', () => {
    expect(validateName('a'.repeat(501)).ok).toBe(false);
  });
});

describe('validateDateRange', () => {
  it('accepts valid range', () => {
    expect(validateDateRange('2025-01-01', '2025-01-10').ok).toBe(true);
  });
  it('accepts same date', () => {
    expect(validateDateRange('2025-01-01', '2025-01-01').ok).toBe(true);
  });
  it('rejects start after end', () => {
    expect(validateDateRange('2025-01-10', '2025-01-01').ok).toBe(false);
  });
  it('returns ok when either missing', () => {
    expect(validateDateRange(null, '2025-01-01').ok).toBe(true);
    expect(validateDateRange('2025-01-01', null).ok).toBe(true);
  });
});

describe('validatePriority', () => {
  it('accepts 1-10', () => {
    expect(validatePriority(1).ok).toBe(true);
    expect(validatePriority(10).ok).toBe(true);
    expect(validatePriority(5).value).toBe(5);
  });
  it('returns default for null', () => {
    expect(validatePriority(null).ok).toBe(true);
    expect(validatePriority(null).value).toBe(5);
  });
  it('rejects out of range', () => {
    expect(validatePriority(0).ok).toBe(false);
    expect(validatePriority(11).ok).toBe(false);
  });
});
