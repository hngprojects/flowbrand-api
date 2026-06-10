/**
 * Dependency-free User-Agent formatter for the admin logs feed.
 *
 * Produces a compact "Browser Major · OS Version" label (for example
 * "Chrome 134 · macOS 10.15.7") to match the activity-log design. An offline
 * geo/UA parsing library would have been a new dependency, which the team
 * blocks, so this parses the common browsers and platforms by hand.
 *
 * Caveat: modern browsers freeze the high-entropy OS version in the legacy UA
 * string (macOS is pinned at 10_15_7, Windows 11 still reports NT 10.0), so the
 * OS portion is best-effort. Returns null when nothing recognisable is found.
 */

/** Middle dot (U+00B7) used as the browser/OS separator in the design. */
const SEPARATOR = '·';

interface ParsedAgent {
  name: string;
  version: string | null;
}

export function formatDevice(userAgent: string | null | undefined): string | null {
  if (!userAgent) {
    return null;
  }

  const browser = parseBrowser(userAgent);
  const os = parseOs(userAgent);
  const browserLabel = browser ? joinNameVersion(browser) : null;
  const osLabel = os ? joinNameVersion(os) : null;

  if (browserLabel && osLabel) {
    return `${browserLabel} ${SEPARATOR} ${osLabel}`;
  }

  return browserLabel ?? osLabel;
}

function joinNameVersion(parsed: ParsedAgent): string {
  return parsed.version ? `${parsed.name} ${parsed.version}` : parsed.name;
}

/** Order matters: Edge and Opera embed "Chrome", and Chrome embeds "Safari". */
function parseBrowser(ua: string): ParsedAgent | null {
  const edge = /Edg(?:e|A|iOS)?\/(\d+)/.exec(ua);
  if (edge) {
    return { name: 'Edge', version: edge[1] };
  }

  const opera = /(?:OPR|Opera)\/(\d+)/.exec(ua);
  if (opera) {
    return { name: 'Opera', version: opera[1] };
  }

  const firefox = /(?:Firefox|FxiOS)\/(\d+)/.exec(ua);
  if (firefox) {
    return { name: 'Firefox', version: firefox[1] };
  }

  const chrome = /(?:Chrome|CriOS)\/(\d+)/.exec(ua);
  if (chrome) {
    return { name: 'Chrome', version: chrome[1] };
  }

  if (/Safari\//.test(ua)) {
    const version = /Version\/(\d+)/.exec(ua);
    return { name: 'Safari', version: version ? version[1] : null };
  }

  return null;
}

/** iOS is checked before macOS because iPad UAs can also mention "Mac OS X". */
function parseOs(ua: string): ParsedAgent | null {
  const windows = /Windows NT (\d+\.\d+)/.exec(ua);
  if (windows) {
    return { name: 'Windows', version: mapWindowsVersion(windows[1]) };
  }

  const ios = /(?:iPhone OS|CPU OS) (\d+(?:_\d+)*)/.exec(ua);
  if (ios) {
    return { name: 'iOS', version: ios[1].replace(/_/g, '.') };
  }

  const mac = /Mac OS X (\d+(?:_\d+)*)/.exec(ua);
  if (mac) {
    return { name: 'macOS', version: mac[1].replace(/_/g, '.') };
  }

  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) {
    return { name: 'Android', version: android[1] };
  }

  if (/Linux/.test(ua)) {
    return { name: 'Linux', version: null };
  }

  return null;
}

/** Maps Windows NT kernel versions to their marketing names where well known. */
function mapWindowsVersion(ntVersion: string): string {
  const marketingNames: Record<string, string> = {
    '10.0': '10',
    '6.3': '8.1',
    '6.2': '8',
    '6.1': '7',
  };

  return marketingNames[ntVersion] ?? ntVersion;
}
