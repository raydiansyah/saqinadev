"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  configureAgentAction,
  createCustomAgentAction,
  createHandoffAction,
  disconnectAgentAction,
  previewHandoffAction,
  testAgentAction,
} from "@/app/[locale]/(app)/project/[slug]/integrations/actions";
import { Dialog } from "@/components/app/dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select, TextArea } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import { AGENT_STRATEGIES, type AgentStrategy } from "@/lib/domain/enums";
import { CapabilityChecksAgent } from "./capability-checks";

export interface ExternalAgentView {
  id: string;
  name: string;
  type: string;
  strategy: AgentStrategy;
  endpoint: string | null;
  connectionStatus: string;
  hasSecret: boolean;
}

/** External agents: how Saqina reaches them, plus handing off a task. */
export function AgentsPanel({
  slug,
  agents,
  tasks,
  canManage,
}: {
  slug: string;
  agents: ExternalAgentView[];
  tasks: { id: string; title: string }[];
  canManage: boolean;
}) {
  const t = useTranslations("integrations.agents");
  const id = useId();
  const [handoff, setHandoff] = useState<ExternalAgentView | null>(null);
  const [custom, setCustom] = useState(false);
  return (
    <section aria-labelledby={`${id}-agents`} className="rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-agents`} className="font-semibold">
          {t("title")}
        </h2>
        {canManage ? (
          <Button size="sm" variant="outline" onClick={() => setCustom(true)}>
            {t("custom")}
          </Button>
        ) : null}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      <ul className="mt-4 space-y-3">
        {agents.map((agent) => (
          <li key={agent.id}>
            <AgentRow
              slug={slug}
              agent={agent}
              canManage={canManage}
              onHandoff={() => setHandoff(agent)}
            />
          </li>
        ))}
      </ul>
      {handoff ? (
        <HandoffDialog slug={slug} agent={handoff} tasks={tasks} onClose={() => setHandoff(null)} />
      ) : null}
      {custom ? <CustomAgentDialog slug={slug} onClose={() => setCustom(false)} /> : null}
    </section>
  );
}

function AgentRow({
  slug,
  agent,
  canManage,
  onHandoff,
}: {
  slug: string;
  agent: ExternalAgentView;
  canManage: boolean;
  onHandoff: () => void;
}) {
  const t = useTranslations("integrations.agents");
  const id = useId();
  const [strategy, setStrategy] = useState<AgentStrategy>(agent.strategy);
  const [test, setTest] = useState<{ ok: boolean; code: string } | null>(null);
  const { pending, error, run } = useRun();
  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{agent.name}</p>
        <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs">
          {agent.connectionStatus}
        </span>
      </div>
      {canManage ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]"
          action={(form) =>
            run(() =>
              configureAgentAction(slug, {
                agentId: agent.id,
                strategy,
                endpoint: String(form.get("endpoint") ?? "") || null,
                secret: String(form.get("secret") ?? "") || undefined,
              }),
            )
          }
        >
          <Select
            id={`${id}-strategy`}
            name="strategy"
            label={t("strategy")}
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as AgentStrategy)}
          >
            {AGENT_STRATEGIES.map((s) => (
              <option key={s} value={s} disabled={["api", "cli", "mcp"].includes(s)}>
                {t(`strategies.${s}`)}
              </option>
            ))}
          </Select>
          {strategy === "webhook" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id={`${id}-endpoint`}
                name="endpoint"
                label={t("endpoint")}
                defaultValue={agent.endpoint ?? ""}
                maxLength={300}
              />
              <Field
                id={`${id}-secret`}
                name="secret"
                type="password"
                autoComplete="off"
                label={t("secret")}
                hint={t("secretHint")}
                maxLength={500}
              />
            </div>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button size="sm" type="submit" disabled={pending}>
              {t("save")}
            </Button>
            {strategy === "webhook" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => testAgentAction(slug, { agentId: agent.id }), setTest)}
              >
                {t("test")}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onHandoff}>
              {t("handOff")}
            </Button>
            {agent.connectionStatus !== "disconnected" && agent.hasSecret ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => disconnectAgentAction(slug, { agentId: agent.id }))}
              >
                {t("disconnect")}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
      {test ? (
        <Notice tone={test.ok ? "success" : "error"} className="mt-3">
          {test.ok ? t("testOk") : t("testFailed", { reason: test.code })}
        </Notice>
      ) : null}
      <FormError error={error} />
    </div>
  );
}

interface Preview {
  meta: { contextVersion: number };
  files: { name: string; bytes: number }[];
  excluded: string[];
  redactions: number;
}

/** Preview first: exactly which files go out. Creating the handoff is the explicit approval. */
function HandoffDialog({
  slug,
  agent,
  tasks,
  onClose,
}: {
  slug: string;
  agent: ExternalAgentView;
  tasks: { id: string; title: string }[];
  onClose: () => void;
}) {
  const t = useTranslations("integrations.handoff");
  const id = useId();
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [input, setInput] = useState({ taskId: tasks[0]?.id ?? "", instructions: "" });
  const [key] = useState(() => crypto.randomUUID());
  const { pending, error, run } = useRun();
  const body = {
    agentId: agent.id,
    taskId: input.taskId || null,
    instructions: input.instructions,
    format: "prompt",
  };
  return (
    <Dialog open onClose={onClose} title={t("title", { agent: agent.name })}>
      <div className="space-y-4">
        <Select
          id={`${id}-task`}
          label={t("task")}
          value={input.taskId}
          onChange={(e) => {
            setInput((s) => ({ ...s, taskId: e.target.value }));
            setPreview(null);
          }}
        >
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </Select>
        <TextArea
          id={`${id}-instructions`}
          label={t("instructions")}
          rows={3}
          maxLength={4000}
          value={input.instructions}
          onChange={(e) => {
            setInput((s) => ({ ...s, instructions: e.target.value }));
            setPreview(null);
          }}
        />
        {preview ? (
          <div className="rounded-md border border-border p-3 text-sm">
            <p className="font-mono text-xs text-subtle-foreground">
              {t("version", { version: preview.meta.contextVersion })}
            </p>
            <p className="mt-2 font-medium">{t("files")}</p>
            <ul className="mt-1 font-mono text-xs">
              {preview.files.map((f) => (
                <li key={f.name}>
                  {f.name} · {f.bytes} B
                </li>
              ))}
            </ul>
            {preview.excluded.length ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("excluded")}: <span className="font-mono">{preview.excluded.join(", ")}</span>
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("redactions", { count: preview.redactions })}
            </p>
          </div>
        ) : null}
        <FormError error={error} />
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            disabled={pending || !input.taskId}
            onClick={() => run(() => previewHandoffAction(slug, body), setPreview)}
          >
            {t("preview")}
          </Button>
          <Button
            disabled={pending || !preview}
            onClick={() =>
              run(
                () => createHandoffAction(slug, { ...body, idempotencyKey: key }),
                (data: { id: string }) =>
                  router.push(`/project/${slug}/agents/handoffs/${data.id}`),
              )
            }
          >
            {t("create")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CustomAgentDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const t = useTranslations("integrations.agents");
  const id = useId();
  const { pending, error, run } = useRun();
  return (
    <Dialog open onClose={onClose} title={t("custom")}>
      <form
        className="space-y-4"
        action={(form) =>
          run(
            () =>
              createCustomAgentAction(slug, {
                name: String(form.get("name") ?? ""),
                capabilities: form.getAll("capabilities").map(String),
                permissions: form.getAll("permissions").map(String),
              }),
            onClose,
          )
        }
      >
        <Field id={`${id}-name`} name="name" label={t("customName")} required maxLength={60} />
        <CapabilityChecksAgent />
        <FormError error={error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {t("create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
