"use client";

import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  forkConversationAction,
  loadConversationAction,
  pinChapterAction,
  previewRewindAction,
  rewindAction,
  setAgentAccessAction,
  unpinChapterAction,
} from "@/app/[locale]/(app)/project/[slug]/assistant/actions";
import { useRouter } from "@/i18n/navigation";
import type { StreamEvent } from "@/lib/assistant/blocks";
import type {
  AgentOption,
  AgentReadItem,
  ChapterItem,
  ChatContext,
  ConversationMeta,
  ProposalView,
  RewindPreview,
  RunView,
  Stage,
  UIMessage,
} from "./types";

export interface ChatError {
  code: string;
  ref?: string;
}

interface State {
  conversationId: string | null;
  messages: UIMessage[];
  proposals: Record<string, ProposalView>;
  runs: Record<string, RunView>;
  agents: AgentOption[];
  hasMore: boolean;
  chapters: ChapterItem[];
  agentReads: AgentReadItem[];
  info: ConversationMeta | null;
}

const EMPTY: State = {
  conversationId: null,
  messages: [],
  proposals: {},
  runs: {},
  agents: [],
  hasMore: false,
  chapters: [],
  agentReads: [],
  info: null,
};
const PENDING_ID = "pending-reply";

const byId = <T extends { id: string }>(list: T[]) =>
  Object.fromEntries(list.map((x) => [x.id, x]));

/**
 * Client side of a conversation: streams replies from the assistant route, keeps the thread
 * in sync with the server after each reply, and refreshes the workspace when something changed.
 */
export function useAssistant(
  slug: string,
  initial?: Partial<State>,
  options: { onFocus?: (target: "plan" | "agents") => void } = {},
) {
  const locale = useLocale();
  // Kept in a ref so a new callback each render never restarts a stream.
  const onFocus = useRef(options.onFocus);
  onFocus.current = options.onFocus;
  const router = useRouter();
  const [state, setState] = useState<State>({ ...EMPTY, ...initial });
  // The latest state for callbacks that loop (loading older pages until a message appears).
  const stateRef = useRef(state);
  stateRef.current = state;
  const [stage, setStage] = useState<Stage | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Set by "New conversation": the next message opens a new thread instead of continuing one.
  const freshNext = useRef(false);

  useEffect(() => () => abort.current?.abort(), []);

  /** Replaces the thread with the server's view, including live proposal and run state. */
  const load = useCallback(
    async (conversationId: string | null) => {
      if (!conversationId) {
        setState(EMPTY);
        return;
      }
      setLoading(true);
      const result = await loadConversationAction(slug, { conversationId });
      setLoading(false);
      if (!result.ok)
        return setError({ code: result.code, ref: result.ok ? undefined : result.ref });
      const { messages, proposals, runs, agents, hasMore, chapters, agentReads, conversation } =
        result.data;
      setState({
        conversationId,
        messages,
        proposals: byId(proposals),
        runs: Object.fromEntries(runs.map((r) => [r.run.id, r])),
        agents,
        hasMore,
        chapters,
        agentReads,
        info: conversation,
      });
    },
    [slug],
  );

  const loadOlder = useCallback(async () => {
    const { conversationId, messages } = stateRef.current;
    const first = messages[0];
    if (!conversationId || !first) return false;
    const result = await loadConversationAction(slug, {
      conversationId,
      before: { createdAt: first.createdAt, id: first.id },
    });
    if (!result.ok) return false;
    setState((s) => ({
      ...s,
      messages: [...result.data.messages, ...s.messages],
      proposals: { ...s.proposals, ...byId(result.data.proposals) },
      runs: { ...s.runs, ...Object.fromEntries(result.data.runs.map((r) => [r.run.id, r])) },
      agents: s.agents.length ? s.agents : result.data.agents,
      hasMore: result.data.hasMore,
    }));
    return true;
  }, [slug]);

  /** Loads older pages until the message is on screen. False when it cannot be found. */
  const ensureLoaded = useCallback(
    async (messageId: string) => {
      for (let page = 0; page < 40; page++) {
        const { messages, hasMore } = stateRef.current;
        if (messages.some((m) => m.id === messageId)) return true;
        if (!hasMore || !(await loadOlder())) return false;
      }
      return false;
    },
    [loadOlder],
  );

  const updatePending = useCallback(
    (fn: (m: UIMessage) => UIMessage) =>
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) => (m.id === PENDING_ID ? fn(m) : m)),
      })),
    [],
  );

  const send = useCallback(
    async (content: string, context: ChatContext, opts: { fresh?: boolean } = {}) => {
      const text = content.trim();
      if (!text) return;
      const options = { fresh: opts.fresh ?? freshNext.current };
      freshNext.current = false;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const clientId = crypto.randomUUID();
      const now = new Date();
      setError(null);
      setBusy(true);
      setStage("analyzing");
      setState((s) => ({
        ...(options.fresh ? EMPTY : s),
        messages: [
          ...(options.fresh ? [] : s.messages),
          {
            id: clientId,
            role: "user",
            content: text,
            status: "completed",
            blocks: [],
            createdAt: now,
          },
          {
            id: PENDING_ID,
            role: "assistant",
            content: "",
            status: "processing",
            blocks: [],
            createdAt: now,
          },
        ],
      }));

      let conversationId = options.fresh ? null : state.conversationId;
      let mutated = false;
      let failed: ChatError | null = null;
      try {
        const response = await fetch(`/api/projects/${slug}/assistant`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId,
            fresh: options.fresh,
            clientId,
            content: text,
            locale,
            context: context.type === "project" ? null : { type: context.type, id: context.id },
          }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => null)) as { code?: string } | null;
          throw Object.assign(new Error("request failed"), {
            code: body?.code ?? "INTERNAL_ERROR",
          });
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as StreamEvent;
            if (event.type === "started") conversationId = event.conversationId;
            else if (event.type === "status") setStage(event.stage);
            else if (event.type === "delta")
              updatePending((m) => ({ ...m, content: m.content + event.text }));
            else if (event.type === "block")
              updatePending((m) => ({ ...m, blocks: [...m.blocks, event.block] }));
            else if (event.type === "done") mutated = event.mutated;
            else if (event.type === "focus") onFocus.current?.(event.target);
            else if (event.type === "error") failed = { code: event.code, ref: event.ref };
          }
        }
      } catch (e) {
        if (controller.signal.aborted) failed = { code: "CANCELLED" };
        else failed = { code: (e as { code?: string }).code ?? "network" };
      } finally {
        setBusy(false);
        setStage(null);
      }
      if (failed && failed.code !== "CANCELLED") setError(failed);
      // Sync with what the server stored, then let the workspace pick up any change.
      if (conversationId) await load(conversationId);
      else
        updatePending((m) => ({
          ...m,
          status: failed?.code === "CANCELLED" ? "cancelled" : "failed",
        }));
      if (mutated) router.refresh();
    },
    [slug, locale, state.conversationId, load, router, updatePending],
  );

  /** After approving or rejecting: reload the thread and the workspace. */
  const refresh = useCallback(async () => {
    if (state.conversationId) await load(state.conversationId);
    router.refresh();
  }, [state.conversationId, load, router]);

  const fail = useCallback(
    (result: { ok: false; code: string; ref?: string }) =>
      setError({ code: result.code, ref: result.ref }),
    [],
  );

  /** Pins a message as a chapter (or renames it), or removes the pin. */
  const pin = useCallback(
    async (messageId: string, title?: string) => {
      if (!state.conversationId) return;
      const result = await pinChapterAction(slug, {
        conversationId: state.conversationId,
        messageId,
        title,
      });
      if (!result.ok) return fail(result);
      await load(state.conversationId);
    },
    [slug, state.conversationId, load, fail],
  );

  const unpin = useCallback(
    async (messageId: string) => {
      if (!state.conversationId) return;
      const result = await unpinChapterAction(slug, {
        conversationId: state.conversationId,
        messageId,
      });
      if (!result.ok) return fail(result);
      await load(state.conversationId);
    },
    [slug, state.conversationId, load, fail],
  );

  /** Copies the thread up to a message into a new one and opens it. */
  const fork = useCallback(
    async (messageId: string, title?: string) => {
      if (!state.conversationId) return null;
      const result = await forkConversationAction(slug, {
        conversationId: state.conversationId,
        messageId,
        title,
      });
      if (!result.ok) {
        fail(result);
        return null;
      }
      await load(result.data.conversationId);
      return result.data.conversationId;
    },
    [slug, state.conversationId, load, fail],
  );

  const previewRewind = useCallback(
    async (messageId: string): Promise<RewindPreview | null> => {
      if (!state.conversationId) return null;
      const result = await previewRewindAction(slug, {
        conversationId: state.conversationId,
        messageId,
      });
      if (!result.ok) {
        fail(result);
        return null;
      }
      return result.data;
    },
    [slug, state.conversationId, fail],
  );

  /** Goes back to a message. Returns what happened; a blocked rewind changes nothing. */
  const rewind = useCallback(
    async (messageId: string) => {
      if (!state.conversationId) return null;
      const result = await rewindAction(slug, { conversationId: state.conversationId, messageId });
      if (!result.ok) {
        fail(result);
        return null;
      }
      if (result.data.applied) {
        await load(state.conversationId);
        router.refresh();
      }
      return result.data;
    },
    [slug, state.conversationId, load, router, fail],
  );

  const setAgentAccess = useCallback(
    async (enabled: boolean) => {
      if (!state.conversationId) return;
      const result = await setAgentAccessAction(slug, {
        conversationId: state.conversationId,
        enabled,
      });
      if (!result.ok) return fail(result);
      setState((s) => (s.info ? { ...s, info: { ...s.info, agentAccess: enabled } } : s));
    },
    [slug, state.conversationId, fail],
  );

  return {
    ...state,
    stage,
    busy,
    loading,
    error,
    send,
    stop: () => abort.current?.abort(),
    load,
    loadOlder,
    ensureLoaded,
    pin,
    unpin,
    fork,
    previewRewind,
    rewind,
    setAgentAccess,
    refresh,
    clearError: () => setError(null),
    startNew: () => {
      abort.current?.abort();
      freshNext.current = true;
      setError(null);
      setState(EMPTY);
    },
  };
}

export type AssistantController = ReturnType<typeof useAssistant>;
