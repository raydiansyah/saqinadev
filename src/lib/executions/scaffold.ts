/**
 * A buildable starting app for a project whose repository is empty. The platform commits it before
 * the first agent writes anything, so every later task adds to something that already builds and
 * starts, and nobody depends on a model to get the basics (package.json, config, a page) right.
 * Pinned to the versions this platform itself runs on, so a fresh install resolves the same way.
 */
export interface ScaffoldFile {
  path: string;
  content: string;
}

const NEXT = "16.4.3";
const REACT = "19.3.1";

/** Root entries a new repository may already hold without being "a project": a readme, a licence. */
const NEUTRAL_ROOT =
  /^(readme(\.[a-z]+)?|license(\.[a-z]+)?|\.gitignore|\.gitattributes|\.editorconfig)$/i;

/** True when nothing at the root is code or configuration, so the app can be started from nothing. */
export function isEmptyRepo(root: ReadonlyArray<{ path: string; type: "file" | "dir" }>): boolean {
  return root.every((e) => {
    const name = e.path.split("/").pop() ?? e.path;
    return e.type === "file" && NEUTRAL_ROOT.test(name);
  });
}

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "app";

/** The files of the starting app. `title` is the project's name, shown on the first page. */
export function scaffoldFiles(title: string): ScaffoldFile[] {
  const safeTitle =
    title
      .replace(/[<>{}`\\]/g, "")
      .trim()
      .slice(0, 80) || "New project";
  const pkg = {
    name: slugOf(title),
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      typecheck: "tsc --noEmit",
    },
    dependencies: { next: NEXT, react: REACT, "react-dom": REACT },
    devDependencies: {
      "@types/node": "^24",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      typescript: "^5",
    },
  };
  return [
    { path: "package.json", content: `${JSON.stringify(pkg, null, 2)}\n` },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: false,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "react-jsx",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./src/*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "next.config.ts",
      content: `import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n`,
    },
    {
      path: ".gitignore",
      content:
        "node_modules\n.next\nout\n.env\n.env.local\n.env.*.local\n*.tsbuildinfo\nnext-env.d.ts\n.DS_Store\n",
    },
    {
      path: ".env.example",
      content:
        "# Copy to .env.local. The app starts without any of these; a feature that needs one says so on screen.\n",
    },
    {
      path: "src/app/layout.tsx",
      content: `import type { Metadata } from "next";\nimport "./globals.css";\n\nexport const metadata: Metadata = {\n  title: ${JSON.stringify(safeTitle)},\n};\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
    },
    {
      path: "src/app/page.tsx",
      content: `export default function Home() {\n  return (\n    <main>\n      <h1>${safeTitle.replace(/&/g, "&amp;")}</h1>\n      <p>This app is set up and running.</p>\n    </main>\n  );\n}\n`,
    },
    {
      path: "src/app/globals.css",
      content:
        "* { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; }\nmain { max-width: 64rem; margin: 0 auto; padding: 1.5rem 1rem; }\n",
    },
    {
      path: "README.md",
      content: `# ${safeTitle}\n\nA Next.js (App Router, TypeScript) app.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nBuild: \`npm run build\`. Environment variables are listed in \`.env.example\`; the app starts without them.\n`,
    },
  ];
}
