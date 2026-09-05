import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  formatDate,
  isIsoDate,
  parseDateInput,
  today,
} from './dates.js';

describe('isIsoDate', () => {
  it('accepts real dates', () => {
    expect(isIsoDate('2026-09-04')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true); // leap year
  });

  it('rejects malformed and impossible dates', () => {
    expect(isIsoDate('2026-9-4')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2025-02-29')).toBe(false); // not a leap year
    expect(isIsoDate('yesterday')).toBe(false);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts days across month and year boundaries', () => {
    expect(addDays('2026-09-04', 1)).toBe('2026-09-05');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('does not drift across a daylight-saving boundary', () => {
    // Late March and late October are where local-time arithmetic breaks.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('clamps when adding months to a long month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-08-15', 3)).toBe('2026-11-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-09-01', '2026-09-04')).toBe(3);
    expect(daysBetween('2026-09-04', '2026-09-01')).toBe(-3);
    expect(daysBetween('2026-09-04', '2026-09-04')).toBe(0);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('parseDateInput', () => {
  const ref = '2026-09-04'; // a Friday

  it('passes through ISO dates', () => {
    expect(parseDateInput('2026-08-12', ref)).toBe('2026-08-12');
  });

  it('understands relative words', () => {
    expect(parseDateInput('today', ref)).toBe('2026-09-04');
    expect(parseDateInput('yesterday', ref)).toBe('2026-09-03');
    expect(parseDateInput('tomorrow', ref)).toBe('2026-09-05');
    expect(parseDateInput('  YESTERDAY  ', ref)).toBe('2026-09-03');
  });

  it('understands day offsets', () => {
    expect(parseDateInput('-3', ref)).toBe('2026-09-01');
    expect(parseDateInput('+2', ref)).toBe('2026-09-06');
    expect(parseDateInput('-10 days', ref)).toBe('2026-08-25');
  });

  it('understands day-and-month forms', () => {
    expect(parseDateInput('3 aug', ref)).toBe('2026-08-03');
    expect(parseDateInput('3rd august', ref)).toBe('2026-08-03');
    expect(parseDateInput('aug 3', ref)).toBe('2026-08-03');
    expect(parseDateInput('12 aug 2025', ref)).toBe('2025-08-12');
  });

  it('reads numeric dates day-first', () => {
    expect(parseDateInput('12/8', ref)).toBe('2026-08-12');
    expect(parseDateInput('12/8/2025', ref)).toBe('2025-08-12');
    expect(parseDateInput('12-8-25', ref)).toBe('2025-08-12');
  });

  it('understands relative weekdays', () => {
    // Reference is Friday 4 Sep 2026.
    expect(parseDateInput('last monday', ref)).toBe('2026-08-31');
    expect(parseDateInput('next monday', ref)).toBe('2026-09-07');
    expect(parseDateInput('monday', ref)).toBe('2026-08-31');
    expect(parseDateInput('wed', ref)).toBe('2026-09-02');
  });

  it('returns null for anything it does not recognise', () => {
    expect(parseDateInput('', ref)).toBeNull();
    expect(parseDateInput('sometime soon', ref)).toBeNull();
    expect(parseDateInput('32/1/2026', ref)).toBeNull();
    expect(parseDateInput('30 feb', ref)).toBeNull();
    expect(parseDateInput('blah', ref)).toBeNull();
  });
});

describe('formatDate', () => {
  const ref = '2026-09-04';

  it('names nearby days', () => {
    expect(formatDate('2026-09-04', ref)).toBe('Today');
    expect(formatDate('2026-09-03', ref)).toBe('Yesterday');
    expect(formatDate('2026-09-05', ref)).toBe('Tomorrow');
  });

  it('omits the year within the reference year, and includes it otherwise', () => {
    expect(formatDate('2026-08-12', ref)).toBe('12 Aug');
    expect(formatDate('2025-08-12', ref)).toBe('12 Aug 2025');
  });
});

describe('today', () => {
  it('returns a well-formed local calendar date', () => {
    expect(isIsoDate(today())).toBe(true);
  });

  it('uses local wall-clock date, not UTC', () => {
    // 23:30 local on 4 Sep is still 4 Sep, even where UTC has rolled over.
    const late = new Date(2026, 8, 4, 23, 30, 0);
    expect(today(late)).toBe('2026-09-04');
    const early = new Date(2026, 8, 4, 0, 30, 0);
    expect(today(early)).toBe('2026-09-04');
  });
});
