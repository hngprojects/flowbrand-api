import { formatDevice } from '../utils/parse-user-agent.util';

const SEP = '·';

describe('formatDevice', () => {
  it('returns null for null, undefined or empty input', () => {
    expect(formatDevice(null)).toBeNull();
    expect(formatDevice(undefined)).toBeNull();
    expect(formatDevice('')).toBeNull();
  });

  it('parses Chrome on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
    expect(formatDevice(ua)).toBe(`Chrome 134 ${SEP} macOS 10.15.7`);
  });

  it('parses Firefox on Windows 10', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';
    expect(formatDevice(ua)).toBe(`Firefox 132 ${SEP} Windows 10`);
  });

  it('parses Safari on iOS', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
    expect(formatDevice(ua)).toBe(`Safari 17 ${SEP} iOS 17.1`);
  });

  it('detects Edge before Chrome (Edge embeds the Chrome token)', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0';
    expect(formatDevice(ua)).toBe(`Edge 134 ${SEP} Windows 10`);
  });

  it('parses Chrome on Android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/134.0.0.0 Mobile Safari/537.36';
    expect(formatDevice(ua)).toBe(`Chrome 134 ${SEP} Android 14`);
  });

  it('returns the browser alone when the OS is unrecognised', () => {
    const ua = 'Mozilla/5.0 (Unknown) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0';
    expect(formatDevice(ua)).toBe('Chrome 134');
  });

  it('returns null when neither browser nor OS can be identified', () => {
    expect(formatDevice('curl/8.4.0')).toBeNull();
  });
});
