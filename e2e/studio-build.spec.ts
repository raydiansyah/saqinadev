import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(__dirname, ".seed.json"), "utf8")) as {
  slug: string;
  repo: string;
  password: string;
};
const git = (...args: string[]) =>
  execFileSync("git", ["-C", seed.repo, ...args], { encoding: "utf8" }).trim();

async function signIn(page: Page, email = "owner@example.test") {
  await page.goto("/en/sign-in");
  await page.getByLabel(/email/i).fill(email);
  await page
    .getByLabel(/password/i)
    .first()
    .fill(seed.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard|project/);
}

async function openStudio(page: Page) {
  await page.goto(`/en/project/${seed.slug}/studio`);
  await expect(page.getByRole("radiogroup")).toBeVisible();
}

/** What the screen says about the execution, spoken to screen readers: "Build: Running". */
const state = (page: Page) => page.getByRole("status").filter({ hasText: /^(Build|Plan): / });
/** An agent's card in the work area (not the lines about it in the chat or the activity list). */
const agent = (page: Page, name: string) =>
  page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: name }).first();

async function send(page: Page, mode: "Chat" | "Plan" | "Build", text: string) {
  await page.getByRole("radio", { name: mode }).click();
  await page.locator("textarea").first().fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test.describe.configure({ mode: "serial" });

test("Build starts on its own and the Studio follows the work without a reload", async ({
  page,
}) => {
  await signIn(page);
  await openStudio(page);
  // If the page reloaded, this marker would be gone.
  await page.evaluate(() => {
    (window as unknown as { __kept: boolean }).__kept = true;
  });
  const mainBefore = git("rev-parse", "main");

  await send(page, "Build", "Add a wishlist");
  // Nobody presses a button on an agent: the agents start by themselves and are seen moving.
  await expect(state(page)).toHaveText("Build: Running");
  await expect(agent(page, "Backend Developer")).toContainText("Running");
  await expect(agent(page, "Frontend Developer")).toContainText("Waiting for agent");
  await expect(agent(page, "Backend Developer")).toContainText("Succeeded");
  await expect(state(page)).toHaveText("Build: Succeeded", { timeout: 60_000 });
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);

  // The plan, task by task, from the same state.
  await page.getByRole("tab", { name: "Plan" }).click();
  await expect(page.getByText("Add a wishlist: server code", { exact: true })).toBeVisible();
  await expect(page.getByText("Waits for:")).toHaveCount(0); // everything is done
  await expect(page.getByText("3 of 3 tasks done").first()).toBeVisible();

  // The code the agents really committed.
  await page.getByRole("tab", { name: "Code" }).click();
  const file = page.getByText("src/saqina/add-a-wishlist/server.ts", { exact: true });
  await expect(file).toBeVisible();
  await file.click();
  await expect(page.getByText('+export const note = "Add a wishlist: server code";')).toBeVisible();
  const branch = (await page.locator("text=/saqina\\/exec-[0-9a-f]{8}/").first().innerText()).match(
    /saqina\/exec-[0-9a-f]{8}/,
  )?.[0];
  expect(branch).toBeTruthy();
  expect(git("rev-list", "--count", `main..${branch}`)).toBe("2");
  expect(git("rev-parse", "main")).toBe(mainBefore);

  await page.getByRole("tab", { name: "Git" }).click();
  await expect(page.getByText("This repository is on this machine")).toBeVisible();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByText("No preview yet for this branch.")).toBeVisible();
  await page.getByRole("tab", { name: "Publish" }).click();
  await expect(
    page.getByText("The agents finished and the commits are on the work branch."),
  ).toBeVisible();
  await expect(page.getByText("Not published. A person merges and presses Publish.")).toBeVisible();

  // A reload brings back the same state from the server.
  await page.reload();
  await page.getByRole("tab", { name: "Agents" }).click();
  await expect(state(page)).toHaveText("Build: Succeeded");
});

test("Stop reaches the running agent, and says cancelling until it has stopped", async ({
  page,
}) => {
  await signIn(page);
  await openStudio(page);
  await send(page, "Build", "Add order tracking");
  await expect(agent(page, "Backend Developer")).toContainText("Running");
  await page.getByRole("button", { name: "Stop", exact: true }).first().click();
  await page.getByRole("button", { name: "Stop execution" }).click();
  await expect(state(page)).toHaveText(/Build: (Cancelling|Cancelled)/);
  await expect(state(page)).toHaveText("Build: Cancelled", { timeout: 40_000 });
  await expect(agent(page, "Frontend Developer")).toContainText("Cancelled");
});

test("Plan makes a plan and builds nothing until Build this plan is pressed", async ({ page }) => {
  await signIn(page);
  await openStudio(page);
  const before = git("branch", "--list").split("\n").length;
  await send(page, "Plan", "Add gift wrapping");
  await page.getByRole("tab", { name: "Plan" }).click();
  await expect(state(page)).toHaveText("Plan: Planned");
  await expect(page.getByText("Add gift wrapping: server code", { exact: true })).toBeVisible();
  await expect(page.getByText("0 of 3 tasks done").first()).toBeVisible();
  expect(git("branch", "--list").split("\n").length).toBe(before);

  await page.getByRole("button", { name: "Build this plan" }).click();
  await expect(state(page)).toHaveText("Build: Succeeded", { timeout: 60_000 });
  await expect(page.getByText("3 of 3 tasks done").first()).toBeVisible();
});

test("the Owner switches an agent off, and the next build says so instead of pretending", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.goto("/en/dashboard/ai/agents");
  await expect(page.getByRole("heading", { name: "Agent registry" })).toBeVisible();
  const card = page.getByRole("listitem").filter({ hasText: "Backend Developer" }).first();
  await expect(card).toContainText("v1");
  await card.getByRole("button", { name: "Switch off" }).click();
  await expect(card).toContainText("Off");

  await openStudio(page);
  await send(page, "Build", "Add a loyalty card");
  // The plan names a role nobody covers any more: the execution stops and says why.
  await expect(state(page)).toHaveText("Build: Failed", { timeout: 60_000 });
  await expect(page.getByText(/no agent covers/).first()).toBeVisible();
  expect(git("branch", "--list").includes("loyalty")).toBe(false);

  // Switch it back on and the same request works.
  await page.goto("/en/dashboard/ai/agents");
  const again = page.getByRole("listitem").filter({ hasText: "Backend Developer" }).first();
  await again.getByRole("button", { name: "Switch on" }).click();
  await expect(again).toContainText("On");
  await openStudio(page);
  await send(page, "Build", "Add a loyalty card");
  // Earlier builds in this run use up the project's per-minute git calls, so a task can be told to
  // wait and is retried by the queue. Nothing runs the cron here, so the retry can take a while.
  await expect(state(page)).toHaveText("Build: Succeeded", { timeout: 150_000 });
});

test("a person who is not the platform Owner cannot see or use the agent registry", async ({
  page,
}) => {
  await signIn(page, "member@example.test");
  await page.goto("/en/dashboard/ai/agents");
  // The area is not advertised: the same page as for an address that does not exist.
  await expect(page.getByText("This page is not part of the project yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent registry" })).toHaveCount(0);
});

test("the Studio fits a phone: no sideways scrolling, and the work area is one tap away", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await context.newPage();
  await signIn(page);
  await openStudio(page);
  await page.getByRole("button", { name: "Work area" }).click();
  await page.getByRole("tab", { name: "Agents" }).click();
  await expect(state(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await context.close();
});

test("the project sidebar folds away and stays folded after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await openStudio(page);
  const nav = page.getByRole("navigation", { name: "Project" });
  await expect(nav).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(nav).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(nav).toBeVisible();
});

test("the composer + menu: browse, press Add, and the skill is in the menu and on the message", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await openStudio(page);
  await page.getByRole("button", { name: "Add to message" }).click();
  await expect(page.getByRole("menuitem", { name: "Add files or photos" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Skills" }).click();
  await expect(page.getByText("Nothing added yet. Use Browse to add some.")).toBeVisible();
  await page.getByRole("menuitem", { name: "Browse skills" }).click();

  const dialog = page.getByRole("dialog", { name: "Browse" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("searchbox").fill("antislop");
  await dialog.getByRole("button", { name: "Add antislop: code comments" }).click();
  await expect(dialog.getByText("Added")).toBeVisible();
  await dialog.getByRole("button", { name: "Yours" }).click();
  await expect(dialog.getByText("antislop: code comments", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // It rides with the next message, and is in the menu as a switch that is on.
  await expect(page.getByRole("button", { name: /^Remove antislop: code comments/ })).toBeVisible();
  await page.getByRole("button", { name: "Add to message" }).click();
  await page.getByRole("menuitem", { name: "Skills" }).click();
  const use = page.getByRole("switch", { name: "Use antislop: code comments in this chat" });
  await expect(use).toBeChecked();
  await use.click();
  await expect(use).not.toBeChecked();

  // It is still there after a reload (a per-browser choice).
  await page.reload();
  await page.getByRole("button", { name: "Add to message" }).click();
  await page.getByRole("menuitem", { name: "Skills" }).click();
  await expect(
    page.getByRole("switch", { name: "Use antislop: code comments in this chat" }),
  ).toBeVisible();
});

test("the Owner picks installed skills for an agent, and they are kept", async ({ page }) => {
  await signIn(page);
  await page.goto("/en/dashboard/ai/agents");
  const row = page.getByRole("listitem").filter({ hasText: "Backend Developer" }).first();
  await row.getByRole("link", { name: "Edit" }).click();
  const skill = page.getByRole("checkbox", { name: /antislop: code comments/ });
  await expect(skill).not.toBeChecked();
  await skill.check();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/dashboard\/ai\/agents$/);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Backend Developer" })
    .first()
    .getByRole("link", { name: "Edit" })
    .click();
  await expect(page.getByRole("checkbox", { name: /antislop: code comments/ })).toBeChecked();
});

test("Start building on the approved PRD starts a Build, and the chat shows it live", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/project/${seed.slug}/prd`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Start building" }).click();
  await page.waitForURL(/\/studio$/);
  await page.evaluate(() => {
    (window as unknown as { __kept: boolean }).__kept = true;
  });
  // Nobody presses anything else: the build runs and the chat card follows it without a reload.
  await expect(state(page)).toHaveText(/^Build: (Running|Succeeded)$/, { timeout: 30_000 });
  await expect(
    page.getByRole("log").or(page.getByRole("list")).getByText("Build the project").first(),
  ).toBeVisible();
  await expect(state(page)).toHaveText("Build: Succeeded", { timeout: 90_000 });
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
});

test.describe("local CLI as an AI provider", () => {
  test.skip(
    !process.env.ALLOW_LOCAL_CLI,
    "Needs ALLOW_LOCAL_CLI=1 and a logged-in CLI on this machine",
  );

  test("the Owner connects Claude Code from AI & Models; a member cannot reach it", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/en/dashboard/ai/providers");
    const card = page.getByRole("listitem").filter({ hasText: "Claude Code" }).first();
    await expect(card).toContainText("Installed");
    await expect(card).toContainText("Not connected");
    await card.getByRole("button", { name: "Connect and test" }).click();
    await expect(card).toContainText("Connected", { timeout: 120_000 });
    await expect(page.getByText("The CLI answered.")).toBeVisible();
    // It is now an ordinary provider with models, which the Owner can disconnect.
    const provider = page.getByRole("listitem").filter({ hasText: "Claude Code (local CLI)" });
    await expect(provider).toContainText("Local CLI");
    await expect(provider.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(provider.getByRole("button", { name: "Disconnect" })).toBeVisible();
  });

  test("a member who is not the platform Owner cannot see the CLI section", async ({ page }) => {
    await signIn(page, "member@example.test");
    await page.goto("/en/dashboard/ai/providers");
    await expect(page.getByText("This page is not part of the project yet.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Local CLI" })).toHaveCount(0);
  });
});
