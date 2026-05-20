import { maskId, maskEmail, maskSessionId } from './pii';

describe('maskId', () => {
  it('masks a plain ID keeping last 4 characters', () => {
    expect(maskId('abc123def456')).toBe('usr_****f456');
  });

  it('honours an existing prefix in the ID', () => {
    expect(maskId('usr_abc123def456')).toBe('usr_****f456');
  });

  it('uses the provided prefix when no underscore present', () => {
    expect(maskId('abc123def456', 'svc')).toBe('svc_****f456');
  });

  it('returns safe fallback for IDs shorter than 4 characters', () => {
    expect(maskId('abc')).toBe('usr_****');
  });

  it('returns safe fallback for empty string', () => {
    expect(maskId('')).toBe('usr_****');
  });

  it('returns safe fallback for null-ish input', () => {
    expect(maskId(null)).toBe('usr_****');
  });
});

describe('maskSessionId', () => {
  it('masks with sess prefix', () => {
    expect(maskSessionId('xyz987abc123')).toBe('sess_****c123');
  });

  it('honours existing sess prefix', () => {
    expect(maskSessionId('sess_xyz987abc123')).toBe('sess_****c123');
  });
});

describe('maskEmail', () => {
  it('masks email showing only first character of local part', () => {
    expect(maskEmail('alice@example.com')).toBe('a****@example.com');
  });

  it('handles single character local part', () => {
    expect(maskEmail('a@example.com')).toBe('a****@example.com');
  });

  it('handles two character local part', () => {
    expect(maskEmail('ab@example.com')).toBe('a****@example.com');
  });

  it('preserves domain exactly', () => {
    expect(maskEmail('user@sub.domain.co.uk')).toBe('u****@sub.domain.co.uk');
  });

  it('returns unknown for empty string', () => {
    expect(maskEmail('')).toBe('unknown');
  });

  it('returns invalid for string without @', () => {
    expect(maskEmail('notanemail')).toBe('invalid');
  });

  it('returns unknown for null-ish input', () => {
    expect(maskEmail(null as any)).toBe('unknown');
  });
});
