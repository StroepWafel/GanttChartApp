import { describe, it, expect } from 'vitest';
import { computeUrgency } from '../src/lib/priority.js';

describe('computeUrgency', () => {
  it('returns 0 for completed tasks', () => {
    expect(computeUrgency({ completed: true, base_priority: 5 })).toBe(0);
  });
  it('returns base priority when no due date', () => {
    expect(computeUrgency({ completed: false, base_priority: 5 })).toBe(5);
    expect(computeUrgency({ completed: false, base_priority: 10 })).toBe(10);
  });
  it('gives boost for overdue tasks', () => {
    const overdue = {
      completed: false,
      base_priority: 5,
      due_date: '2020-01-01',
    };
    expect(computeUrgency(overdue)).toBe(20);
  });
  it('gives higher urgency for tasks due soon', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const task = {
      completed: false,
      base_priority: 5,
      due_date: tomorrow.toISOString().slice(0, 10),
    };
    const score = computeUrgency(task);
    expect(score).toBeGreaterThan(5);
    expect(score).toBeLessThan(20);
  });
});
