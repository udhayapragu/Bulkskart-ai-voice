import { describe, expect, it } from 'vitest';
import { LEAD_LABELS, LEAD_STATUSES, formatDuration, titleCase } from './format';

describe('dashboard labels', () => {
  it('uses the five required lead statuses with the required wording', () => {
    expect(LEAD_STATUSES).toEqual(['new', 'interested', 'not_interested', 'callback_requested', 'registered']);
    expect(Object.values(LEAD_LABELS)).toEqual(['New', 'Interested', 'Not Interested', 'Callback Requested', 'Registered']);
  });

  it('formats call durations as m:ss', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(null)).toBe('—');
  });

  it('title-cases snake_case values', () => {
    expect(titleCase('no_answer')).toBe('No answer');
  });
});
