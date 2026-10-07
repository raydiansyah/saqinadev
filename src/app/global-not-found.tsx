import "./globals.css";

/** Unmatched URLs outside a locale (the proxy redirects most of them). Links back to real pages. */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-background p-8 text-foreground">
        <main className="max-w-md text-center">
          <p className="font-mono text-sm text-primary">404</p>
          <h1 className="mt-3 text-2xl font-semibold">Page not found</h1>
          <p className="mt-6 flex justify-center gap-6">
            <a className="text-primary hover:underline" href="/en">
              English
            </a>
            <a className="text-primary hover:underline" href="/id">
              Bahasa Indonesia
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
