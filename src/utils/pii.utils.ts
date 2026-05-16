export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function maskId(id: string | undefined): string {
  if (!id) return '(none)';
  return `${id.slice(0, 8)}…`;
}
