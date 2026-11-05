# Design theme and landing pages

Two different things carry the word "theme" here, so this page keeps them apart:

1. **Saqina's own look**: the colours and fonts of saqina.dev and the team area.
2. **The UI themes and landing page concepts Saqina recommends** to a client for the project they are
   building. These are data, picked in the project interview.

## 1. Saqina's own look

Defined once as CSS variables in `src/app/globals.css` (Tailwind 4 `@theme inline`). Components use the
tokens, never raw colours.

| Token | Value | Use |
|---|---|---|
| `--background` | `oklch(0.165 0.006 50)` | Page, warm graphite |
| `--surface`, `--surface-raised` | `oklch(0.2 …)`, `oklch(0.232 …)` | Cards and panels |
| `--foreground` | `oklch(0.965 0.004 70)` | Text |
| `--primary` | `oklch(0.71 0.18 32)`, coral `#FF6A55` | The main action and focus ring |
| `--success`, `--info`, `--warning`, `--error` | green, blue, amber, red | Status only, never decoration |

- One scheme: dark. `color-scheme: dark`; there is no light mode.
- Fonts: Geist and Geist Mono (`next/font/google`, set in `src/app/[locale]/layout.tsx`).
- Green stays separate from the coral brand colour so "paid" and "done" never read as branding.
- A client portal can be branded within limits ([white label](standards/white-label.md)).
- Rules for interface work: [UI and UX standard](standards/ui-ux.md) and the antislop skills.

## 2. The public landing page (saqina.dev)

`src/app/[locale]/(marketing)/page.tsx`, text in `src/content/site/{en,id}.ts`, parts in
`src/components/landing/`. Five sections, in this order:

| Section | Component | What it shows |
|---|---|---|
| Hero | `hero.tsx`, `hero-scene.tsx` | "From idea and deal to build and maintenance", with cards for client, scope, invoice, build and maintenance |
| Lifecycle | `lifecycle.tsx` | Nine steps, one project: idea, client, scope, agreement, payment, build, review, delivery, maintenance. It advances by itself, never with reduced motion, and can be paused |
| Pillars | `pillars.tsx` | Three connected parts: one project, the client portal, and Ask Saqina (the assistant) |
| Interactive demo | `interactive-demo.tsx`, `prompt-cycle.tsx` | A visitor describes a project and sees how Saqina reads it. It runs in the browser: no AI call, nothing saved |
| Final call to action | `final-cta.tsx` | Start a project, or try the preview |

Also on the site: `/services` and `/themes` (the theme gallery below). The page has JSON-LD for the
organisation and the application, in English and Indonesian.

## 3. UI themes Saqina can recommend (21)

Source: `src/content/ui-themes.ts`. A theme is plain data (colours, radius, border width, shadow, font
family); the preview turns it into CSS variables, so there is no second style system. Names and reasons
are in the interview copy (`src/lib/interview/copy`). The public gallery is at `/themes`.

A **tier** says how freely a theme is offered:

- **recommended**: safe for everyday work screens, suggested automatically.
- **available**: calm and readable, offered but never forced.
- **concept**: expressive, only on an explicit choice, and needs extra care for accessibility.

| Category | Theme (tier, scheme) |
|---|---|
| SaaS | `software` (recommended, light), `modern-dark` (recommended, dark), `financial` (recommended, dark), `professional` (recommended, light) |
| Minimal | `swiss-minimalist` (recommended, light), `monochrome` (available, light), `bauhaus` (available, light), `industrial` (available, dark), `art-deco` (concept, dark) |
| Media | `luxury` (available, light), `newsprint` (available, light), `claymorphism` (concept, light), `kinetic` (concept, dark) |
| Organic | `botanical` (available, light), `organic` (available, light) |
| Creative | `cyberpunk`, `terminal`, `neo-brutalism`, `playful-geometric`, `sketch`, `retro` (all concept; `cyberpunk` and `terminal` dark, the rest light) |

**How one is chosen** (`src/lib/interview/rules/theme.ts`): by project type. The first entry is the
suggestion, the rest are alternatives. A concept theme is never recommended automatically.

| Project type | Suggested, then alternatives |
|---|---|
| SaaS | modern-dark, software, professional |
| Internal dashboard, POS, mobile backend, custom | software or professional first |
| AI application | modern-dark, financial, software |
| Learning platform, school website | botanical, professional, software |
| Portfolio | swiss-minimalist, luxury, monochrome |
| Company profile | professional, swiss-minimalist, luxury |
| Marketplace, e-commerce | software, luxury, professional or swiss-minimalist |
| Booking | professional, botanical, software |

A project with no interface (a mobile backend) gets no theme recommendation. If the person picks another
theme, Saqina keeps it and says why it suggested a different one.

## 4. Landing page concepts Saqina can recommend (18)

Source: `src/content/landing-concepts.ts`, rules in `src/lib/interview/rules/landing.ts`. A project gets
**one primary concept and at most two supporting ones**, with no duplicates. They are recommendations,
not fixed rules, and the person can change them ("Change concept").

| Category | Concepts |
|---|---|
| Story | `cinematic-scroll`, `guided-narrative`, `product-led` |
| Interaction | `interactive-demo`, `feature-choreography`, `pinned-stage`, `before-after` |
| Spatial | `product-3d`, `horizontal-rail`, `layered-parallax` |
| System | `dashboard-journey`, `system-map`, `data-viz-narrative`, `file-to-result` |
| Conversion | `conversion-minimal` |
| Foundation | `adaptive-motion`, `motion-system`, `performance-seo` |

Starting point by project type (first is the primary):

| Project type | Concepts |
|---|---|
| SaaS | product-led, dashboard-journey, interactive-demo |
| Internal dashboard | dashboard-journey, product-led |
| Learning platform | product-led, dashboard-journey, interactive-demo |
| AI application | file-to-result, data-viz-narrative, interactive-demo |
| Portfolio | cinematic-scroll, guided-narrative, before-after |
| Company profile, marketplace, custom | conversion-minimal, product-led, performance-seo |
| School website | guided-narrative, performance-seo |
| POS | product-led, interactive-demo, feature-choreography |
| E-commerce | conversion-minimal, performance-seo |
| Booking | conversion-minimal, interactive-demo |
| Mobile backend | system-map, product-led |

An accepted business application is treated like a SaaS. A project with no public landing page gets no
concept ("No public landing page" in the preview).
