import crypto from 'crypto';

// Derive a stable pseudonymous hash for a user within a window using SALT + cid + truncated IP + UA fragment
export function hashIdentity({ cid, ip, ua, salt }) {
  const truncatedIp = (ip || '').split(',')[0].trim().replace(/^(\d+\.\d+\.\d+).*$/, '$1'); // first 3 octets IPv4, leave IPv6 as-is (will just hash whole)
  const uaFrag = (ua || '').toLowerCase().slice(0, 80);
  const h = crypto.createHash('sha256');
  h.update(String(salt || '')); h.update('|');
  h.update(String(cid || '')); h.update('|');
  h.update(String(truncatedIp)); h.update('|');
  h.update(String(uaFrag));
  return h.digest('hex').slice(0, 48); // shorter key
}

