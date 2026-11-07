import { describe, expect, it } from 'vitest';
import { DASHBOARD_ID_PATTERN } from '../d.$slug';

describe('custom dashboard search ids', () => {
  it('accepts the bundled default dashboard ids, which are not RFC 4122 version UUIDs', () => {
    expect(DASHBOARD_ID_PATTERN.test('00000000-0000-0000-0000-000000000001')).toBe(true);
    expect(DASHBOARD_ID_PATTERN.test('d1000001-0000-0000-0000-000000000002')).toBe(true);
  });
  it('accepts a random v4 id and rejects other text', () => {
    expect(DASHBOARD_ID_PATTERN.test('3b241101-e2bb-4255-8caf-4136c566a962')).toBe(true);
    expect(DASHBOARD_ID_PATTERN.test('not-an-id')).toBe(false);
    expect(DASHBOARD_ID_PATTERN.test('3b241101e2bb42558caf4136c566a962')).toBe(false);
  });
});
