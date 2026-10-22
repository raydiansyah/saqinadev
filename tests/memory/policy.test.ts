import { describe, expect, it } from "vitest";
import {
  type AclGrant,
  canManage,
  canRead,
  isRetrievable,
  type Principal,
} from "@/lib/memory/policy";

const user = (
  userId: string,
  role: "owner" | "admin" | "editor" | "viewer" = "editor",
): Principal => ({
  kind: "user",
  userId,
  role,
});
const agent = (agentId: string, canReadMemory = true): Principal => ({
  kind: "agent",
  agentId,
  creatorId: "u1",
  canReadMemory,
});
const asset = (over: Partial<Parameters<typeof canRead>[1]> = {}) => ({
  ownerId: "u1",
  visibility: "project" as const,
  status: "approved" as const,
  ...over,
});
const grant = (
  principalType: "user" | "agent",
  principalId: string,
  permission: "read" | "manage" = "read",
): AclGrant => ({
  principalType,
  principalId,
  permission,
});

describe("memory read policy", () => {
  it("keeps private memory with its owner, even from admins and from the owner's agents", () => {
    const a = asset({ visibility: "private" });
    expect(canRead(user("u1"), a)).toBe(true);
    expect(canRead(user("u2", "owner"), a)).toBe(false);
    expect(canRead(agent("ag1"), a)).toBe(false);
  });

  it("shows project memory to members and to agents allowed to read memory", () => {
    expect(canRead(user("u2", "viewer"), asset())).toBe(true);
    expect(canRead(agent("ag1"), asset())).toBe(true);
    expect(canRead(agent("ag1", false), asset())).toBe(false);
  });

  it("needs an ACL grant for restricted and agent assets", () => {
    const restricted = asset({ visibility: "restricted" });
    expect(canRead(user("u2"), restricted)).toBe(false);
    expect(canRead(user("u2"), restricted, [grant("user", "u2")])).toBe(true);
    expect(canRead(user("u1"), restricted)).toBe(true);

    const forAgent = asset({ visibility: "agent" });
    expect(canRead(agent("ag1"), forAgent)).toBe(false);
    expect(canRead(agent("ag1"), forAgent, [grant("agent", "ag2")])).toBe(false);
    expect(canRead(agent("ag1"), forAgent, [grant("agent", "ag1")])).toBe(true);
    // A user id that equals an agent id is not the agent.
    expect(canRead(agent("x"), forAgent, [grant("user", "x")])).toBe(false);
  });

  it("hides unreviewed assets from agents and from everyone but the owner and admins", () => {
    const pending = asset({ status: "pending_review" });
    expect(canRead(agent("ag1"), pending)).toBe(false);
    expect(canRead(user("u2", "editor"), pending)).toBe(false);
    expect(canRead(user("u2", "admin"), pending)).toBe(true);
    expect(canRead(user("u1", "editor"), pending)).toBe(true);
    // Rejected or archived: only the owner, not even admins.
    expect(canRead(user("u2", "admin"), asset({ status: "archived" }))).toBe(false);
  });

  it("never grants organization-wide assets by accident", () => {
    expect(canRead(user("u1"), asset({ visibility: "organization" }))).toBe(false);
  });
});

describe("memory manage policy", () => {
  it("lets owners and admins manage shared memory, but only owners manage private", () => {
    expect(canManage(user("u1"), asset())).toBe(true);
    expect(canManage(user("u2", "admin"), asset())).toBe(true);
    expect(canManage(user("u2", "editor"), asset())).toBe(false);
    expect(canManage(user("u2", "admin"), asset({ visibility: "private" }))).toBe(false);
  });

  it("never lets viewers or agents manage, and honours a manage grant", () => {
    expect(canManage(user("u1", "viewer"), asset())).toBe(false);
    expect(canManage(agent("ag1"), asset(), [grant("agent", "ag1", "manage")])).toBe(false);
    const restricted = asset({ visibility: "restricted" });
    expect(canManage(user("u2"), restricted, [grant("user", "u2", "read")])).toBe(false);
    expect(canManage(user("u2"), restricted, [grant("user", "u2", "manage")])).toBe(true);
  });
});

describe("retrievable", () => {
  const now = new Date("2026-01-01");
  it("needs approval and a validity window that has not ended", () => {
    expect(isRetrievable("approved", null, now)).toBe(true);
    expect(isRetrievable("approved", new Date("2025-12-31"), now)).toBe(false);
    expect(isRetrievable("approved", new Date("2026-02-01"), now)).toBe(true);
    expect(isRetrievable("pending_review", null, now)).toBe(false);
    expect(isRetrievable("superseded", null, now)).toBe(false);
  });
});

describe("unreviewed restricted assets", () => {
  it("stay with their owner: an admin cannot read them without a grant", () => {
    const a = {
      ownerId: "u1",
      visibility: "restricted" as const,
      status: "pending_review" as const,
    };
    expect(canRead({ kind: "user", userId: "u2", role: "admin" }, a)).toBe(false);
    expect(canRead({ kind: "user", userId: "u1", role: "editor" }, a)).toBe(true);
  });
});
