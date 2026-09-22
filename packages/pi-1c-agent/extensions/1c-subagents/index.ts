import { spawn } from "node:child_process";
import crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { childModeGuardText, childToolAllowlist, evaluateSubagentRequest, isWriterAgent, parallelSafety, parseResources, parseSideEffects, resolveDiscoveredAgentName, selectExecutionStrategy, writerNames, WRITER_SUBAGENTS } from "../../lib/agent-policy.mjs";
import { childProcessEnv } from "../../lib/child-env.mjs";
import { buildChildResult, createChildOutputBuffer } from "../../lib/child-transport.mjs";
import { terminateProcessTree } from "../../lib/process-supervisor.mjs";
import { emitDiagnostic } from "../../lib/diagnostics.mjs";
import { HANDOFF_HEADING, handoffInstruction, parseUpstreamHandoff } from "../../lib/handoff.mjs";
import { current1cMode, requireBuild } from "../../lib/mode-state.mjs";
import { withSubagentSlot } from "../../lib/subagent-budget.mjs";
import { combineParallelHandoffs, loadWorkflows, verifyWorkflowHandoff } from "../../lib/workflows.mjs";
import {
  composeAgentCardLines,
  composeHubRows,
  composeHubText,
  composeWorkflowResult,
  invokeAction,
  mapRunStatus,
  publish,
  registerAction,
  RunTracker,
  uiAvailable,
} from "../../lib/ui/index.mjs";

type OneCMode = "plan" | "build" | "ask";
type AgentSource = "package" | "user" | "project";
type Agent = {
  name: string;
  description?: string;
  tools?: string[];
  capabilities: string[];
  mcpReadOnly?: boolean;
  sideEffects: string[];
  resources: { name: string; mode: "shared" | "exclusive" }[];
  model?: string;
  modelTier?: string;
  prompt: string;
  source: AgentSource;
  filePath: string;
};

type AgentFrontmatter = {
  name?: unknown;
  description?: unknown;
  tools?: unknown;
  capabilities?: unknown;
  mcpReadOnly?: unknown;
  sideEffects?: unknown;
  resources?: unknown;
  model?: unknown;
  modelTier?: unknown;
};

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const SUBAGENT_HEARTBEAT_MS = 15000;
const SUBAGENT_TIMEOUT_MS = Math.max(60_000, Number(process.env.PI_1C_SUBAGENT_TIMEOUT_MS ?? 600_000) || 600_000);
const SUBAGENT_KILL_GRACE_MS = 10_000;
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tracker = new RunTracker({ publish });

function describeExit(code: number | null, signalName?: string | null): string {
  if (signalName) return `прерван сигналом ${signalName}`;
  if (code === null) return "завершился без кода";
  if (code > 128) return `прерван сигналом ${code - 128}`;
  return `exited ${code}`;
}

function parseList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return raw.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

function parseAgent(filePath: string, source: AgentSource): Agent | null {
  let raw: string;
  try { raw = fs.readFileSync(filePath, "utf8"); } catch { return null; }
  const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(raw);
  if (typeof frontmatter.name !== "string" || !frontmatter.name.startsWith("1c-")) return null;
  return {
    name: frontmatter.name,
    description: typeof frontmatter.description === "string" ? frontmatter.description : undefined,
    tools: parseList(frontmatter.tools),
    capabilities: parseList(frontmatter.capabilities).map((x) => x.toLowerCase()),
    mcpReadOnly: frontmatter.mcpReadOnly === true,
    sideEffects: parseSideEffects(frontmatter.sideEffects),
    resources: parseResources(frontmatter.resources),
    model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
    modelTier: typeof frontmatter.modelTier === "string" ? frontmatter.modelTier : undefined,
    prompt: body,
    source,
    filePath,
  };
}

function readAgentsDir(dir: string, source: AgentSource): Agent[] {
  if (!fs.existsSync(dir)) return [];
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => (e.isFile() || e.isSymbolicLink()) && e.name.endsWith(".md"))
    .map((e) => parseAgent(path.join(dir, e.name), source))
    .filter((a): a is Agent => Boolean(a));
}

function projectAgentOptIn(cwd: string, trusted: boolean): boolean {
  if (!trusted) return false;
  const settingsPath = path.join(cwd, ".pi", "1c", "settings.json");
  if (!fs.existsSync(settingsPath)) return false;
  try { return JSON.parse(fs.readFileSync(settingsPath, "utf8"))?.projectAgents === true; } catch { return false; }
}

function globalAgentDir(): string {
  const env = process.env.PI_CODING_AGENT_DIR;
  return env && env.trim() ? env : path.join(os.homedir(), ".pi", "agent");
}

function discover(cwd: string, trusted: boolean): Agent[] {
  const map = new Map<string, Agent>();
  const activeDir = path.join(globalAgentDir(), "agents");
  const legacyDir = path.join(os.homedir(), ".pi", "agent", "agents");
  const projectDir = path.join(cwd, ".pi", "agents");
  for (const agent of readAgentsDir(activeDir, "user")) map.set(agent.name, agent);
  if (path.resolve(activeDir) !== path.resolve(legacyDir)) {
    for (const agent of readAgentsDir(legacyDir, "user")) if (!map.has(agent.name)) map.set(agent.name, agent);
  }
  if (projectAgentOptIn(cwd, trusted)) {
    for (const agent of readAgentsDir(projectDir, "project")) map.set(agent.name, agent);
  }
  return [...map.values()];
}

function loadDevEnv(cwd: string): Record<string, string> {
  let cur = cwd;
  while (true) {
    const file = path.join(cur, ".dev.env");
    if (fs.existsSync(file)) {
      const out: Record<string, string> = {};
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!m) continue;
        let value = m[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        out[m[1]] = value;
      }
      return out;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return {};
}

let cachedModelDefaults: Record<string, string> | null = null;
function loadModelDefaults(): Record<string, string> {
  if (cachedModelDefaults) return cachedModelDefaults;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(packageRoot, "config", "subagent-models.json"), "utf8"));
    cachedModelDefaults = parsed && typeof parsed === "object" ? parsed : {};
  } catch { cachedModelDefaults = {}; }
  return cachedModelDefaults;
}

function modelTierKey(tier?: string): string | undefined {
  return tier === "coding" ? "SUBAGENT_MODEL_CODING"
    : tier === "analysis" ? "SUBAGENT_MODEL_ANALYSIS"
    : tier === "light" ? "SUBAGENT_MODEL_LIGHT" : undefined;
}

function resolveAgentModel(agent: Agent, cwd: string): string | undefined {
  if (agent.model) return agent.model;
  const key = modelTierKey(agent.modelTier);
  if (!key) return undefined;
  const env = loadDevEnv(cwd);
  if (env[key]) return env[key];
  return loadModelDefaults()[key] || undefined;
}

function finalText(event: any): string {
  if (event?.type !== "message_end" || event?.message?.role !== "assistant") return "";
  const content = event.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((x: any) => x?.type === "text").map((x: any) => x.text).join("\n");
  return "";
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const mock = String(process.env.PI_1C_MOCK_PI || "").trim();
  if (mock && fs.existsSync(mock)) {
    return { command: process.execPath, args: [mock, ...args] };
  }
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  if (!/^(node|bun)(\.exe)?$/.test(execName)) return { command: process.execPath, args };
  return { command: "pi", args };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(null).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runAgent(
  agent: Agent,
  task: string,
  cwd: string,
  mode: OneCMode,
  allTools: string[],
  signal?: AbortSignal,
  onProgress?: (text: string) => void,
): Promise<{ agent: string; output: string; handoff: any; upstreamHandoff: string; source: AgentSource }> {
  const depth = Number(process.env.PI_1C_SUBAGENT_DEPTH ?? "0");
  if (depth >= 1) throw new Error("Nested 1C subagent delegation is blocked to prevent recursive orchestration.");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-1c-agent-"));
  const promptFile = path.join(tmpDir, "agent.md");
  const modeGuard = childModeGuardText(mode);
  fs.writeFileSync(promptFile, agent.prompt + modeGuard + handoffInstruction(), { mode: 0o600 });

  const args = ["--mode", "json", "-p", "--no-session", "--1c-mode", mode];
  const resolvedModel = resolveAgentModel(agent, cwd);
  if (resolvedModel) args.push("--model", resolvedModel);

  const tools = childToolAllowlist({ mode, agentTools: agent.tools, capabilities: agent.capabilities, allTools });
  if (tools.length > 0) args.push("--tools", tools.join(","));
  else args.push("--no-tools");
  args.push("--append-system-prompt", promptFile, `Task: ${task}\n\nEnd your final response with this exact heading and a schema-2 JSON fence:\n${HANDOFF_HEADING}`);

  const runId = crypto.randomUUID();
  const parentRunId = String(process.env.PI_1C_PARENT_RUN_ID || process.env.PI_1C_RUN_ID || "");
  const profileDir = globalAgentDir();
  const diagnosticBase = () => ({
    profileDir,
    runId,
    parentRunId,
    projectId: cwd,
    agent: agent.name,
    workflow: String(process.env.PI_1C_WORKFLOW || ""),
    stage: agent.name,
  });
  return withSubagentSlot(() => new Promise((resolve, reject) => {
    const invocation = getPiInvocation(args);
    const startedAt = Date.now();
    const proc = spawn(invocation.command, invocation.args, {
      cwd,
      env: childProcessEnv(process.env, {
        PI_1C_SUBAGENT_DEPTH: String(depth + 1),
        PI_1C_CHILD_PROCESS: "1",
        PI_1C_DISABLE_STARTUP_RECONCILE: "1",
        PI_1C_RUN_ID: runId,
        PI_1C_PARENT_RUN_ID: parentRunId || runId,
      }),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: true,
    });
    emitDiagnostic("subagent.started", { ...diagnosticBase(), childPid: proc.pid, durationMs: 0 });
    let last = "";
    const output = createChildOutputBuffer({
      onEvent: (event) => {
        const text = finalText(event);
        if (text) last = text;
        return text;
      },
    });
    let aborted = signal?.aborted === true;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    let killEscalated = false;
    const terminate = (sig: NodeJS.Signals) => {
      terminateProcessTree(proc, sig);
    };
    const onAbort = () => { aborted = true; terminate("SIGTERM"); };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    const heartbeat = onProgress
      ? setInterval(() => {
          const secs = Math.round((Date.now() - startedAt) / 1000);
          onProgress(`… ${agent.name} — работает ${secs}с`);
        }, SUBAGENT_HEARTBEAT_MS)
      : null;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      onProgress?.(`⏱ ${agent.name} — превышен лимит ${Math.round(SUBAGENT_TIMEOUT_MS / 1000)}с, останавливаю`);
      terminate("SIGTERM");
      killTimer = setTimeout(() => {
        killEscalated = true;
        emitDiagnostic("subagent.kill.escalated", { agent: agent.name });
        terminate("SIGKILL");
      }, SUBAGENT_KILL_GRACE_MS);
    }, SUBAGENT_TIMEOUT_MS);
    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    };
    proc.stdout.on("data", (data) => { output.pushStdout(data); });
    proc.stderr.on("data", (data) => { output.pushStderr(data); });
    proc.on("error", (error) => { cleanup(); reject(error); });
    proc.on("close", (code, signalName) => {
      output.flushRemainder();
      const snap = output.snapshot();
      if (snap.lastText) last = snap.lastText;
      const meta = buildChildResult({
        ok: code === 0 && !timedOut && !aborted && !snap.frameError,
        exitCode: code,
        signal: signalName,
        timedOut,
        durationMs: Date.now() - startedAt,
        outputTruncated: snap.outputTruncated,
        output: last,
        frameError: snap.frameError,
      });
      cleanup();
      emitDiagnostic(timedOut ? "subagent.timeout" : aborted ? "subagent.cancelled" : snap.frameError ? "subagent.frame_error" : code === 0 ? "subagent.completed" : "subagent.failed", {
        ...diagnosticBase(),
        childPid: proc.pid,
        durationMs: meta.durationMs,
        exitCode: code,
      });
      if (snap.frameError) return reject(Object.assign(new Error(`subagent ${agent.name} ${snap.frameError.error} frameBytes=${snap.frameError.frameBytes}`), { child: meta }));
      if (aborted || signal?.aborted) return reject(Object.assign(new Error(`subagent ${agent.name} отменён пользователем`), { child: meta }));
      if (timedOut) return reject(Object.assign(new Error(`subagent ${agent.name} превысил таймаут ${Math.round(SUBAGENT_TIMEOUT_MS / 1000)}с и был остановлен (${describeExit(code, signalName)}): ${snap.stderr.slice(-2000)}`), { child: meta }));
      if (code !== 0) return reject(Object.assign(new Error(`subagent ${agent.name} ${describeExit(code, signalName)}: ${snap.stderr.slice(-4000)}`), { child: meta }));
      const parsed = parseUpstreamHandoff(last);
      if (!parsed.ok) return reject(Object.assign(new Error(`subagent ${agent.name} returned invalid handoff: ${parsed.errors.join("; ")}`), { child: meta }));
      resolve({
        agent: agent.name,
        output: last,
        handoff: parsed.handoff,
        upstreamHandoff: parsed.section,
        source: agent.source,
        ...meta,
        ok: true,
      });
    });
  }), { profileDir: globalAgentDir(), agent, scopeKey: cwd });
}

const Item = Type.Object({ agent: Type.String(), task: Type.String() });
const Params = Type.Object({
  agent: Type.Optional(Type.String()),
  task: Type.Optional(Type.String()),
  parallel: Type.Optional(Type.Array(Item, { maxItems: MAX_PARALLEL_TASKS })),
  chain: Type.Optional(Type.Array(Item, { maxItems: MAX_PARALLEL_TASKS })),
});

export default function oneCSubagents(pi: ExtensionAPI) {
  async function contextAgents(ctx: any): Promise<Agent[]> {
    const trusted = typeof ctx.isProjectTrusted === "function" ? ctx.isProjectTrusted() : false;
    return discover(ctx.cwd, trusted);
  }

  async function publishDiscovered(ctx: any) {
    const agents = await contextAgents(ctx);
    const discovered = agents.map((a) => ({
      name: a.name,
      writer: isWriterAgent(a) || WRITER_SUBAGENTS.has(a.name),
      kind: isWriterAgent(a) || WRITER_SUBAGENTS.has(a.name) ? "writer" : "read-only",
      model: a.model,
      source: a.source,
    }));
    tracker.setDiscovered(discovered);
    return agents;
  }

  async function runOne(x: { agent: string; task: string }, ctx: any, signal: AbortSignal | undefined, onProgress?: (text: string) => void, extra: { workflowId?: string; stageIndex?: number } = {}) {
    const agents = await contextAgents(ctx);
    const byName = new Map(agents.map((a) => [a.name, a]));
    const resolvedName = resolveDiscoveredAgentName(x.agent, agents) || x.agent;
    const agent = byName.get(resolvedName);
    if (!agent) throw new Error(`Unknown 1C agent: ${x.agent}. Available: ${agents.map((a) => a.name).join(", ")}`);
    const mode = current1cMode();
    const allTools = pi.getAllTools().map((t) => t.name);
    evaluateSubagentRequest({ mode, agent, allTools });
    const local = new AbortController();
    if (signal) {
      if (signal.aborted) local.abort();
      else signal.addEventListener("abort", () => local.abort(), { once: true });
    }
    const writer = isWriterAgent(agent) || WRITER_SUBAGENTS.has(agent.name);
    const runId = tracker.start({
      agent: agent.name,
      kind: writer ? "writer" : "read-only",
      mode,
      model: agent.model,
      abort: local,
      workflowId: extra.workflowId,
      stageIndex: extra.stageIndex,
    });
    const tui = uiAvailable(ctx);
    const onAgentProgress = (text: string) => {
      const status = mapRunStatus({ event: "progress", agentName: agent.name, activity: text });
      tracker.update(runId, { status, activity: text });
      if (!tui) return;
      const run = tracker.get(runId);
      try { onUpdateSafe(onProgress, composeAgentCardLines(run).join("\n"), { ui: { ...run, abort: undefined } }); } catch {}
    };
    try {
      const result = await runAgent(agent, x.task, ctx.cwd, mode, allTools, local.signal, onAgentProgress);
      tracker.finish(runId, { ok: true });
      return result;
    } catch (error: any) {
      tracker.finish(runId, { ok: false, aborted: local.signal.aborted || signal?.aborted, error: error?.message || String(error) });
      throw error;
    }
  }

  function onUpdateSafe(onProgress: ((text: string) => void) | undefined, text: string, details?: unknown) {
    if (typeof onProgress === "function" && (onProgress as any).__onUpdate) {
      try { (onProgress as any).__onUpdate({ content: [{ type: "text", text }], details }); } catch {}
      return;
    }
    onProgress?.(text);
  }

  function bindEmit(onUpdate: any, ctx: any) {
    const tui = uiAvailable(ctx);
    const emit = ((text: string, details?: unknown) => {
      const heartbeat = Boolean(details && (details as any).heartbeat);
      if (!tui && heartbeat) return;
      try { onUpdate?.({ content: [{ type: "text", text }], details }); } catch {}
    }) as ((text: string, details?: unknown) => void) & { __onUpdate?: any };
    emit.__onUpdate = onUpdate;
    return emit;
  }

  function subagentRenderers() {
    return {
      renderShell: "self" as const,
      renderCall(args: any, theme: any, context: any) {
        const ui = context?.state?.ui || context?.state?.workflowUi;
        if (ui?.stages) return new Text(composeWorkflowResult(ui, { expanded: true }).join("\n"), 0, 0);
        if (ui) return new Text(composeAgentCardLines(ui).join("\n"), 0, 0);
        const name = args?.agent || (Array.isArray(args?.parallel) ? "parallel" : args?.workflow ? `workflow ${args.workflow}` : "subagent");
        return new Text(theme.fg("toolTitle", `AGENT ${String(name).replace(/^1c-/, "")}`), 0, 0);
      },
      renderResult(result: any, { expanded, isPartial }: any, theme: any, context: any) {
        const ui = result?.details?.ui || result?.details?.workflowUi;
        if (context?.state) {
          if (result?.details?.ui) context.state.ui = result.details.ui;
          if (result?.details?.workflowUi) context.state.workflowUi = result.details.workflowUi;
        }
        if (ui?.stages) {
          const lines = composeWorkflowResult(ui, { expanded: expanded || isPartial });
          return new Text(lines.join("\n"), 0, 0);
        }
        if (ui) {
          const lines = isPartial || expanded ? composeAgentCardLines(ui) : composeAgentCardLines({ ...ui, status: result.isError ? "failed" : (ui.status || "completed") });
          if (expanded && result?.content?.[0]?.text) return new Text(`${lines.join("\n")}\n\n${result.content[0].text}`, 0, 0);
          return new Text(lines.join("\n"), 0, 0);
        }
        const text = result?.content?.[0]?.text || (result?.isError ? theme.fg("error", "failed") : "");
        if (!expanded && !isPartial) {
          return new Text(result?.isError ? theme.fg("error", text.split("\n")[0] || "failed") : theme.fg("success", "completed"), 0, 0);
        }
        return new Text(text, 0, 0);
      },
    };
  }

  pi.registerTool({
    name: "subagent_1c",
    label: "1C Subagent",
    description: "Delegate 1C work to isolated Pi subprocesses with trust gating, capability-aware tools, validated handoffs and writer-concurrency protection.",
    parameters: Params,
    ...subagentRenderers(),
    async execute(_id, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
      if (Number(process.env.PI_1C_SUBAGENT_DEPTH ?? "0") >= 1) {
        return { content: [{ type: "text", text: "Nested 1C subagent delegation is blocked." }], isError: true };
      }
      const emit = bindEmit(onUpdate, ctx);
      const tui = uiAvailable(ctx);
      try {
        const strategy = selectExecutionStrategy(params);
        if (strategy.empty) {
          const agents = await contextAgents(ctx);
          return { content: [{ type: "text", text: `${strategy.reason}. Available: ${agents.map((a) => a.name).join(", ")}` }], isError: true };
        }
        if (!strategy.ok) throw new Error(strategy.reason);
        if (strategy.strategy === "agent") {
          if (!tui) emit(`▶ ${params.agent} — запуск…`);
          const result = await runOne({ agent: params.agent, task: params.task }, ctx, signal, emit as any);
          if (!tui) emit(`✔ ${params.agent} — готово`);
          return { content: [{ type: "text", text: result.output }], details: { ...result, ui: tracker.list().find((r) => r.agent === params.agent) } };
        }
        if (strategy.strategy === "parallel") {
          const agents = await contextAgents(ctx);
          const safety = parallelSafety(params.parallel, writerNames(agents), agents);
          if (!safety.ok) throw new Error(safety.reason);
          const names = params.parallel.map((x: any) => x.agent).join(", ");
          if (!tui) emit(`▶ parallel: ${names} — запуск…`);
          const results = await mapLimit(params.parallel, MAX_CONCURRENCY, (item) => runOne(item, ctx, signal, emit as any));
          if (!tui) emit(`✔ parallel: ${names} — готово`);
          return { content: [{ type: "text", text: results.map((r) => r.output).join("\n\n") }], details: results };
        }
        if (strategy.strategy === "chain") {
          const results: any[] = [];
          let upstream = "";
          for (const [index, step] of params.chain.entries()) {
            const task = upstream
              ? (step.task.includes("{previous}") ? step.task.replace(/\{previous\}/g, upstream) : `${step.task}\n\n${upstream}`)
              : step.task;
            const label = `chain [${index + 1}/${params.chain.length}] ${step.agent}`;
            if (!tui) emit(`▶ ${label} — запуск…`);
            const result = await runOne({ agent: step.agent, task }, ctx, signal, emit as any);
            results.push(result);
            upstream = result.upstreamHandoff;
            if (!tui) emit(`✔ ${label} — готово`);
          }
          return { content: [{ type: "text", text: results.map((r) => r.output).join("\n\n") }], details: results };
        }
        throw new Error("specify exactly one of agent+task, parallel[], or chain[]");
      } catch (error: any) {
        const agentName = params?.agent || params?.parallel?.[0]?.agent || params?.chain?.[0]?.agent;
        const run = [...tracker.list()].reverse().find((r) => !agentName || r.agent === agentName || r.agent === `1c-${agentName}`);
        return {
          content: [{ type: "text", text: error?.message || String(error) }],
          isError: true,
          details: { ui: { ...(run || {}), status: "failed", error: error?.message || String(error), endedAt: run?.endedAt || Date.now() } },
        };
      }
    },
  });

  const WorkflowParams = Type.Object({
    workflow: Type.String({ description: "Workflow name to execute. Pass the workflow name, NOT the mode — never pass 'BUILD' or 'PLAN'." }),
    task: Type.String(),
  });

  pi.registerTool({
    name: "workflow_1c",
    label: "1C Workflow",
    description: "Execute a deterministic BUILD pipeline with validated handoffs. Writer stages are always sequential.",
    parameters: WorkflowParams,
    ...subagentRenderers(),
    async execute(_id, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
      const emit = bindEmit(onUpdate, ctx);
      const tui = uiAvailable(ctx);
      const startedAt = Date.now();
      const workflowUi: any = { workflow: params.workflow, startedAt, stages: [] as any[] };
      const pushUi = () => {
        emit(composeWorkflowResult(workflowUi, { expanded: true }).join("\n"), { workflowUi, ui: workflowUi });
      };
      try {
        requireBuild("workflow_1c execution");
        const workflows = loadWorkflows(packageRoot);
        const workflow = workflows.get(params.workflow);
        if (!workflow) throw new Error(`Unknown workflow '${params.workflow}'. Available: ${[...workflows.keys()].join(", ")}`);
        workflowUi.stages = workflow.stages.map((stage: any) => ({
          agent: stage.agent || (stage.type === "parallel" ? stage.agents?.join(", ") : stage.type),
          name: stage.agent || stage.type,
          status: "idle",
        }));
        const results: any[] = [];
        const agents = await contextAgents(ctx);
        const writers = writerNames(agents);
        let upstream = "";
        let pendingVerification: any = null;
        const total = workflow.stages.length;
        for (const [index, stage] of workflow.stages.entries()) {
          if (signal?.aborted) throw new Error("workflow отменён пользователем");
          const step = `${index + 1}/${total}`;
          workflowUi.currentIndex = index;
          workflowUi.stages[index].status = "working";
          if (tui) pushUi();
          if (stage.type === "agent") {
            const task = upstream ? `${params.task}\n\n${upstream}` : params.task;
            if (!tui) emit(`▶ [${step}] ${stage.agent} — запуск…`);
            try {
              const result = await runOne({ agent: stage.agent, task }, ctx, signal, emit as any, { workflowId: params.workflow, stageIndex: index });
              results.push(result);
              upstream = result.upstreamHandoff;
              pendingVerification = result;
              workflowUi.stages[index].status = "completed";
              if (!tui) emit(`✔ [${step}] ${stage.agent} — готово`);
            } catch (error: any) {
              workflowUi.stages[index].status = "failed";
              workflowUi.stages[index].error = error?.message || String(error);
              throw error;
            }
            continue;
          }
          if (stage.type === "parallel") {
            const safety = parallelSafety(stage.agents.map((agent: string) => ({ agent, task: params.task })), writers, agents);
            if (!safety.ok) throw new Error(safety.reason);
            const names = stage.agents.join(", ");
            if (!tui) emit(`▶ [${step}] parallel: ${names} — запуск…`);
            const batch = await mapLimit(stage.agents, MAX_CONCURRENCY, (agent: string) => runOne({ agent, task: upstream ? `${params.task}\n\n${upstream}` : params.task }, ctx, signal, emit as any, { workflowId: params.workflow, stageIndex: index }));
            results.push(...batch);
            upstream = combineParallelHandoffs(batch);
            pendingVerification = null;
            workflowUi.stages[index].status = "completed";
            if (!tui) emit(`✔ [${step}] parallel: ${names} — готово`);
            continue;
          }
          if (stage.type === "verification") {
            if (!tui) emit(`▶ [${step}] verification — проверка…`);
            const gate = verifyWorkflowHandoff(pendingVerification);
            if (!gate.ok) {
              workflowUi.stages[index].status = "failed";
              workflowUi.stages[index].error = gate.reason;
              throw new Error(`Workflow verification gate failed: ${gate.reason}`);
            }
            results.push({ agent: "verification", output: `Verification gate PASS\n${gate.verification.map((x: string) => `- ${x}`).join("\n")}`, handoff: pendingVerification.handoff, upstreamHandoff: pendingVerification.upstreamHandoff, source: "package" });
            pendingVerification = null;
            workflowUi.stages[index].status = "completed";
            if (!tui) emit(`✔ [${step}] verification — PASS`);
          }
        }
        workflowUi.endedAt = Date.now();
        return { content: [{ type: "text", text: results.map((r) => r.output).join("\n\n") }], details: { workflow: params.workflow, definition: workflow, results, ui: workflowUi, workflowUi } };
      } catch (error: any) {
        workflowUi.endedAt = Date.now();
        emitDiagnostic("workflow.stage.failed", { workflow: params.workflow, reason: error?.message || String(error) });
        return { content: [{ type: "text", text: error?.message || String(error) }], isError: true, details: { ui: workflowUi, workflowUi } };
      }
    },
  });

  registerAction("agents-stop", (id: string) => tracker.stop(id));

  pi.registerCommand("agents", {
    description: "Показать доверенных/активных субагентов 1C и их источник",
    handler: async (_args, ctx) => {
      const agents = await publishDiscovered(ctx);
      if (uiAvailable(ctx)) {
        await invokeAction("agents-hub", ctx);
        return;
      }
      const rows = composeHubRows(
        agents.map((a) => ({ name: a.name, writer: isWriterAgent(a) || WRITER_SUBAGENTS.has(a.name) })),
        tracker.list(),
      );
      ctx.ui.notify(composeHubText(rows), "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    await publishDiscovered(ctx).catch(() => {});
  });
}

