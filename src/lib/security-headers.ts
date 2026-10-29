/**
 * Response headers for every route. The CSP keeps inline scripts and styles allowed because
 * Next.js emits inline bootstrap scripts and a per-nonce policy would force every page to
 * render dynamically; everything else is locked to this origin plus Cloudflare Turnstile.
 */

type Header = { key: string; value: string };

export function contentSecurityPolicy(isDev: boolean): string {
  const turnstile = "https://challenges.cloudflare.com";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-eval' only in development: React's debugging tools and HMR need it.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), turnstile],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Service images are admin-provided https URLs, so any https origin may be an image source.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", turnstile, ...(isDev ? ["ws:", "wss:"] : [])],
    // The Studio's Preview frames the published project (a *.saqina.dev, *.vercel.app or the
    // client's own domain). The frame is sandboxed and Saqina's own pages cannot be framed.
    "frame-src": [turnstile, "https:"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    ...(isDev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

export function securityHeaders(isDev: boolean): Header[] {
  const headers: Header[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  // HSTS only where TLS is guaranteed; on localhost it would pin the browser to https.
  if (!isDev)
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  return headers;
}
