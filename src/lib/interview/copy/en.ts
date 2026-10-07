import type { EngineCopy } from "./types";

const joinList = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

export const en: EngineCopy = {
  options: {
    projectType: {
      "school-website": {
        label: "School Website",
        description: "Admissions, news, staff and programs",
      },
      "company-profile": {
        label: "Company Profile",
        description: "Services, credibility and contact",
      },
      pos: { label: "POS / Cashier", description: "Sales, receipts and stock at the counter" },
      marketplace: { label: "Marketplace", description: "Many sellers, many buyers" },
      saas: { label: "SaaS", description: "Subscription software for teams or businesses" },
      "internal-dashboard": {
        label: "Internal Dashboard",
        description: "Tools only your team uses",
      },
      "mobile-backend": {
        label: "Mobile App Backend",
        description: "API, auth and data for an app",
      },
      "ai-application": { label: "AI Application", description: "Models doing work on user input" },
      portfolio: { label: "Portfolio", description: "Your work, presented well" },
      booking: { label: "Booking System", description: "Slots, schedules and reservations" },
      ecommerce: { label: "E-commerce", description: "Catalog, cart and checkout" },
      "learning-platform": {
        label: "Learning Platform",
        description: "Courses, progress and assessments",
      },
      custom: { label: "Custom", description: "Something else. Describe it below." },
    },
    audience: {
      public: { label: "Public visitors" },
      customers: { label: "Customers" },
      employees: { label: "Employees" },
      students: { label: "Students" },
      teachers: { label: "Teachers" },
      administrators: { label: "Administrators" },
      "business-owners": { label: "Business owners" },
      developers: { label: "Developers" },
      "multiple-roles": { label: "Multiple roles" },
      other: { label: "Other" },
    },
    feature: {
      auth: { label: "Authentication" },
      dashboard: { label: "Dashboard" },
      crud: { label: "CRUD" },
      search: { label: "Search" },
      filter: { label: "Filter" },
      payment: { label: "Payment" },
      chat: { label: "Chat" },
      notification: { label: "Notification" },
      "file-upload": { label: "File Upload" },
      reports: { label: "Reports" },
      analytics: { label: "Analytics" },
      ai: { label: "AI" },
      maps: { label: "Maps" },
      booking: { label: "Booking" },
      inventory: { label: "Inventory" },
      pos: { label: "POS" },
      "multi-tenant": { label: "Multi-tenant" },
      rbac: { label: "Role & Permission" },
      api: { label: "API" },
      integration: { label: "Integration" },
    },
    projectState: {
      new: { label: "New project", description: "Nothing exists yet" },
      existing: { label: "Existing project", description: "There is a codebase to continue" },
      migration: {
        label: "Migration / rebuild",
        description: "Replace or move an existing system",
      },
      unsure: { label: "Not sure" },
    },
    techPreference: {
      recommend: { label: "Recommend for me", description: "Pick a stack that fits the brief" },
      own: { label: "I have my own stack", description: "Tell us what you already use" },
      unknown: { label: "I don't know yet", description: "We will explain the recommendation" },
    },
    stackLayer: {
      frontend: { label: "Frontend", placeholder: "e.g. Next.js, Vue, SvelteKit" },
      backend: { label: "Backend", placeholder: "e.g. Laravel, NestJS, Go" },
      database: { label: "Database", placeholder: "e.g. PostgreSQL, MySQL" },
      auth: { label: "Authentication", placeholder: "e.g. Supabase Auth, Clerk" },
      hosting: { label: "Hosting", placeholder: "e.g. Vercel, VPS, AWS" },
      other: { label: "Other", placeholder: "Anything else we should respect" },
    },
    databaseNeed: { yes: { label: "Yes" }, no: { label: "No" }, unsure: { label: "Not sure" } },
    databaseChoice: {
      recommend: { label: "Recommend one" },
      supabase: { label: "Supabase" },
      postgresql: { label: "PostgreSQL" },
      mysql: { label: "MySQL" },
      other: { label: "Other" },
      existing: { label: "Existing database" },
    },
    developmentMode: {
      saqina: {
        label: "Build in Saqina Dev",
        description: "Let Saqina Dev generate, preview, manage and deploy your project.",
      },
      external: {
        label: "Use My Own Agent",
        description:
          "Generate the PRD, plan and agent instructions for Claude, Codex, Cursor, Kiro, Hermes, Antigravity, OpenClaw or another agent.",
      },
      unsure: { label: "Not sure", description: "We recommend one based on your answers." },
    },
    agent: {
      claude: { label: "Claude" },
      codex: { label: "Codex" },
      cursor: { label: "Cursor" },
      kiro: { label: "Kiro" },
      hermes: { label: "Hermes" },
      antigravity: { label: "Antigravity" },
      openclaw: { label: "OpenClaw" },
      other: { label: "Other", description: "Any agent that reads Markdown instructions" },
      unsure: { label: "Not sure", description: "We suggest one for this project" },
    },
    deployment: {
      "saqina-vercel": {
        label: "Saqina Dev / Vercel",
        description: "Preview and production on *.saqina.dev",
      },
      "existing-vercel": {
        label: "Existing Vercel",
        description: "Connect a Vercel account you already use",
      },
      other: { label: "Other hosting" },
      "self-hosted": { label: "Self-hosted", description: "Your own server or VPS" },
      unsure: { label: "Not sure" },
    },
    versioning: {
      yes: { label: "Yes", description: "Releases tagged MAJOR.MINOR.PATCH" },
      no: { label: "No" },
      unsure: { label: "Not sure" },
    },
  },

  steps: {
    project: {
      title: "What are you building?",
      hint: "A sentence is enough. Pick an example if it is close.",
      required: "Pick a project type or describe your idea in a sentence.",
    },
    audience: {
      title: "Who will use this system?",
      hint: "Select every group that applies.",
      required: "Select at least one group.",
    },
    objective: {
      title: "What should this system help users accomplish?",
      hint: "One or two sentences about the outcome, not the features.",
      required: "Write a short objective (at least a few words) or pick a suggestion.",
    },
    features: {
      title: "What features do you already know you need?",
      hint: "Only what you are sure about. You can also say you don't know yet.",
      required: 'Select at least one feature, or choose "I don\'t know yet".',
    },
    existing: {
      title: "Is this a new project or an existing one?",
      required: "Choose one option.",
    },
    technology: {
      title: "Do you already have a preferred technology?",
      hint: "Nothing is forced. A recommendation always comes with its reason.",
      required: "Choose one option. If you have your own stack, fill in at least one field.",
    },
    database: {
      title: "Does your project need a database?",
      required: "Choose one option. If you need a database, pick which one.",
    },
    development: {
      title: "Where do you want to build this project?",
      required: "Choose where you want to build.",
    },
    agent: {
      title: "Which agent do you use?",
      hint: "The PRD and plan stay agent-neutral. This only shapes the agent instructions.",
      required: 'Choose an agent, or "Not sure".',
    },
    deployment: { title: "Where do you want to deploy?", required: "Choose a deployment target." },
    versioning: {
      title: "Do you want semantic versioning for this project?",
      hint: "Releases numbered MAJOR.MINOR.PATCH, for example v1.2.0.",
      required: "Choose one option.",
    },
    landing: {
      title: "Landing page concept",
      hint: "Based on your answers. Keep the recommendation or choose your own combination.",
      required: "",
    },
    review: { title: "Your project is taking shape.", required: "" },
  },

  groups: {
    Project: "Project",
    Audience: "Audience",
    Features: "Features",
    Technology: "Technology",
    Development: "Development",
    Deployment: "Deployment",
    "Landing Page": "Landing Page",
    Review: "Review",
  },

  objectiveSuggestions: {
    "school-website": [
      "Help parents find programs and register for admission online.",
      "Keep students and parents informed about news and schedules.",
    ],
    "company-profile": [
      "Explain our services clearly and turn visitors into contact requests.",
      "Build trust with prospective clients through our past work.",
    ],
    pos: [
      "Make checkout faster and keep stock accurate across shifts.",
      "Give the owner daily sales reports without manual counting.",
    ],
    marketplace: [
      "Let independent sellers list products and reach more buyers.",
      "Help buyers compare offers and pay safely in one place.",
    ],
    saas: [
      "Let teams manage their work in one place and pay monthly.",
      "Replace a manual process our customers currently do in spreadsheets.",
    ],
    "internal-dashboard": [
      "Replace spreadsheets so the team works from one source of truth.",
      "Give managers a live view of operations without asking for reports.",
    ],
    "mobile-backend": ["Provide secure accounts, data and notifications for our mobile app."],
    "ai-application": [
      "Turn a document the user uploads into a clear, usable result.",
      "Answer customer questions from our own knowledge base.",
    ],
    portfolio: ["Present my best work and get contacted for new projects."],
    booking: [
      "Let clients book and reschedule without calling us.",
      "Reduce no-shows with reminders and deposits.",
    ],
    ecommerce: [
      "Sell our products online with a simple, fast checkout.",
      "Grow repeat purchases from existing customers.",
    ],
    "learning-platform": [
      "Deliver courses online and track each learner's progress.",
      "Let teachers publish lessons and assess students in one place.",
    ],
    custom: ["Describe the main problem this system should solve for its users."],
  },

  concepts: {
    "cinematic-scroll": {
      name: "Cinematic Scroll Storytelling",
      summary: "Full-bleed scenes that unfold as the visitor scrolls.",
    },
    "product-led": {
      name: "Product-Led Storytelling",
      summary: "The product itself carries the story, screen by screen.",
    },
    "file-to-result": {
      name: "File-to-Result Transformation",
      summary: "Show an input going in and the finished output coming out.",
    },
    "pinned-stage": {
      name: "Pinned Product Stage",
      summary: "One product view stays fixed while the explanation changes around it.",
    },
    "feature-choreography": {
      name: "Feature Choreography",
      summary: "Features introduced in a sequence that mirrors real use.",
    },
    "interactive-demo": {
      name: "Interactive Demo Landing Page",
      summary: "Visitors try a real slice of the product before signing up.",
    },
    "product-3d": {
      name: "3D Product Showcase",
      summary: "A 3D model, used only when shape and space explain the product.",
    },
    "horizontal-rail": {
      name: "Horizontal Story Rail",
      summary: "A sideways sequence for steps, timelines or collections.",
    },
    "layered-parallax": {
      name: "Layered Parallax Experience",
      summary: "Depth through layers moving at different speeds.",
    },
    "before-after": {
      name: "Before-and-After Reveal",
      summary: "A direct comparison of the old state and the improved one.",
    },
    "guided-narrative": {
      name: "Guided Narrative / Scrollytelling",
      summary: "A written story with visuals that change at each chapter.",
    },
    "dashboard-journey": {
      name: "Dashboard Journey",
      summary: "Walk through the app the way a real user would on day one.",
    },
    "data-viz-narrative": {
      name: "Data Visualization Narrative",
      summary: "Charts and numbers that explain what the product finds.",
    },
    "system-map": {
      name: "System Map / Ecosystem Story",
      summary: "How the product connects to the tools and people around it.",
    },
    "conversion-minimal": {
      name: "Conversion-Focused Minimal Landing Page",
      summary: "Short, fast and built around one action.",
    },
    "adaptive-motion": {
      name: "Adaptive Responsive Motion System",
      summary: "Motion that changes form between desktop and mobile.",
    },
    "motion-system": {
      name: "Motion System",
      summary: "A consistent set of transitions that express the brand.",
    },
    "performance-seo": {
      name: "Landing Page Performance and SEO Foundation",
      summary: "Fast render, crawlable structure and clean metadata first.",
    },
  },

  categories: {
    story: "Story",
    interaction: "Interaction",
    spatial: "Spatial / Visual",
    system: "Product / System",
    conversion: "Conversion",
    foundation: "Motion / Foundation",
  },

  profiles: {
    "restaurant-pos": {
      label: "Restaurant POS",
      users: ["Owner", "Manager", "Cashier"],
      core: ["Sales", "Inventory", "Reports"],
    },
    "school-management": {
      label: "School Management Platform",
      users: ["Admin", "Teacher", "Student", "Parent"],
      core: ["Attendance", "Grades", "Schedules", "Reports"],
    },
    "clinic-booking": {
      label: "Clinic Booking",
      users: ["Patient", "Staff", "Admin"],
      core: ["Booking", "Reminders", "Schedule"],
    },
    "retail-pos": {
      label: "Retail POS",
      users: ["Owner", "Cashier"],
      core: ["Sales", "Stock", "Receipts"],
    },
    marketplace: {
      label: "Marketplace",
      users: ["Buyer", "Seller", "Admin"],
      core: ["Listings", "Checkout", "Payouts"],
    },
    learning: {
      label: "Learning Platform",
      users: ["Student", "Teacher", "Admin"],
      core: ["Courses", "Progress", "Quizzes"],
    },
    "school-website": {
      label: "School Website",
      users: ["Parent", "Student", "Staff"],
      core: ["Admissions", "Programs", "News"],
    },
    "online-store": {
      label: "Online Store",
      users: ["Customer", "Admin"],
      core: ["Catalog", "Cart", "Checkout"],
    },
    "ai-tool": {
      label: "AI Application",
      users: ["User", "Admin"],
      core: ["Upload", "Processing", "Results"],
    },
    portfolio: {
      label: "Portfolio",
      users: ["Visitor", "Client"],
      core: ["Projects", "About", "Contact"],
    },
    "company-website": {
      label: "Company Website",
      users: ["Visitor", "Prospect"],
      core: ["Services", "Case studies", "Contact"],
    },
    "internal-tool": {
      label: "Internal Dashboard",
      users: ["Staff", "Manager"],
      core: ["Records", "Approvals", "Reports"],
    },
    saas: {
      label: "SaaS Platform",
      users: ["Team admin", "Team member"],
      core: ["Workspaces", "Dashboard", "Billing"],
    },
  },

  complexity: {
    names: { low: "low", medium: "medium", high: "high" },
    simple: "Content pages without accounts or stored data.",
    high: (features) => `Includes ${features}, and each of these adds real work.`,
    medium: "An application with stored data and a handful of core features.",
    low: "A small feature set with little moving data.",
  },

  joinList,

  insights: {
    typeNoun: {
      "company-profile": "a company profile",
      "school-website": "a school website",
      portfolio: "a portfolio",
    },
    businessApp: "Business Management Web App",
    portal: {
      "school-website": "School Website + Academic Portal",
      portfolio: "Portfolio + Client Area",
    },
    webAppFallback: "Website + Web Application",
    modules: {
      website: "Company Website",
      employeePortal: "Employee Portal",
      customerPortal: "Customer Portal",
      inventory: "Inventory",
      payment: "Payment",
      booking: "Booking",
      pos: "POS",
    },
    appFeatures: {
      titleBusiness: (noun) => `This sounds larger than ${noun}`,
      titleWeb: "This is closer to a web application",
      messageBusiness: (features, structure, modules) =>
        `You asked for ${features}. Recommended project type: ${structure}. Possible modules: ${modules}. Continue with this structure?`,
      messageWeb: (noun, features, structure) =>
        `You mentioned ${noun} but also asked for ${features}. That sounds closer to a business web application. Recommended structure: ${structure}.`,
      use: (structure) => `Use "${structure}"`,
      keep: "Keep my structure",
    },
    multiTenant: {
      title: "Multi-tenant is probably more than you need",
      message:
        "Multi-tenant means separate organizations sharing one system, each with isolated data. For a single organization's site, roles and permissions cover the same need with far less work.",
      replace: "Replace with Role & Permission",
      keep: "Keep multi-tenant",
    },
    noDatabase: {
      title: "These features need somewhere to store data",
      message: (what) =>
        `You chose no database, but ${what} cannot work without persistent storage.`,
      coreRecords: "the core records of this kind of system",
      add: "Add a database (recommend one)",
      keep: "Keep no database",
    },
    paymentNoAuth: {
      title: "Payments without accounts",
      message:
        "Payment without authentication works for guest checkout, but refunds, receipts and order history usually need an account.",
      add: "Add Authentication",
      keep: "Guest checkout is fine",
    },
    existingInSaqina: {
      title: "You already have code",
      message:
        "Importing an existing repository into the Saqina builder is planned but not available yet. Your own agent can work on the existing codebase today, with Saqina Dev holding the plan.",
      switch: "Switch to my own agent",
      keep: "Keep Build in Saqina Dev",
    },
  },

  landing: {
    why: {
      saas: "A SaaS product is bought on workflow, so visitors need to experience the dashboard before signing up.",
      "internal-dashboard":
        "The audience is internal, so the page only needs to show how the dashboard is used.",
      "learning-platform":
        "Learners and teachers commit once they see what a lesson and its progress look like.",
      "ai-application":
        "An AI product is understood fastest by watching an input turn into a result.",
      portfolio: "A portfolio sells on the quality of the work, which needs room and pacing.",
      "company-profile":
        "A professional service has to explain itself quickly, be found in search and lead to one contact action.",
      "school-website":
        "Parents and students scan for programs and admissions, often on phones, and arrive from search.",
      pos: "A cashier system is judged on how fast a sale goes, so the page should walk through a real transaction.",
      marketplace:
        "A marketplace needs listings to load fast and rank in search, with a short path to the first action.",
      ecommerce: "A store converts on speed and clarity, and product pages live or die in search.",
      booking:
        "The page exists to get a visitor to pick a slot, so the booking flow itself should lead.",
      "mobile-backend": "A backend is explained by what it connects to.",
      custom:
        "With an open brief, a focused page that loads fast is the safest base to iterate from.",
    },
    businessApp:
      "A business application is chosen on its daily workflows, so visitors should see them working.",
    integration:
      "It connects to other systems, so a system map shows its value better than screens.",
    physical:
      "It is a physical object, so a 3D view explains its shape better than photos or text.",
    override: (suggested, first) =>
      `You chose this combination. Our suggestion was ${suggested}. ${first}`,
  },

  recommend: {
    customProject: "Custom Project",
    newProject: "New project",
    development: {
      chosenSaqina: "You chose to generate, preview and deploy inside Saqina Dev.",
      chosenExternal:
        "You chose to keep coding with your own agent. Saqina Dev holds the PRD, plan and progress.",
      existingCode:
        "You already have code. An agent working in your repository can change it in place.",
      large:
        "The scope is large. A coding agent in your own environment gives you full control over the codebase as it grows.",
      small: "A new project of this size is fastest to generate, preview and deploy in one place.",
    },
    agent: {
      chosen: "Instructions are generated for this agent. The PRD and plan stay agent-neutral.",
      existingCode:
        "A terminal agent that reads the whole repository suits work on existing code. Any other agent can use the same package.",
      newProject:
        "An editor-based agent lets you review each change inline while the project takes shape. Any other agent can use the same package.",
    },
    stack: {
      own: "Your existing stack is kept as is.",
      simple: "Static pages render fast, rank well and cost almost nothing to host.",
      app: "One TypeScript codebase for UI and server, with a managed Postgres so there is no database server to run.",
      layers: {
        frontend: "Frontend",
        styling: "Styling",
        content: "Content",
        api: "API",
        database: "Database",
        auth: "Authentication",
        ai: "AI",
      },
      staticPages: "Next.js (static pages)",
      markdown: "Markdown / MDX",
      apiValue: "Next.js Route Handlers + TypeScript",
      aiValue: "Provider-agnostic model layer",
    },
    database: {
      notRequired: "Not required",
      notRequiredReason: "Content lives in files, so there is nothing to store between visits.",
      existing: "Existing database (connected later)",
      yourChoice: "Your choice.",
      notYet: "Not required yet",
      notYetReason: "Nothing in your feature list needs stored data. It can be added later.",
      recommended: "Supabase (PostgreSQL)",
      recommendedReason:
        "Relational data with auth and storage included, and plain Postgres underneath if you leave.",
    },
    deployment: {
      defaultTarget: "Saqina Dev / Vercel",
      viaVercel: "Preview deployments for every change and production on a saqina.dev subdomain.",
      otherHost: "Saqina Dev prepares build and environment notes for your host.",
      connectVercel: "Connect Vercel",
      createVercel: "Create Vercel project",
      preview: "Preview deploy",
      production: "Production deploy",
      customDomain: "Custom domain",
      build: "Build",
      env: "Environment variables",
      deployHost: "Deploy to your host",
    },
    versioning: {
      consumers:
        "Apps and integrations call this API, so they need to know when a release changes behavior.",
      releases:
        "Features will ship over several releases; version numbers make each one traceable.",
      small: "Small scope. Plain dated releases are enough for now.",
    },
    integrations: { mcp: "MCP progress sync", customDomain: "Custom domain" },
  },

  brief: {
    intro: "> Project brief generated by the Saqina Dev interview. Edit freely.",
    objective: "Objective",
    notSpecified: "_Not specified._",
    audience: "Audience",
    features: "Features",
    suggested: "suggested",
    complexity: "Complexity",
    development: "Development",
    status: "Status",
    mode: "Mode",
    modeSaqina: "Build in Saqina Dev",
    modeAgent: "Own agent",
    agent: "Agent",
    chosen: "chosen",
    recommended: "recommended",
    stack: "Stack",
    dataDeploy: "Data and deployment",
    database: "Database",
    deployment: "Deployment",
    pipeline: "Pipeline",
    versioning: "Semantic versioning",
    yes: "yes",
    no: "no",
    landing: "Landing page",
    primary: "Primary",
    supporting: "Supporting",
    integrations: "Future integrations",
    none: "None",
  },
};
