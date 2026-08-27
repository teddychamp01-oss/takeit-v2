// N17 — pure-logic tests for the network-quality classifier. The contract
// under test: missing signal is a SAFE DEFAULT (unconstrained — never
// disables UX), while saveData or a 2G-class link constrains optional
// traffic (prefetch, avatar loads).

import { describe, expect, it } from 'vitest';
import { classifyConnection, getNetQuality } from '../netQuality';

describe('classifyConnection', () => {
  it('defaults to unconstrained when navigator.connection is missing', () => {
    for (const connection of [undefined, null, {}]) {
      const q = classifyConnection(connection);
      expect(q.saveData).toBe(false);
      expect(q.effectiveType).toBeNull();
      expect(q.constrained).toBe(false);
    }
  });

  it('constrains when the user opted into data saving', () => {
    const q = classifyConnection({ saveData: true, effectiveType: '4g' });
    expect(q.saveData).toBe(true);
    expect(q.constrained).toBe(true);
  });

  it('constrains on 2G-class links, not on 3g/4g', () => {
    expect(classifyConnection({ effectiveType: 'slow-2g' }).constrained).toBe(
      true,
    );
    expect(classifyConnection({ effectiveType: '2g' }).constrained).toBe(true);
    expect(classifyConnection({ effectiveType: '3g' }).constrained).toBe(
      false,
    );
    expect(classifyConnection({ effectiveType: '4g' }).constrained).toBe(
      false,
    );
  });

  it('treats unknown effectiveType strings as no signal', () => {
    const q = classifyConnection({ effectiveType: '5g-ultra' });
    expect(q.effectiveType).toBeNull();
    expect(q.constrained).toBe(false);
  });

  it('handles truthy-but-not-true saveData strictly', () => {
    // Some polyfills expose saveData as undefined/0 — only `true` counts.
    expect(
      classifyConnection({ saveData: undefined, effectiveType: '4g' })
        .constrained,
    ).toBe(false);
  });
});

describe('getNetQuality', () => {
  it('never throws and returns the safe default in jsdom (no connection API)', () => {
    const q = getNetQuality();
    expect(q).toEqual({
      saveData: false,
      effectiveType: null,
      constrained: false,
    });
  });
});
