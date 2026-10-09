import type { LegalDocId, LegalDocument } from "./types";

/**
 * Describes what Saqina Dev actually does today (accounts and project workspaces, no AI
 * calls). Bracketed fields are placeholders the operator must fill in, and the whole text
 * needs review by a lawyer before launch.
 */
export const en: Record<LegalDocId, LegalDocument> = {
  privacy: {
    title: "Privacy Policy",
    description:
      "How Saqina Dev handles your data: your account, your projects, what stays in your browser and your rights.",
    updated: "2026-10-09",
    intro:
      "This policy explains how Saqina Dev handles personal data on this website: the public pages and preview, your account and the project workspaces you create.",
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
            p: "Account. When you create an account we store your name, email address and a one-way hash of your password; we never store the password itself. If you sign in with Google, we receive your name, email address and profile picture from Google.",
          },
          {
            p: "Projects. Everything you enter in a project is stored in our database so it is there when you come back: interview answers, requirements, documents such as the PRD and plan, tasks, memory, decisions, agent preferences, project settings and a log of changes (who changed what and when).",
          },
          {
            p: "Conversations with Saqina. Your messages to the in-app assistant, its replies, the changes it proposes and the logs of agent runs are stored with the project. Conversations are visible only to you; changes they lead to appear in the project's activity log, which every project member can see.",
          },
          {
            p: "Integrations. If you connect a repository, an MCP server or an external agent, we store its address and an access token or signing secret, encrypted. We read repository files only when a task needs them (we do not copy your repository), write only to agent branches after a project member approves the change, and never merge or deploy. MCP servers you connect receive the inputs of tools you enable. External agents receive only the context package you review and approve, with recognisable secrets removed.",
          },
          {
            p: "Clients and billing. If you manage clients in Saqina Dev, we store the client details you enter (name, company, contact details and internal notes), the project scope, payment schedules, invoices and the payments you record. Payment records are entered by you from your own bank statements or receipts; Saqina Dev does not process payments, hold money or connect to your bank. Payments are never deleted: a corrected entry is voided with a reason so the history stays complete.",
          },
          {
            p: "Client portal. If you invite a client, we store the invited email address and a hash of the one-time invitation link. A client who accepts sees only the projects you enable for the portal, and on those only progress, visible scope items, shared approved documents, issued invoices and confirmed payments. Internal notes, tasks, AI and agent details, integrations and draft invoices are never shown to clients. You are responsible for having a lawful basis to enter your clients' personal data.",
          },
          {
            p: "Sessions and security. We store your active sessions with the IP address and browser type used to sign in, so you can stay signed in and so we can protect accounts.",
          },
          {
            p: "Email. We send transactional email only: email verification and password reset links. These are sent through [EMAIL PROVIDER].",
          },
          {
            p: "Public preview. The interview on the public /start page and the landing page demo run in your browser. Their answers stay in your browser's session storage until you close the tab, unless you choose to import them into a new project after signing in.",
          },
          {
            p: "Server logs. Our hosting provider, [HOSTING PROVIDER], processes technical data needed to deliver and protect the website, such as IP address, browser type, requested page and time of the request. These logs are kept for [LOG RETENTION PERIOD].",
          },
        ],
      },
      {
        id: "cookies",
        heading: "Cookies",
        blocks: [
          {
            list: [
              "Session cookie (better-auth.session_token): keeps you signed in. It cannot be read by scripts on the page and expires after 30 days or when you sign out.",
              "Short-lived sign-in cookies: set only while a Google sign-in is in progress, to protect that flow.",
              "Language (NEXT_LOCALE): stores only your chosen language code (en or id) and is deleted when you close your browser.",
            ],
          },
          { p: "We use no analytics, advertising or tracking cookies." },
        ],
      },
      {
        id: "what-we-do-not-do",
        heading: "What we do not do",
        blocks: [
          {
            list: [
              "We do not use analytics, advertising or social media trackers.",
              "We do not sell or rent personal data.",
              "We do not load fonts or scripts from third-party servers; fonts are served from our own domain.",
              "We do not send your project data to an AI provider unless the platform owner has configured one. When a provider is configured, only the project context needed for a request is sent to it ([AI PROVIDER], [CONFIRM: each provider's data retention and model-training terms]). Without one, answers come from deterministic rules on our servers. Changes to your project are always validated by our own rules before they are applied.",
            ],
          },
        ],
      },
      {
        id: "legal-basis",
        heading: "Why we process data",
        blocks: [
          {
            p: "We process account and project data to provide the service you signed up for, which is the performance of our agreement with you. We process server logs and session data on the basis of our legitimate interest in operating and securing the service, and to comply with legal obligations.",
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
            p: "Data is processed on our behalf by [HOSTING PROVIDER] (hosting), [DATABASE PROVIDER] (database), [EMAIL PROVIDER] (transactional email), the AI providers configured by the platform owner ([AI PROVIDER]), and the Git hosts, MCP servers and agents you connect yourself, as data processors or on your instruction. If you sign in with Google, Google processes that sign-in under its own terms. We disclose data to authorities only when Indonesian law requires it.",
          },
          {
            p: "These providers may store data outside Indonesia, in [HOSTING REGION]. Where data leaves Indonesia, we rely on the safeguards required by UU PDP for cross-border transfers.",
          },
        ],
      },
      {
        id: "retention",
        heading: "How long we keep data",
        blocks: [
          {
            p: "Project data is kept until you delete the project; deletion in project settings is immediate and permanent. Account data is kept while your account exists. After an account is deleted, residual copies in backups are removed within [BACKUP RETENTION PERIOD].",
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
            p: "You can edit or delete your projects yourself at any time. Self-service account deletion is not available yet: write to [CONTACT EMAIL] and we will delete your account within the period set by law.",
          },
        ],
      },
      {
        id: "security",
        heading: "Security",
        blocks: [
          {
            p: "The website is served over HTTPS [CONFIRM AT DEPLOYMENT]. Passwords are stored only as one-way hashes, sessions are validated on the server for every request, and every project operation checks that you are a member of that project. Access to production data is limited to people who need it to operate the service.",
          },
        ],
      },
      {
        id: "children",
        heading: "Children",
        blocks: [
          {
            p: "Saqina Dev is meant for adults planning software projects. If you are under 18, use it with the involvement of a parent or guardian.",
          },
        ],
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        blocks: [
          {
            p: "Real agent execution, integrations with services such as GitHub or Vercel, and payments arrive in later phases and will change what we process. We will update this policy before those features go live and show the new date at the top of this page.",
          },
        ],
      },
    ],
  },

  terms: {
    title: "Terms and Conditions",
    description:
      "The terms for using Saqina Dev: your account, your projects, what the service is and is not, and the rules that apply.",
    updated: "2026-10-09",
    intro:
      "These terms apply to your use of the Saqina Dev website and service. By creating an account or using the website you agree to them. If you do not agree, please do not use Saqina Dev.",
    sections: [
      {
        id: "operator",
        heading: "Who provides the service",
        blocks: [
          {
            p: 'The service is provided by [COMPANY NAME], [REGISTERED ADDRESS], Indonesia ("we"). Contact: [CONTACT EMAIL].',
          },
        ],
      },
      {
        id: "service",
        heading: "What the service is",
        blocks: [
          {
            p: "Saqina Dev turns a project idea into a structured project workspace: an interview, requirements, recommendations, a PRD, a plan, tasks, project memory, decisions, an assistant (Saqina) that can answer questions and propose or apply changes, an approval queue and agent assignments.",
          },
          {
            p: "Saqina's agents may plan work with an AI model configured by the platform owner and propose changes, including commits to a working branch of your connected repository. Nothing is applied to your project or repository until a project member approves it, Saqina never merges or deploys, and external agents (Claude, Codex and others) are not run by Saqina: you hand work to them and import their result.",
          },
          { p: "There are no subscriptions or payments at this time." },
        ],
      },
      {
        id: "account",
        heading: "Your account",
        blocks: [
          {
            p: "You must give accurate information and keep your password safe. You are responsible for activity under your account. Tell us at [CONTACT EMAIL] if you believe your account has been accessed without permission.",
          },
        ],
      },
      {
        id: "recommendations",
        heading: "Recommendations are not professional advice",
        blocks: [
          {
            p: "Recommendations, generated documents, Saqina's answers and agent results come from a deterministic rule engine and, where enabled, an AI model. They are a starting point for planning, not legal, financial, security or engineering advice, and they may be incomplete or wrong for your situation. Changes that need approval are applied only after a project member approves them.",
          },
          {
            p: "You remain responsible for decisions you make and for checking any recommendation before you rely on it.",
          },
        ],
      },
      {
        id: "your-content",
        heading: "Your projects and content",
        blocks: [
          {
            p: "What you enter in Saqina Dev stays yours. You give us permission to store, process and display it only as needed to provide the service to you. You can export it by copying documents and agent context, and delete it by deleting the project.",
          },
          {
            p: "Do not upload content you have no right to use, or personal data of other people without a lawful basis.",
          },
          {
            p: "Proposals, scope summaries, invoice descriptions and other text Saqina Dev drafts for you are drafts. They are not legal, tax or accounting advice; review them before you rely on them or send them to a client. Billing figures come only from the records you enter.",
          },
        ],
      },
      {
        id: "our-content",
        heading: "Our content",
        blocks: [
          {
            p: "The website's design, text, code and the Saqina Dev name belong to [COMPANY NAME] or its licensors. You may use the service for personal or internal business purposes. Do not copy, resell or present it as your own.",
          },
        ],
      },
      {
        id: "acceptable-use",
        heading: "Acceptable use",
        blocks: [
          { p: "When using Saqina Dev, do not:" },
          {
            list: [
              "attempt to disrupt, overload or gain unauthorised access to the service, other accounts or its infrastructure;",
              "use automated tools in a way that harms the service's availability;",
              "use the service for anything unlawful under Indonesian law.",
            ],
          },
          {
            p: "We may suspend an account that breaks these rules, and will tell you why unless the law prevents us.",
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
            p: "The service is provided as is and as available while it is in early development. We may change, pause or end features, and will give reasonable notice before ending the service so you can copy your project documents.",
          },
        ],
      },
      {
        id: "liability",
        heading: "Limitation of liability",
        blocks: [
          {
            p: "To the extent permitted by Indonesian law, we are not liable for indirect or consequential losses arising from your use of the service or reliance on its recommendations. Nothing in these terms limits liability that cannot be limited by law.",
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
            p: "We will update these terms before payments, real agent execution or integrations become available, show the new date at the top of this page and tell account holders by email about material changes.",
          },
        ],
      },
    ],
  },
};
