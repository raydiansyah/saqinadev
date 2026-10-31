/**
 * pg 8 treats `sslmode=prefer`, `require` and `verify-ca` as `verify-full`; pg 9 will follow libpq
 * and verify less. Writing `verify-full` keeps today's behaviour on both, and silences the
 * "SECURITY WARNING" pg prints for the old spellings.
 */
export function withVerifiedSsl(url: string): string {
  return url.replace(/([?&])sslmode=(?:prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}
