/**
 * Post-deploy smoke test against a running site. Read-only except for one deliberately
 * unauthenticated sign-in request that must be refused.
 *
 *   pnpm smoke https://saqina.dev
 *   pnpm smoke http://localhost:3101
 */

let base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: pnpm smoke <base-url>   e.g. pnpm smoke https://saqina.dev");
  process.exit(1);
}

type Result = { name: string; ok: boolean; note?: string; warn?: boolean };
const results: Result[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note });
const warn = (name: string, note: string) => results.push({ name, ok: true, warn: true, note });

const get = (path: string, init?: RequestInit) =>
  fetch(`${base}${path}`, { redirect: "manual", ...init });

/** A domain that redirects to its canonical host (apex to www, or the reverse) is followed once. */
async function resolveCanonicalHost() {
  const res = await fetch(`${base}/api/health`, { redirect: "manual" });
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location) {
    const target = new URL(location, base);
    if (target.origin !== base) {
      console.log(`NOTE  ${base} redirects to ${target.origin}; checking that host instead\n`);
      base = target.origin;
    }
  }
}

async function main() {
  await resolveCanonicalHost();
  const health = await get("/api/health");
  const body = (await health.json().catch(() => ({}))) as { status?: string; database?: boolean };
  check(
    "health endpoint reports ok",
    health.status === 200 && body.status === "ok" && body.database === true,
    `status ${health.status}`,
  );

  const home = await get("/en");
  check("home page loads", home.status === 200, `status ${home.status}`);
  const h = home.headers;
  check("CSP present", (h.get("content-security-policy") ?? "").includes("default-src 'self'"));
  check("clickjacking blocked", h.get("x-frame-options") === "DENY");
  check("nosniff set", h.get("x-content-type-options") === "nosniff");
  check("referrer policy set", Boolean(h.get("referrer-policy")));
  check("framework not advertised", !h.get("x-powered-by"));
  if (base.startsWith("https://"))
    check("HSTS set", (h.get("strict-transport-security") ?? "").includes("max-age"));

  check("services page loads", (await get("/en/services")).status === 200);
  check("unknown page is 404", (await get("/en/this-page-does-not-exist")).status === 404);

  const sitemap = await get("/sitemap.xml");
  check("sitemap served", sitemap.status === 200 && (await sitemap.text()).includes("<urlset"));
  const robots = await get("/robots.txt");
  check(
    "robots hides private areas",
    robots.status === 200 && (await robots.text()).includes("Disallow: /api/"),
  );

  const dash = await get("/en/dashboard");
  check(
    "dashboard redirects anonymous visitors to sign-in",
    dash.status >= 300 &&
      dash.status < 400 &&
      (dash.headers.get("location") ?? "").includes("sign-in"),
    `status ${dash.status}`,
  );

  for (const path of ["/api/cron/reminders", "/api/cron/maintenance"]) {
    const res = await get(path);
    check(
      `${path} refuses anonymous calls`,
      res.status === 401 || res.status === 503,
      `status ${res.status}`,
    );
  }

  const signIn = await get("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: "smoke@example.invalid", password: "not-a-real-password-1!" }),
  });
  const signInBody = (await signIn.json().catch(() => ({}))) as { code?: string };
  if (signInBody.code === "MISSING_RESPONSE") check("captcha enforced on sign-in", true);
  else
    warn(
      "captcha enforced on sign-in",
      `captcha is OFF here (got ${signIn.status} ${signInBody.code ?? ""})`,
    );
}

main()
  .catch((error) => check("smoke run completed", false, String(error)))
  .finally(() => {
    for (const r of results)
      console.log(
        `${r.warn ? "WARN" : r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`,
      );
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  });
