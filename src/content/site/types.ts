import type { ProjectTypeId } from "@/lib/interview/options";
import type { ChapterId, NodeForm, RailStop } from "../story";

/** Text with highlighted spans, e.g. the idea sentence in chapter 01. */
export type RichText = { text: string; mark?: boolean }[];

export interface DocContent {
  name: string;
  lines: string[];
}

/**
 * All landing page copy for one language. Plain data only (no functions) so slices can be
 * passed from Server Components to Client Components as props.
 */
export interface SiteContent {
  meta: {
    title: string;
    description: string;
    tagline: string;
    ogSubtitle: string;
    ogFooter: string;
  };
  hero: {
    title: string;
    lead: [string, string];
    body: string;
    primaryCta: string;
    secondaryCta: string;
  };
  heroPaths: {
    tablist: string;
    pathA: string;
    pathB: string;
    here: { label: string; flow: string[] };
    agent: { label: string; flow: string[] };
    shared: string;
  };
  story: {
    title: string;
    note: string;
    railLabel: string;
    chapters: Record<ChapterId, { title: string; body: string }>;
    nodes: Record<NodeForm, string>;
    rail: Record<RailStop, string>;
  };
  stage: {
    planned: string;
    demo: string;
    idea: { file: string; sentence: RichText; fragments: { kind: string; value: string }[] };
    project: {
      file: string;
      structured: string;
      name: string;
      rows: { key: string; value: string }[];
      complexity: string;
      complexityValue: string;
      ready: string;
    };
    paths: {
      project: string;
      pathA: string;
      pathB: string;
      here: string;
      agent: string;
      hereItems: string[];
      shared: string;
    };
    agents: {
      file: string;
      legend: string;
      generic: string;
      yourAgent: string;
      unchanged: string;
      context: string[];
      switches: string;
      contextChanges: string;
    };
    documents: { file: string; tablist: string; docs: DocContent[] };
    memory: {
      file: string;
      session1: string;
      decision: string;
      memoryLine: string;
      sessionEnds: string;
      session2: string;
      restored: string;
    };
    mcp: { file: string; task: string; history: string; log: string[] };
    approval: {
      file: string;
      title: string;
      impact: string;
      review: string;
      required: string;
      reject: string;
      revision: string;
      approve: string;
      changes: string[];
      outcomes: { approved: string; revision: string; rejected: string };
      continues: string[];
      again: string;
    };
    deploy: { file: string; stages: string[]; production: string };
  };
  beforeAfter: {
    title: string;
    before: string;
    beforeLabel: string;
    afterLabel: string;
    after: { label: string; value: string }[];
  };
  infra: {
    title: string;
    body: string;
    mapLabel: string;
    vercel: { role: string; items: string[] };
    supabase: { role: string; items: string[] };
    domainAlt: string;
    terminalCaption: string;
    terminalProject: string;
    terminalVersion: string;
  };
  demo: {
    title: string;
    body: string;
    label: string;
    placeholder: string;
    error: string;
    submit: string;
    tryOne: string;
    examples: string[];
    empty: string;
    understood: string;
    accepted: string;
    why: string;
    unmatched: string;
    edit: string;
    accept: string;
    start: string;
    starting: string;
    rows: {
      type: string;
      users: string;
      usersUnknown: string;
      frontend: string;
      backend: string;
      backendValue: string;
      database: string;
      auth: string;
      authRoles: string;
      authEmail: string;
      authNone: string;
      development: string;
      landing: string;
      noLanding: string;
    };
  };
  useCases: {
    file: string;
    title: string;
    intro: string;
    start: string;
    items: { type: ProjectTypeId; label: string; brief: string }[];
  };
  finalCta: { node: string; lines: [string, string, string]; primary: string; secondary: string };
  footer: { tagline: string[] };
}
