export function parseDurationMs(duration: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(d|h|m|s)?$/.exec(duration.trim());
  if (!match) throw new Error(`Unparseable duration: "${duration}"`);
  const value = parseFloat(match[1]);
  switch (match[2]) {
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'm': return value * 60 * 1000;
    case 's': return value * 1000;
    default:  return value;
  }
}
