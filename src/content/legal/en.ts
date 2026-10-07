import type { LegalDocId, LegalDocument } from "./types";

/**
 * Describes what the Phase 1 preview actually does. Bracketed fields are placeholders that
 * the operator must fill in, and the whole text needs review by a lawyer before launch.
 */
export const en: Record<LegalDocId, LegalDocument> = {
  privacy: {
    title: "Privacy Policy",
    description:
      "How the Saqina Dev preview handles your data: what stays in your browser, what reaches a server and your rights.",
    updated: "2026-10-07",
    intro:
      "This policy explains how Saqina Dev handles personal data during the Phase 1 preview, which consists of this website, the landing page demo and the project interview. There are no user accounts in this phase.",
    sections: [
      {
        id: "who-we-are",
        heading: "Who we are",
        blocks: [
          {
            p: "Saqina Dev is operated by [COMPANY NAME], [REGISTERED ADDRESS], Indonesia. For any question about this policy or your data, contact us at [CONTACT EMAIL].",
          },
        ],
      },
      {
        id: "what-we-process",
        heading: "What we process",
        blocks: [
          {
            p: "Project interview. Your answers are stored only in your browser's session storage so a page refresh does not lose them. They are not sent to our servers. They are removed when you close the tab or choose Start Over.",
          },
          {
            p: "Landing page demo. The idea you type is read by a preview engine that runs in your browser. Nothing is sent or saved.",
          },
          {
            p: "Brief copy and download. Copying the brief to your clipboard and downloading the Markdown file happen on your device.",
          },
          {
            p: "Language preference. We set one cookie, NEXT_LOCALE, that stores only your chosen language code (en or id). It is a session cookie and is deleted when you close your browser.",
          },
          {
            p: "Server logs. Our hosting provider, [HOSTING PROVIDER], processes technical data needed to deliver and protect the website, such as IP address, browser type, requested page and time of the request. These logs are kept for [LOG RETENTION PERIOD].",
          },
        ],
      },
      {
        id: "what-we-do-not-do",
        heading: "What we do not do",
        blocks: [
          {
            list: [
              "We do not use analytics, advertising or social media trackers in this phase.",
              "We do not sell or rent personal data.",
              "We do not load fonts or scripts from third-party servers; fonts are served from our own domain.",
              "We do not send your interview answers or demo text to any AI provider. The preview engine is deterministic and runs in your browser.",
            ],
          },
        ],
      },
      {
        id: "legal-basis",
        heading: "Why we process data",
        blocks: [
          {
            p: "We process server log data on the basis of our legitimate interest in operating and securing the website, and to comply with legal obligations. Data that stays in your browser is processed at your own request and under your control.",
          },
          {
            p: "We handle personal data in line with Law of the Republic of Indonesia No. 27 of 2022 on Personal Data Protection (UU PDP) and its implementing regulations.",
          },
        ],
      },
      {
        id: "sharing",
        heading: "Who receives data",
        blocks: [
          {
            p: "Server log data is processed by [HOSTING PROVIDER] on our behalf as a data processor. We disclose data to authorities only when Indonesian law requires it.",
          },
          {
            p: "Our hosting provider may store logs outside Indonesia, in [HOSTING REGION]. Where data leaves Indonesia, we rely on the safeguards required by UU PDP for cross-border transfers.",
          },
        ],
      },
      {
        id: "your-rights",
        heading: "Your rights",
        blocks: [
          { p: "Under UU PDP you may, among other things:" },
          {
            list: [
              "ask what personal data we hold about you and receive a copy;",
              "ask us to correct or complete inaccurate data;",
              "ask us to delete data or stop processing it;",
              "withdraw consent you have given;",
              "object to processing based on our legitimate interest;",
              "file a complaint with the competent personal data protection authority in Indonesia.",
            ],
          },
          {
            p: "Interview answers never reach us, so you can delete them yourself at any time by closing the tab or choosing Start Over. For server logs, write to [CONTACT EMAIL]; we respond within the period set by law.",
          },
        ],
      },
      {
        id: "security",
        heading: "Security",
        blocks: [
          {
            p: "The website is served over HTTPS [CONFIRM AT DEPLOYMENT]. Access to server logs is limited to people who need it to operate the service.",
          },
        ],
      },
      {
        id: "children",
        heading: "Children",
        blocks: [
          {
            p: "The preview is meant for adults planning software projects. If you are under 18, use it with the involvement of a parent or guardian.",
          },
        ],
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        blocks: [
          {
            p: "Accounts, project storage and integrations arrive in later phases and will change what we process. We will update this policy before those features go live and show the new date at the top of this page.",
          },
        ],
      },
    ],
  },

  terms: {
    title: "Terms and Conditions",
    description:
      "The terms for using the Saqina Dev preview: what it is, what it is not and the rules that apply.",
    updated: "2026-10-07",
    intro:
      "These terms apply to your use of the Saqina Dev website during the Phase 1 preview. By using the website you agree to them. If you do not agree, please do not use the website.",
    sections: [
      {
        id: "operator",
        heading: "Who provides the service",
        blocks: [
          {
            p: 'The website is provided by [COMPANY NAME], [REGISTERED ADDRESS], Indonesia ("we"). Contact: [CONTACT EMAIL].',
          },
        ],
      },
      {
        id: "preview",
        heading: "What the preview is",
        blocks: [
          {
            p: "Phase 1 is a public preview. You can read about the product, try the landing page demo and complete a project interview that produces a recommendation and a Markdown brief.",
          },
          {
            p: "Features labelled Planned or Demo, such as building, Git, CI/CD, MCP, approvals and deployment, are illustrations of future functionality. They are not available yet, and no project, repository or deployment is created.",
          },
          { p: "There are no accounts, subscriptions or payments in this phase." },
        ],
      },
      {
        id: "recommendations",
        heading: "Recommendations are not professional advice",
        blocks: [
          {
            p: "Recommendations come from a deterministic rule engine running in your browser. They are a starting point for planning, not legal, financial, security or engineering advice, and they may be incomplete or wrong for your situation.",
          },
          {
            p: "You remain responsible for decisions you make and for checking any recommendation before you rely on it.",
          },
        ],
      },
      {
        id: "your-content",
        heading: "Your ideas and briefs",
        blocks: [
          {
            p: "What you type into the interview or the demo stays yours. It stays in your browser and is not sent to us. The Markdown brief you copy or download is yours to use, change and share freely.",
          },
        ],
      },
      {
        id: "our-content",
        heading: "Our content",
        blocks: [
          {
            p: "The website's design, text, code and the Saqina Dev name belong to [COMPANY NAME] or its licensors. You may view and share the website for personal or internal business use. Do not copy, resell or present it as your own.",
          },
        ],
      },
      {
        id: "acceptable-use",
        heading: "Acceptable use",
        blocks: [
          { p: "When using the website, do not:" },
          {
            list: [
              "attempt to disrupt, overload or gain unauthorised access to the website or its infrastructure;",
              "use automated tools in a way that harms the website's availability;",
              "use the website for anything unlawful under Indonesian law.",
            ],
          },
        ],
      },
      {
        id: "third-parties",
        heading: "Third-party names",
        blocks: [
          {
            p: "The website mentions products such as Claude, Codex, Cursor, Kiro, Hermes, Antigravity, OpenClaw, Vercel, Supabase, GitHub, GitLab and Bitbucket to describe compatibility. These names belong to their owners. Mentioning them does not mean they endorse or are affiliated with Saqina Dev. When you use those services, their own terms apply.",
          },
        ],
      },
      {
        id: "availability",
        heading: "Availability and changes",
        blocks: [
          {
            p: "The preview is provided as is and as available. We may change, pause or end it at any time, including the interview and its recommendations.",
          },
        ],
      },
      {
        id: "liability",
        heading: "Limitation of liability",
        blocks: [
          {
            p: "To the extent permitted by Indonesian law, we are not liable for indirect or consequential losses arising from your use of the preview or reliance on its recommendations. Nothing in these terms limits liability that cannot be limited by law.",
          },
        ],
      },
      {
        id: "law",
        heading: "Governing law and disputes",
        blocks: [
          {
            p: "These terms are governed by the laws of the Republic of Indonesia. We will first try to resolve any dispute by deliberation (musyawarah). If that fails, the dispute will be settled by [COURT OR ARBITRATION FORUM].",
          },
          {
            p: "These terms are available in English and Indonesian. [CONFIRM WITH COUNSEL: which language version prevails if they differ.]",
          },
        ],
      },
      {
        id: "changes",
        heading: "Changes to these terms",
        blocks: [
          {
            p: "We will update these terms before accounts, project storage, payments or integrations become available, and show the new date at the top of this page.",
          },
        ],
      },
    ],
  },
};
