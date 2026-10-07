import { describe, expect, it } from "vitest";
import { en } from "@/content/site/en";
import { id } from "@/content/site/id";
import { chapterAt, localProgress, RAIL_STOPS, STORY, stepAt } from "@/content/story";

describe("story timeline", () => {
  it("covers 0 to 1 with contiguous, increasing ranges", () => {
    expect(STORY[0].range[0]).toBe(0);
    expect(STORY.at(-1)?.range[1]).toBe(1);
    for (let i = 1; i < STORY.length; i++) {
      expect(STORY[i].range[0]).toBe(STORY[i - 1].range[1]);
      expect(STORY[i].range[1]).toBeGreaterThan(STORY[i].range[0]);
    }
  });

  it("maps progress to chapters and steps", () => {
    expect(chapterAt(0).id).toBe("idea");
    expect(chapterAt(0.3).id).toBe("paths");
    expect(chapterAt(1).id).toBe("deploy");
    expect(chapterAt(-5).id).toBe("idea");
    const deploy = STORY.at(-1);
    if (!deploy) throw new Error("missing chapter");
    expect(localProgress(deploy, 1)).toBe(1);
    expect(stepAt(deploy, 1)).toBe(deploy.steps - 1);
    expect(stepAt(deploy, 0)).toBe(0);
  });

  it("only references rail stops that exist", () => {
    for (const chapter of STORY) expect(RAIL_STOPS).toContain(chapter.rail);
  });

  it("has copy for every chapter in every language", () => {
    for (const content of [en, id]) {
      for (const chapter of STORY) expect(content.story.chapters[chapter.id].title).toBeTruthy();
    }
  });
});
