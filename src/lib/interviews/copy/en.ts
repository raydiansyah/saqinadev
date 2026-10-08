import type { ProjectCopy } from "./types";

export const en: ProjectCopy = {
  platforms: { web: "Web", mobile: "Mobile app", desktop: "Desktop app" },
  authMethods: { email: "Email + password", google: "Google", none: "No sign-in" },
  timelines: {
    weeks: "A few weeks",
    months: "A few months",
    flexible: "Flexible",
    unsure: "Not sure yet",
  },
  followUps: {
    sellerAccounts: {
      question: "Do sellers need their own accounts?",
      requirement: "Sellers sign in to their own account to manage listings and orders.",
      no: "Sellers do not get their own accounts; listings are managed centrally.",
    },
    buyerAccounts: {
      question: "Do buyers need accounts?",
      requirement: "Buyers create an account to order and track purchases.",
      no: "Buyers can purchase without creating an account.",
    },
    inPlatformPayments: {
      question: "Will payments happen inside the platform?",
      requirement: "Buyers pay inside the platform through a payment provider.",
      no: "Payments happen outside the platform.",
    },
    commission: {
      question: "Does the platform take a commission per sale?",
      requirement: "The platform records a commission on every completed sale.",
      no: "The platform does not take a commission on sales.",
    },
    tableManagement: {
      question: "Do orders belong to tables?",
      requirement: "Orders are linked to tables so staff can see what each table ordered.",
      no: "Orders are not linked to tables.",
    },
    multiOutlet: {
      question: "Is there more than one outlet?",
      requirement: "The system supports several outlets with separate sales and stock.",
      no: "The system serves a single outlet.",
    },
    stockTracking: {
      question: "Should stock decrease with every sale?",
      requirement: "Stock levels decrease automatically when items are sold.",
      no: "Stock is not tracked per sale.",
    },
    onlinePayments: {
      question: "Do customers pay online?",
      requirement: "Customers pay online through a payment provider.",
      no: "Customers do not pay online.",
    },
    staffSchedules: {
      question: "Does each staff member have their own schedule?",
      requirement: "Each staff member has a schedule that limits which slots can be booked.",
      no: "Bookings use one shared schedule.",
    },
    reminders: {
      question: "Should customers get booking reminders?",
      requirement: "Customers receive a reminder before their booking.",
      no: "No booking reminders are sent.",
    },
    deposits: {
      question: "Do bookings require a deposit?",
      requirement: "A deposit is collected to confirm a booking.",
      no: "Bookings are confirmed without a deposit.",
    },
    orgWorkspaces: {
      question: "Do customers work in separate organisations?",
      requirement: "Each customer organisation has its own workspace and data.",
      no: "All users share a single workspace.",
    },
    subscriptionBilling: {
      question: "Is the product sold as a subscription?",
      requirement: "Customers pay a recurring subscription.",
      no: "The product is not sold as a subscription.",
    },
    freeTrial: {
      question: "Is there a free trial?",
      requirement: "New customers start with a free trial period.",
      no: "There is no free trial.",
    },
    certificates: {
      question: "Do learners receive certificates?",
      requirement: "Learners receive a certificate when they complete a course.",
      no: "No certificates are issued.",
    },
    assessments: {
      question: "Are there quizzes or assessments?",
      requirement: "Courses include quizzes or assessments with recorded results.",
      no: "Courses have no assessments.",
    },
    paidCourses: {
      question: "Are some courses paid?",
      requirement: "Some courses require payment before access.",
      no: "All courses are free to access.",
    },
    shipping: {
      question: "Do orders need shipping?",
      requirement: "Orders include shipping address, cost and delivery status.",
      no: "Orders do not need shipping.",
    },
    variants: {
      question: "Do products have variants such as size or colour?",
      requirement: "Products can have variants with their own stock and price.",
      no: "Products have no variants.",
    },
    guestCheckout: {
      question: "Can customers check out without an account?",
      requirement: "Customers can check out as guests.",
      no: "Customers need an account to check out.",
    },
  },
  groups: {
    overview: "Overview",
    users_roles: "Users and roles",
    features: "Features",
    business_rules: "Business rules",
    integrations: "Integrations",
    authentication: "Authentication",
    data: "Data",
    ux: "UX / UI",
    infrastructure: "Infrastructure",
    constraints: "Constraints",
    open_questions: "Open questions",
    assumptions: "Assumptions",
  },
  featureDescriptions: {
    auth: "Users sign in to a personal account.",
    dashboard: "Signed-in users see a dashboard with the information they work with.",
    crud: "Users create, view, edit and delete the core records.",
    search: "Users can search the main content or records.",
    filter: "Lists can be filtered by the attributes that matter.",
    payment: "Payments are processed through a payment provider.",
    chat: "Users can send messages to each other inside the product.",
    notification: "Users are notified about events that need their attention.",
    "file-upload": "Users can upload files and attach them to records.",
    reports: "Users can view reports summarising activity over time.",
    analytics: "The team can see how the product is used.",
    ai: "An AI model performs part of the work on user input.",
    maps: "Locations are shown and selected on a map.",
    booking: "Customers book available time slots.",
    inventory: "Stock levels are tracked per item.",
    pos: "Staff record sales at the counter and print receipts.",
    "multi-tenant": "Each customer organisation's data is isolated from the others.",
    rbac: "Access depends on the user's role.",
    api: "Other systems can read and write data through an API.",
    integration: "The product exchanges data with external services.",
  },
  requirement: {
    overviewTitle: "Primary goal",
    overview: (name, objective) => `${name}: ${objective}`,
    audienceTitle: (audience) => `${audience} use the product`,
    audience: (audience) => `${audience} are a primary user group.`,
    roleTitle: (role) => `Role: ${role}`,
    role: (role) => `${role} has a separate set of permissions. Suggested from your project type.`,
    signInTitle: "Sign-in method",
    signIn: (methods) => `Users sign in with ${methods}.`,
    noSignIn: "The product does not require users to sign in.",
    platformTitle: "Platform",
    platform: (platforms) => `The product runs as: ${platforms}.`,
    databaseTitle: "Data storage",
    database: (value) => `Data storage: ${value}.`,
    deploymentTitle: "Deployment",
    deployment: (value) => `The product is deployed to ${value}.`,
    constraintsTitle: "Constraints",
    timelineTitle: "Timeline",
    timeline: (value) => `Expected timeline: ${value}.`,
    existingTitle: "Existing system",
    existing: (state) => `${state}: the work builds on or replaces something that exists.`,
  },
  open: {
    objective: {
      title: "Goal not defined",
      message: "What the product should achieve has not been described.",
    },
    audience: {
      title: "Users not defined",
      message: "Who uses the product has not been confirmed.",
    },
    features: { title: "Features not defined", message: "No core features have been selected." },
    featuresUnknown: {
      title: "Core features still open",
      message: "You were not sure about features yet; the plan uses a typical set for this type.",
    },
    payment: {
      title: "Payment integration not defined",
      message:
        "This type of project usually takes payments, but no payment approach has been confirmed.",
    },
    signIn: {
      title: "Sign-in method not defined",
      message: "Accounts are required, but how users sign in has not been chosen.",
    },
    platform: {
      title: "Platform not confirmed",
      message: "Web, mobile or desktop has not been confirmed.",
    },
    database: {
      title: "Data storage not decided",
      message: "Whether and where data is stored has not been decided.",
    },
    deployment: {
      title: "Deployment target not decided",
      message: "Where the product will run has not been decided.",
    },
    build: {
      title: "Build approach not decided",
      message: "Building in Saqina Dev or with your own agent has not been decided.",
    },
    timeline: { title: "Timeline not defined", message: "No expected timeline has been given." },
  },
  openFollowUp: (question) => ({
    title: question,
    message: "Not answered yet. This affects scope and the data model.",
  }),
  assumption: {
    projectType: (type, from) =>
      `We inferred the project type "${type}" from your description: "${from}".`,
    features: (features) => `We inferred these features from your description: ${features}.`,
    audience: (audience) => `We inferred these user groups from your description: ${audience}.`,
    rbacTitle: "Role-based access",
    rbac: "We inferred that your application needs role-based access because you described owners and staff or several kinds of users.",
    platformWebTitle: "Web application",
    platformWeb: "A web application appears likely based on your answers.",
  },
  conflicts: {
    platformDeploy: {
      title: "Platform and deployment disagree",
      message: (deployment) =>
        `You selected mobile only as the platform, but chose ${deployment} for deployment, which hosts web applications. Which is correct?`,
      options: { mobile: "Mobile", web: "Web", both: "Both" },
    },
    paymentFollowUp: {
      title: "Payment answers disagree",
      message:
        "Payment is selected as a feature, but you also said payments do not happen online or inside the product.",
      options: { keep: "Payments happen in the product", remove: "Remove the payment feature" },
    },
    noDatabase: {
      title: "Features need stored data",
      message:
        "You said no database is needed, but some selected features cannot work without stored data.",
      options: { add: "Add a database", keep: "Keep without a database" },
    },
    authNone: {
      title: "Sign-in answers disagree",
      message: "You chose no sign-in, but selected features that need user accounts.",
      options: { keep: "Users sign in", remove: "Remove account features" },
    },
    existingSaqina: {
      title: "Existing code and build approach",
      message:
        "You have existing code but chose to build inside Saqina Dev, which starts new projects. Which should we plan for?",
      options: {
        external: "Use my own agent on the existing code",
        saqina: "Start fresh in Saqina Dev",
      },
    },
  },
  risks: {
    payment: "Payments need a certified provider, webhook handling and reconciliation.",
    "multi-tenant": "Tenant data isolation must be enforced on every query.",
    ai: "AI output quality and cost need limits and monitoring.",
    chat: "Real-time messaging adds infrastructure and moderation work.",
    maps: "Map providers add usage costs and API limits.",
    integration: "External integrations depend on third-party availability and API changes.",
    existing: "Working with existing code needs an audit before changes are planned.",
    unknowns: (n) => `${n} questions are still open; scope may change once they are answered.`,
  },
  recommendation: {
    labels: {
      application: "Application",
      database: "Database",
      deployment: "Deployment",
      authentication: "Authentication",
      architecture: "Architecture",
      build_strategy: "Build strategy",
      landing: "Landing concept",
    },
    application: {
      simple: "A content site needs fast static pages and good SEO, not an application server.",
      api: "Your project is a backend for an app, so an API service is the core.",
      app: "Your project needs an authenticated dashboard, server-rendered pages for SEO and server logic in one codebase.",
      own: "You chose this stack.",
    },
    auth: {
      none: "No sign-in",
      noneReason: "You said users do not need to sign in.",
      chosen: (methods) => methods,
      chosenReason: "You chose these sign-in methods.",
      recommended: "Google + Email",
      recommendedReason:
        "Accounts are required. Google lowers sign-up friction; email covers users without Google.",
    },
    architecture: {
      staticSite: "Static site with content files",
      staticReason: "Pages change rarely and need no per-user data.",
      api: "API service with a relational database",
      apiReason: "Clients talk to the backend only through the API.",
      modular: "Modular monolith with clear domain modules",
      modularReason:
        "Several heavy features and roles benefit from strict module boundaries without the cost of microservices.",
      fullStack: "Full-stack web app with a relational database",
      fullStackReason:
        "One codebase for pages, server logic and data keeps a project of this size simple.",
    },
    buildStrategy: {
      saqina: "Build in Saqina Dev",
      external: (agent) => `Use your own agent (${agent})`,
    },
    userOverride: "You changed this recommendation.",
  },
};
