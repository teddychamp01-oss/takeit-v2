// Unit tests for the admin feature's pure logic (validation, mapping,
// masking, action gating). No I/O — these must run without a network.

import { describe, expect, it } from 'vitest';
import {
  approvedLevelForMethod,
  availableDisputeActions,
  availableReportActions,
  bumpTargetLevel,
  classifyUserQuery,
  DECISION_NOTES_MAX,
  escapeIlike,
  LEVEL_RANK,
  listWasCapped,
  maskIdentifier,
  shortId,
  USER_QUERY_MAX,
  validateDecision,
} from '../logic';

describe('approvedLevelForMethod / bumpTargetLevel', () => {
  it('maps manual_id to id_verified and fayda_ekyc to fayda_verified', () => {
    expect(approvedLevelForMethod('manual_id')).toBe('id_verified');
    expect(approvedLevelForMethod('fayda_ekyc')).toBe('fayda_verified');
  });

  it('bumps upward from lower levels', () => {
    expect(bumpTargetLevel('manual_id', 'none')).toBe('id_verified');
    expect(bumpTargetLevel('manual_id', 'basic')).toBe('id_verified');
    expect(bumpTargetLevel('fayda_ekyc', 'id_verified')).toBe('fayda_verified');
  });

  it('NEVER downgrades: equal or higher current level means no change', () => {
    expect(bumpTargetLevel('manual_id', 'id_verified')).toBeNull();
    expect(bumpTargetLevel('manual_id', 'fayda_verified')).toBeNull();
    expect(bumpTargetLevel('manual_id', 'pro_certified')).toBeNull();
    expect(bumpTargetLevel('fayda_ekyc', 'fayda_verified')).toBeNull();
    expect(bumpTargetLevel('fayda_ekyc', 'pro_certified')).toBeNull();
  });

  it('rank table mirrors verification_level_rank() in 000400 exactly', () => {
    expect(LEVEL_RANK).toEqual({
      none: 0,
      basic: 1,
      id_verified: 2,
      fayda_verified: 3,
      pro_certified: 4,
    });
  });
});

describe('validateDecision', () => {
  it('approves without notes (notes become null)', () => {
    expect(validateDecision('approved', '')).toEqual({ ok: true, notes: null });
    expect(validateDecision('approved', '   ')).toEqual({
      ok: true,
      notes: null,
    });
  });

  it('keeps trimmed notes when present', () => {
    expect(validateDecision('approved', '  looks good  ')).toEqual({
      ok: true,
      notes: 'looks good',
    });
  });

  it('REQUIRES notes on reject', () => {
    expect(validateDecision('rejected', '')).toEqual({
      ok: false,
      error: 'notes_required',
    });
    expect(validateDecision('rejected', '  \n ')).toEqual({
      ok: false,
      error: 'notes_required',
    });
    expect(validateDecision('rejected', 'blurry photo')).toEqual({
      ok: true,
      notes: 'blurry photo',
    });
  });

  it('bounds notes at the DB CHECK limit (2000)', () => {
    const atLimit = 'x'.repeat(DECISION_NOTES_MAX);
    expect(validateDecision('rejected', atLimit)).toEqual({
      ok: true,
      notes: atLimit,
    });
    expect(validateDecision('rejected', 'x'.repeat(DECISION_NOTES_MAX + 1)))
      .toEqual({ ok: false, error: 'notes_too_long' });
  });
});

describe('classifyUserQuery (law 4: fuzzy input is length-bounded)', () => {
  it('rejects sub-minimum input', () => {
    expect(classifyUserQuery('')).toEqual({ kind: 'too_short' });
    expect(classifyUserQuery('a')).toEqual({ kind: 'too_short' });
    expect(classifyUserQuery('  a  ')).toEqual({ kind: 'too_short' });
  });

  it('detects a UUID and lowercases it', () => {
    const id = '3F2504E0-4F89-11D3-9A0C-0305E82C3301';
    expect(classifyUserQuery(id)).toEqual({
      kind: 'id',
      id: id.toLowerCase(),
    });
  });

  it('builds an escaped contains-pattern for names', () => {
    expect(classifyUserQuery('Abebe')).toEqual({
      kind: 'name',
      pattern: '%Abebe%',
    });
  });

  it('escapes ILIKE metacharacters so input cannot widen the match', () => {
    expect(classifyUserQuery('100%_a')).toEqual({
      kind: 'name',
      pattern: '%100\\%\\_a%',
    });
  });

  it('truncates oversized input instead of sending it unbounded', () => {
    const long = 'y'.repeat(500);
    const result = classifyUserQuery(long);
    expect(result.kind).toBe('name');
    if (result.kind === 'name') {
      // %…% wrapper plus at most USER_QUERY_MAX payload chars (no escapes here)
      expect(result.pattern.length).toBe(USER_QUERY_MAX + 2);
    }
  });
});

describe('escapeIlike', () => {
  it('escapes backslash, percent and underscore', () => {
    expect(escapeIlike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
  it('leaves normal text (incl. Ethiopic) untouched', () => {
    expect(escapeIlike('አበበ Abebe')).toBe('አበበ Abebe');
  });
});

describe('maskIdentifier (PII masked by default)', () => {
  it('keeps only first and last character', () => {
    expect(maskIdentifier('123456789')).toBe('1••••9');
  });
  it('fully masks short values — degrades HEAVIER, never lighter', () => {
    expect(maskIdentifier('abc')).toBe('••••');
    expect(maskIdentifier('')).toBe('••••');
  });
  it('never echoes the middle of the value', () => {
    const masked = maskIdentifier('telegram_998877');
    expect(masked).not.toContain('9988');
    expect(masked).toBe('t••••7');
  });
});

describe('report/dispute action gating', () => {
  it('open offers review/resolve/dismiss (≤3 primary actions)', () => {
    expect(availableReportActions('open')).toEqual([
      'reviewing',
      'resolved',
      'dismissed',
    ]);
    expect(availableDisputeActions('open')).toEqual([
      'reviewing',
      'resolved',
      'dismissed',
    ]);
  });
  it('reviewing offers only resolve/dismiss', () => {
    expect(availableReportActions('reviewing')).toEqual([
      'resolved',
      'dismissed',
    ]);
    expect(availableDisputeActions('reviewing')).toEqual([
      'resolved',
      'dismissed',
    ]);
  });
  it('terminal states offer nothing', () => {
    expect(availableReportActions('resolved')).toEqual([]);
    expect(availableReportActions('dismissed')).toEqual([]);
    expect(availableDisputeActions('resolved')).toEqual([]);
    expect(availableDisputeActions('dismissed')).toEqual([]);
  });
});

describe('display helpers', () => {
  it('shortId truncates long ids and keeps short ones', () => {
    expect(shortId('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('3f2504e0…');
    expect(shortId('abc')).toBe('abc');
  });

  it('listWasCapped reports drops and only drops (law 6)', () => {
    expect(listWasCapped(50, 51)).toBe(true);
    expect(listWasCapped(50, 50)).toBe(false);
    expect(listWasCapped(50, null)).toBe(false);
    expect(listWasCapped(0, 0)).toBe(false);
  });
});
