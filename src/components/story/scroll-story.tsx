import type { ReactNode } from "react";
import { Container } from "@/components/primitives/container";
import type { SiteContent } from "@/content/site";
import { type ChapterId, STORY } from "@/content/story";
import { AgentSelector } from "./stage/agent-selector";
import { ApprovalDemo } from "./stage/approval-demo";
import { DeployFlow } from "./stage/deploy-flow";
import { DocumentStack } from "./stage/document-stack";
import { IdeaFragments } from "./stage/idea-fragments";
import { McpFlow } from "./stage/mcp-flow";
import { MemoryFlow } from "./stage/memory-flow";
import { PathSplit } from "./stage/path-split";
import { ProjectStructure } from "./stage/project-structure";
import { StoryController } from "./story-controller";
import { StoryRail } from "./story-rail";

const TRACK_ID = "story-track";

interface ScrollStoryProps {
  story: SiteContent["story"];
  stage: SiteContent["stage"];
  /** Translated task status labels for the MCP and approval visuals. */
  statuses: Record<string, string>;
}

/**
 * The cinematic core of the landing page. All copy is server-rendered HTML; on large screens
 * with motion allowed, the frame pins and chapters swap in place as the visitor scrolls.
 */
export function ScrollStory({ story, stage, statuses }: ScrollStoryProps) {
  const visuals: Record<ChapterId, ReactNode> = {
    idea: <IdeaFragments content={stage.idea} />,
    project: <ProjectStructure content={stage.project} />,
    paths: <PathSplit content={stage.paths} />,
    agents: <AgentSelector content={stage.agents} />,
    documents: <DocumentStack content={stage.documents} planned={stage.planned} />,
    memory: <MemoryFlow content={stage.memory} planned={stage.planned} />,
    mcp: <McpFlow content={stage.mcp} planned={stage.planned} statuses={statuses} />,
    approval: <ApprovalDemo content={stage.approval} demo={stage.demo} statuses={statuses} />,
    deploy: <DeployFlow content={stage.deploy} planned={stage.planned} />,
  };

  return (
    <section id="how-it-works" aria-labelledby="story-heading" className="border-t border-border">
      <Container className="pt-20 sm:pt-28">
        <h2
          id="story-heading"
          className="max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {story.title}
        </h2>
        <p className="mt-4 text-muted-foreground">{story.note}</p>
      </Container>

      <div id={TRACK_ID} className="story-track">
        <div className="story-sticky">
          <Container className="story-frame pinned:relative">
            <StoryRail initialNode={STORY[0].node} content={story} />

            {STORY.map((chapter, i) => (
              <article
                key={chapter.id}
                data-chapter-id={chapter.id}
                data-active={i === 0 ? "" : undefined}
                aria-labelledby={`chapter-${chapter.id}`}
                className="chapter group/chapter stacked:grid stacked:gap-8 stacked:py-14 sm:stacked:py-20 lg:stacked:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)] lg:stacked:items-center lg:stacked:gap-12"
              >
                <div className="chapter-text">
                  <p className="font-mono text-sm text-primary">{chapter.index}</p>
                  <h3
                    id={`chapter-${chapter.id}`}
                    className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl"
                  >
                    {story.chapters[chapter.id].title}
                  </h3>
                  <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
                    {story.chapters[chapter.id].body}
                  </p>
                </div>
                <div className="chapter-visual">{visuals[chapter.id]}</div>
              </article>
            ))}
          </Container>
        </div>
        <StoryController trackId={TRACK_ID} />
      </div>
    </section>
  );
}
