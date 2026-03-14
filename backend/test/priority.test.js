import { describe, it, expect } from 'vitest';
import { computeUrgency, compareByDateThenPriority, effectiveDate, isLeastImportant } from '../src/lib/priority.js';

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

describe('compareByDateThenPriority (most-important-task ordering)', () => {
  it('orders by effective date first: sooner due ranks higher', () => {
    const inSevenDays = new Date();
    inSevenDays.setDate(inSevenDays.getDate() + 7);
    const inThirtyDays = new Date();
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);
    const taskDueSoon = { base_priority: 3, due_date: inSevenDays.toISOString().slice(0, 10), end_date: inSevenDays.toISOString().slice(0, 10) };
    const taskDueLater = { base_priority: 8, due_date: inThirtyDays.toISOString().slice(0, 10), end_date: inThirtyDays.toISOString().slice(0, 10) };
    const sorted = [taskDueLater, taskDueSoon].sort(compareByDateThenPriority);
    expect(sorted[0]).toBe(taskDueSoon);
    expect(sorted[1]).toBe(taskDueLater);
  });

  it('puts priority 0 and 1 last (least important)', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const lowPriorityDueSoon = { base_priority: 1, due_date: tomorrow.toISOString().slice(0, 10), end_date: tomorrow.toISOString().slice(0, 10) };
    const highPriorityDueLater = { base_priority: 5, due_date: nextMonth.toISOString().slice(0, 10), end_date: nextMonth.toISOString().slice(0, 10) };
    const sorted = [lowPriorityDueSoon, highPriorityDueLater].sort(compareByDateThenPriority);
    expect(sorted[0]).toBe(highPriorityDueLater);
    expect(sorted[1]).toBe(lowPriorityDueSoon);
  });

  it('uses due_date over end_date as effective date', () => {
    expect(effectiveDate({ due_date: '2025-03-01', end_date: '2025-04-01' })).toBe('2025-03-01');
    expect(effectiveDate({ end_date: '2025-04-01' })).toBe('2025-04-01');
    expect(effectiveDate({})).toBe(null);
  });

  it('treats priority 0 and 1 as least important', () => {
    expect(isLeastImportant({ base_priority: 0 })).toBe(true);
    expect(isLeastImportant({ base_priority: 1 })).toBe(true);
    expect(isLeastImportant({ base_priority: 2 })).toBe(false);
    expect(isLeastImportant({ base_priority: 5 })).toBe(false);
    expect(isLeastImportant({})).toBe(false);
  });

  it('sorts by base_priority descending when effective dates tie', () => {
    const sameDate = '2025-06-15';
    const a = { base_priority: 5, due_date: sameDate, end_date: sameDate };
    const b = { base_priority: 8, due_date: sameDate, end_date: sameDate };
    const sorted = [a, b].sort(compareByDateThenPriority);
    expect(sorted[0]).toBe(b);
    expect(sorted[1]).toBe(a);
  });
});
