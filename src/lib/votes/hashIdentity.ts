import crypto from 'crypto';

export function hashIdentity({ cid, ip, ua, salt }: { cid?: string | number; ip?: string; ua?: string; salt?: string }): string {
  const truncatedIp = String(ip || '')
    .split(',')[0]
    .trim()
    .replace(/^(\d+\.\d+\.\d+).*$/, '$1'); // first 3 octets IPv4, leave IPv6 as-is
  const uaFrag = String(ua || '').toLowerCase().slice(0, 80);
  const h = crypto.createHash('sha256');
  h.update(String(salt || '')); h.update('|');
  h.update(String(cid || '')); h.update('|');
  h.update(String(truncatedIp)); h.update('|');
  h.update(String(uaFrag));
  return h.digest('hex').slice(0, 48);
}
