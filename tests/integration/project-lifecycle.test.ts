import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { createClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { activities, projectMembers, projects } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  createProject,
  deleteProject,
  listProjects,
  setProjectArchived,
  updateProjectGeneral,
} from "@/lib/projects/service";
import { createUser, resetDatabase } from "../helpers/db";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

let owner: Actor;
let stranger: Actor;

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  stranger = await createUser("Stranger");
});

afterAll(async () => {
  await resetDatabase();
});

describe("creating a project", () => {
  it("creates the project, the owner membership and a creation event", async () => {
    const { slug } = await createProject(owner, { name: "Restaurant POS" }, "id");
    expect(slug).toMatch(/^restaurant-pos-[a-z2-9]{4}$/);

    const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
    expect(project).toMatchObject({
      name: "Restaurant POS",
      nameSource: "user",
      status: "planning",
      locale: "id",
      clientId: null,
      ownerId: owner.id,
    });
    const [member] = await db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, project.id));
    expect(member).toMatchObject({ userId: owner.id, role: "owner" });
    const [created] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.projectId, project.id), eq(activities.type, "project.created")));
    expect(created).toBeDefined();
  });

  it("links a client of the same organization, and treats any other as not found", async () => {
    const mine = await createClient(owner, { name: "PT ABC", email: "abc@example.test" });
    const theirs = await createClient(stranger, { name: "PT XYZ", email: "xyz@example.test" });
    const { slug } = await createProject(owner, { name: "Website", clientId: mine.id }, "en");
    const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
    expect(project.clientId).toBe(mine.id);
    await expectCode(
      createProject(owner, { name: "Stolen", clientId: theirs.id }, "en"),
      "NOT_FOUND",
    );
  });

  it("rejects a name that is too short", async () => {
    await expectCode(createProject(owner, { name: "x" }, "en"), "VALIDATION_ERROR");
    await expectCode(createProject(owner, {}, "en"), "VALIDATION_ERROR");
  });
});

describe("authorization", () => {
  it("hides another user's project as not found and blocks every operation", async () => {
    const { slug } = await createProject(owner, { name: "Restaurant POS" }, "en");
    await expectCode(
      updateProjectGeneral(stranger, slug, { name: "Mine now", description: "" }),
      "NOT_FOUND",
    );
    await expectCode(setProjectArchived(stranger, slug, true), "NOT_FOUND");
    await expectCode(deleteProject(stranger, slug, "Restaurant POS"), "NOT_FOUND");
    expect(await listProjects(stranger)).toEqual([]);
  });
});

describe("project lifecycle", () => {
  it("updates, archives, restores to the previous status and deletes only with the exact name", async () => {
    const { slug } = await createProject(owner, { name: "Restaurant POS" }, "en");
    await updateProjectGeneral(owner, slug, {
      name: "Warung POS",
      description: "Cashier for our warung",
    });

    await setProjectArchived(owner, slug, true);
    expect(await listProjects(owner)).toHaveLength(0);
    expect(await listProjects(owner, { archived: true })).toHaveLength(1);

    await setProjectArchived(owner, slug, false);
    const [restored] = await listProjects(owner);
    expect(restored).toMatchObject({ name: "Warung POS", status: "planning", archived: false });

    await expectCode(deleteProject(owner, slug, "warung pos"), "VALIDATION_ERROR");
    await deleteProject(owner, slug, "Warung POS");
    expect(await db.select().from(projects)).toHaveLength(0);
  });
});
