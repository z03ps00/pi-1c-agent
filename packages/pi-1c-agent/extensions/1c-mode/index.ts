import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { overlayApproval, overlayModeSelect } from "../1c-ui/overlays.ts";
import { publish, registerAction, summarizeToolAction, uiAvailable } from "../../lib/ui/index.mjs";
import {
  approveLevelName,
  approvalScope,
  classifyDanger,
  cycleApproveLevel,
  describeApprove,
  normalizeApproveLevel,
  parseApproveLevel,
  resolveApproveStartup,
  shouldPrompt,
} from "../../lib/approve-policy.mjs";
import { dockerBlockReason } from "../../lib/docker-policy.mjs";
import { anonMutatorFallbackRegex } from "../../lib/memory-mutators.mjs";
import { evaluatePlanMcpToolCall, evaluatePlanToolCall, getPlanVisibleTools } from "../../lib/plan-policy.mjs";
import { acceptPlan, enterBuild, enterPlan, executePlan, extractPlanArtifact, initialModeState } from "../../lib/plan-state.mjs";
import * as planStateLib from "../../lib/plan-state.mjs";
import * as planPolicyLib from "../../lib/plan-policy.mjs";
import { set1cMode } from "../../lib/mode-state.mjs";

type OneCMode = "plan" | "build" | "ask";
type OneCPhase = "build-idle" | "plan-draft" | "plan-ready" | "ask-idle" | "build-executing";
type PlanArtifact = { id: string; text: string; stepCount: number; createdAt: string };
type ModeState = {
  mode: OneCMode;
  phase: OneCPhase;
  plan: PlanArtifact | null;
  anonLevel?: number;
  approveLevel?: number;
  lastInjectedMode?: OneCMode;
};
type SharedState = typeof globalThis & { __PI_1C_MODE__?: OneCMode; __PI_1C_PHASE__?: OneCPhase; __PI_1C_PLAN_ID__?: string };
const shared = globalThis as SharedState;

type AnonVerdict = { allowed: boolean; reason: string };

function libCall<T>(fn: unknown, args: unknown[]): T | undefined {
  try {
    if (typeof fn !== "function") return undefined;
    return (fn as (...a: unknown[]) => T)(...args);
  } catch {
    return undefined;
  }
}

const ANON_LIB = {
  normalize: (planStateLib as Record<string, unknown>).normalizeAnonLevel,
  parse: (planStateLib as Record<string, unknown>).parseAnonLevel,
  isReadOnly: (planStateLib as Record<string, unknown>).isReadOnlyMode,
  enterAsk: (planStateLib as Record<string, unknown>).enterAsk,
  completeBuild: (planStateLib as Record<string, unknown>).completeBuild,
  sanitize: (planStateLib as Record<string, unknown>).sanitizeModeState,
  mcpCall: (planPolicyLib as Record<string, unknown>).describeMcpCall,
  anonMcp: (planPolicyLib as Record<string, unknown>).evaluateAnonMcpCall,
  anonWrite: (planPolicyLib as Record<string, unknown>).evaluateAnonWriteCall,
  readOnlyTools: (planPolicyLib as Record<string, unknown>).getReadOnlyVisibleTools,
  readOnlyCall: (planPolicyLib as Record<string, unknown>).evaluateReadOnlyToolCall,
  fallback: (planPolicyLib as Record<string, unknown>).fallbackAnonVerdict,
};

function anonNormalize(value: unknown): number {
  const viaLib = libCall<number>(ANON_LIB.normalize, [value]);
  if (typeof viaLib === "number") return viaLib;
  const raw = typeof value === "number" ? value : Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(raw)) return 0;
  const level = Math.trunc(raw);
  return level >= 1 && level <= 3 ? level : 0;
}

function anonParse(arg: unknown): { kind: "status" | "set" | "invalid"; level?: number } {
  const viaLib = libCall<{ kind: string; level?: number }>(ANON_LIB.parse, [arg]);
  if (viaLib && typeof viaLib.kind === "string") {
    return { kind: viaLib.kind as "status" | "set" | "invalid", level: viaLib.level };
  }
  const t = String(arg ?? "").trim().toLowerCase();
  if (!t || t === "status") return { kind: "status" };
  if (t === "off" || t === "0" || t === "no" || t === "false") return { kind: "set", level: 0 };
  if (t === "on" || t === "yes" || t === "true") return { kind: "set", level: 2 };
  if (/^[123]$/.test(t)) return { kind: "set", level: Number.parseInt(t, 10) };
  return { kind: "invalid" };
}

function fallbackAnonVerdict(level: number, input: unknown): AnonVerdict {
  const viaLib = libCall<AnonVerdict>(ANON_LIB.fallback, [level, input]);
  if (viaLib && typeof viaLib.allowed === "boolean") return viaLib;
  let blob = "";
  try {
    blob = JSON.stringify(input ?? {});
  } catch {
    blob = String(input ?? "");
  }
  if (level >= 1 && /agent-memory[/\\]pending/.test(blob)) {
    return { allowed: false, reason: "anonymous session forbids pending-memory records (stale lib fallback)" };
  }
  if (level >= 3 && /handoffs[/\\]/.test(blob)) {
    return { allowed: false, reason: "anonymous level 3 forbids handoff documents (stale lib fallback)" };
  }
  if (level >= 1 && anonMutatorFallbackRegex().test(blob)) {
    return { allowed: false, reason: "anonymous session forbids shared-memory writes (stale lib fallback)" };
  }
  if (level >= 2 && /knowledge_(find|search|read|list|tree|grep|glob)|memory_recall|memory_search_tools/.test(blob)) {
    return { allowed: false, reason: "anonymous session forbids shared-memory reads (stale lib fallback)" };
  }
  return { allowed: true, reason: "no shared-memory trace detected (stale lib fallback)" };
}

function anonVerdict(level: number, toolName: string, input: unknown, cwd: string): AnonVerdict {
  if (level <= 0) return { allowed: true, reason: "anonymous mode off" };
  const call = libCall<{ server: string; tool: string } | null>(ANON_LIB.mcpCall, [toolName, input]);
  if (call) {
    const decision = libCall<AnonVerdict>(ANON_LIB.anonMcp, [level, call.server, call.tool]);
    return decision ?? fallbackAnonVerdict(level, input);
  }
  const write = libCall<AnonVerdict>(ANON_LIB.anonWrite, [level, toolName, input, cwd]);
  return write ?? fallbackAnonVerdict(level, input);
}

function anonDescribe(level: number): string {
  if (level === 1) return "shared memory read-only: no writes, no pending record";
  if (level === 2) return "no shared-memory reads or writes";
  return "no reads/writes, no local traces (ephemeral session, no handoff)";
}

function anonNote(level: number): string {
  const noReads = level >= 2;
  const noTraces = level >= 3;
  const lines = [
    "",
    "",
    `# Anonymous session (anon:${level})`,
    `- Level meaning: ${anonDescribe(level)}. The flag is session-scoped and does not move to a new session.`,
    "- HARD RULE: never write to shared memory/knowledge in this session — no `memory_remember`, no `knowledge_remember`/`write`/`edit`/`add_resource`, and no pending record under `$PI_CODING_AGENT_DIR/state/agent-memory/pending/`. Such calls are blocked and denied.",
    "- The shared post-task memory rule is SUSPENDED here: instead of a write, end every substantial turn with `Memory: skipped — anonymous` (never `recorded`, never `UNCONFIRMED` for a deliberate skip).",
    "- Never claim that anything was stored or queued, even if a write tool was attempted and blocked.",
  ];
  if (noReads) {
    lines.push("- Do not read shared memory/knowledge either (`memory_recall`, `knowledge_find|search|read|list|tree|grep|glob`). Skip the startup recall (`*_health` liveness checks stay allowed).");
  }
  if (noTraces) {
    lines.push("- Do not write handoff documents (project `handoffs/**`) and treat this conversation as ephemeral. A fully empty transcript additionally requires launching with `--no-session`.");
  }
  lines.push("- Still applies: the ban on secrets anywhere, and project files remain the source of truth for current state.");
  return lines.join("\n");
}

const PLAN_INSTRUCTIONS = `# 1C PLAN MODE

You are in a dedicated planning workflow for 1C development.

The purpose of PLAN is NOT to attempt implementation and complain that writes are unavailable. Your job is to investigate what can be investigated read-only, reason about the requested future changes, and produce a complete executable plan.

Hard rules:
- Project source code, metadata, Git state, dependencies, databases and external systems must not be mutated.
- You do not need write access to describe future folders/files. For greenfield work, model the future structure in the plan instead of asking to switch modes early.
- Read-only 1C subagents may be used for exploration/analysis/architecture/planning. Writer/execution subagents are blocked by runtime policy.
- Unknown custom tools are blocked in PLAN unless explicitly classified read-only by the extension.
- Planning artifacts may be written only under openspec/**, .pi/1c/plans/** or .pi/1c/knowledge-drafts/**. This exception never permits project-code writes.
- Shell execution (\`bash\`) is disabled in PLAN.
- Do not propose BUILD merely because a requested action would eventually require a write. First finish the plan.
- Trust the \`# Current 1C mode\` block: it is injected on every run. Never ask the user to switch modes and never claim the session is in ASK/BUILD — the extension performs the switch and states the current mode in that block.
- Shared memory and knowledge are reached through mcp({ search }) and mcp({ tool: "recall", args: { query } }). Footer MCP 0/2 means lazy (not connected yet), not that the servers are down. Those servers are optional: if they are not opted in, use project files.

Planning workflow:
1. Inspect existing code/configuration when it exists and is relevant.
2. For greenfield work, infer and state the proposed directory/file/object structure without creating it.
3. Identify requirements, dependencies, existing patterns, risks, migration/rollback concerns and verification.
4. Resolve material ambiguity where possible; surface unresolved questions explicitly.
5. Produce the final plan using ALL required headings below.

Required final format:
## Plan
1. Step — what will change, where, why.
2. ...

## Files / objects expected to change
- Existing or future path/object — expected change.

## Risks / edge cases
- ...

## Verification
- Exact checks/tests to run in BUILD.

Do not implement. Once the complete plan exists, the extension will mark it PLAN_READY and offer Execute in BUILD / Refine / Stay in PLAN.`;

const ASK_INSTRUCTIONS = `# 1C ASK MODE

You are in read-only Q&A mode for 1C development.
Answer the user's questions accurately; do not implement or change anything.

Hard rules:
- ASK is strictly read-only research: file writes are disabled completely. Do not call \`write\`/\`edit\` (they are not available) and do not write to openspec/** or .pi/1c/** (those are PLAN-only) or any other path.
- Shell execution (\`bash\`) is disabled in ASK.
- Project source code, metadata, Git state, dependencies, databases and external systems must not be mutated.
- Read-only 1C tools and read-only MCP (when opted in) are allowed. Writer/execution subagents are blocked by runtime policy.
- Trust the \`# Current 1C mode\` block: it is injected on every run.
- Never print or copy secrets; refer to variable names and paths only.

Answering workflow:
1. Ground the answer in existing project files and read-only checks; mark anything you could not verify as unconfirmed.
2. Do NOT emit the PLAN artifact headings and do NOT mark anything PLAN_READY — this mode answers questions, it does not produce plans.
3. If the user asks for a change, explain the approach and point them to \`/mode plan\` to produce a plan or \`/mode build\` to implement; do not perform the change here. Say it ONCE per conversation: if that suggestion is already in this conversation, or a \`[1C MODE CHANGE]\` message confirms the switch happened, do not repeat it — answer from the \`# Current 1C mode\` block instead.`;

const BUILD_INSTRUCTIONS = `# 1C BUILD MODE

Implementation is allowed.
- Follow the Pi 1C multi-agent orchestration and adapted ai_rules_1c rules.
- If this session has a PLAN_READY artifact, execute that exact plan_id rather than repeating full discovery. Re-plan only when new evidence invalidates a locked step.
- Use specialized 1C subagents and validated handoffs.
- Writer agents sharing one working tree run sequentially.
- Finish non-trivial work with tests/checks, independent review and verification.
- If verification cannot be performed, report UNVERIFIED explicitly.
- Approval mode (\`/approve off|safe|strict\`, footer \`approve:…\`) may pause dangerous (safe) or every (strict) tool call until the user allows it. Do not retry a denied call in a loop.`;

const MODE_MEANING: Record<OneCMode, string> = {
  plan: "read-only: investigate and produce the plan artifact; no project-code writes",
  ask: "read-only Q&A: answer questions, no writes at all",
  build: "implementation enabled",
};

function isModeLabel(value: unknown): value is OneCMode {
  return value === "plan" || value === "build" || value === "ask";
}

function modeName(mode: OneCMode): string {
  return mode.toUpperCase();
}

function modeNote(mode: OneCMode): string {
  return `# Current 1C mode
Current mode: ${modeName(mode)} — ${MODE_MEANING[mode]}.
This line is authoritative for this turn and is re-injected on every run: ignore any earlier statement about the mode in this conversation, including your own ("we are in ASK/PLAN/BUILD") and any "switch with \`/mode …\`" request that is already answered. Never ask the user to switch modes on the basis of history.`;
}

function modeChangeNotice(from: OneCMode, to: OneCMode): string {
  return `[1C MODE CHANGE] 1C mode changed: ${modeName(from)} → ${modeName(to)}. Current mode: ${modeName(to)} — ${MODE_MEANING[to]}. All earlier statements about the working mode in this conversation (including your own) are obsolete: do not repeat them, do not ask the user to switch again, and act only by the current mode.`;
}

function assistantText(message: any): string {
  if (!message || message.role !== "assistant") return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content.filter((x: any) => x?.type === "text").map((x: any) => x.text).join("\n");
}

function lastAssistantText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = assistantText(messages[i]);
    if (text) return text;
  }
  return "";
}

const APPROVE_ONCE = "Approve once";
const APPROVE_ALL = "Approve this risk class for this target (session)";
const APPROVE_DENY = "Deny";

export default function oneCModeExtension(pi: ExtensionAPI): void {
  let state: ModeState = initialModeState() as ModeState;
  let buildTools: string[] = [];
  let cwd = process.cwd();
  const approveAllowlist = new Set<string>();

  pi.registerFlag("1c-mode", { description: "1C primary mode: plan, build, or ask", type: "string" });
  pi.registerFlag("anon", { description: "Anonymous session level: 1 = no memory writes, 2 = no reads, 3 = no local traces", type: "string" });
  pi.registerFlag("1c-approve", { description: "1C approval mode: off, safe (dangerous actions), or strict (every tool). Not Pi --approve (project trust).", type: "string" });

  function publishSharedState(): void {
    set1cMode(state.mode);
    shared.__PI_1C_PHASE__ = state.phase;
    shared.__PI_1C_PLAN_ID__ = state.plan?.id;
  }

  function readOnly(): boolean {
    const viaLib = libCall<boolean>(ANON_LIB.isReadOnly, [state.mode]);
    return typeof viaLib === "boolean" ? viaLib : state.mode === "plan" || state.mode === "ask";
  }

  function anonLevel(): number {
    return anonNormalize(state.anonLevel);
  }

  function approveLevel(): number {
    return normalizeApproveLevel(state.approveLevel);
  }

  function persist(): void {
    pi.appendEntry("pi-1c-mode-state", { state });
  }

  function updateStatus(_ctx: ExtensionContext): void {
    publish("mode", {
      mode: state.mode,
      phase: state.phase,
      planId: state.plan?.id,
      anonLevel: anonLevel(),
      approve: approveLevelName(approveLevel()),
    });
  }

  function applyReadOnlyTools(): void {
    const all = pi.getAllTools().map((t) => t.name);
    if (buildTools.length === 0) buildTools = pi.getActiveTools();
    const viaLib = libCall<string[]>(ANON_LIB.readOnlyTools, [state.mode, buildTools, all]);
    if (viaLib) {
      pi.setActiveTools(viaLib);
      return;
    }
    const base = getPlanVisibleTools(buildTools, all);
    pi.setActiveTools(state.mode === "ask" ? base.filter((name) => name !== "write" && name !== "edit") : base);
  }

  function applyBuildTools(): void {
    const available = new Set(pi.getAllTools().map((t) => t.name));
    const restored = buildTools.filter((name) => available.has(name));
    for (const name of ["subagent_1c", "workflow_1c", "knowledge_1c"]) {
      if (available.has(name) && !restored.includes(name)) restored.push(name);
    }
    if (restored.length > 0) pi.setActiveTools([...new Set(restored)]);
  }

  function sync(ctx: ExtensionContext): void {
    publishSharedState();
    if (readOnly()) applyReadOnlyTools(); else applyBuildTools();
    updateStatus(ctx);
    persist();
  }

  function runningTurnSuffix(ctx: ExtensionContext): string {
    const isIdle = (ctx as { isIdle?: () => boolean }).isIdle;
    const idle = typeof isIdle === "function" ? isIdle.call(ctx) : true;
    return idle ? "" : " (takes effect on the next turn — the running turn keeps the mode it started with)";
  }

  function setAnonLevel(level: number, ctx: ExtensionContext, notify = true): void {
    const next = anonNormalize(level);
    state = { ...state, anonLevel: next };
    sync(ctx);
    if (notify) {
      if (next === 0) ctx.ui.notify("anon: off — shared memory policy restored", "info");
      else ctx.ui.notify(`anon:${next} — ${anonDescribe(next)}`, "warning");
    }
  }

  function setApproveLevel(level: number, ctx: ExtensionContext, notify = true): void {
    const next = normalizeApproveLevel(level);
    approveAllowlist.clear();
    state = { ...state, approveLevel: next };
    sync(ctx);
    if (notify) {
      const name = approveLevelName(next);
      const kind = next === 0 ? "info" : "warning";
      ctx.ui.notify(`approve:${name} — ${describeApprove(next)}`, kind);
    }
  }

  async function switchToPlan(ctx: ExtensionContext, notify = true): Promise<void> {
    const suffix = runningTurnSuffix(ctx);
    state = enterPlan(state) as ModeState;
    sync(ctx);
    if (notify) ctx.ui.notify(`Mode changed: PLAN${suffix ? " (next turn)" : ""}`, suffix ? "warning" : "info");
  }

  async function switchToBuild(ctx: ExtensionContext, notify = true): Promise<void> {
    if (state.plan && state.phase === "plan-ready") {
      await executeCurrentPlan(ctx);
      return;
    }
    const suffix = runningTurnSuffix(ctx);
    state = enterBuild(state) as ModeState;
    sync(ctx);
    if (notify) ctx.ui.notify(`Mode changed: BUILD${suffix ? " (next turn)" : ""}`, suffix ? "warning" : "info");
  }

  async function switchToAsk(ctx: ExtensionContext, notify = true): Promise<void> {
    const suffix = runningTurnSuffix(ctx);
    const viaLib = libCall<ModeState>(ANON_LIB.enterAsk, [state]);
    state = (viaLib ?? { ...state, mode: "ask", phase: "ask-idle" }) as ModeState;
    sync(ctx);
    if (notify) ctx.ui.notify(`Mode changed: ASK${suffix ? " (next turn)" : ""}`, suffix ? "warning" : "info");
  }

  async function executeCurrentPlan(ctx: ExtensionContext): Promise<void> {
    if (!state.plan || state.phase !== "plan-ready") {
      ctx.ui.notify("No PLAN_READY artifact exists. Finish/refine the plan first or use /mode build to override explicitly.", "warning");
      return;
    }
    state = executePlan(state) as ModeState;
    sync(ctx);
    const content = `Execute the approved 1C plan below. Keep plan_id unchanged and do not redo full discovery unless new evidence invalidates a step.\n\nplan_id: ${state.plan.id}\n\n${state.plan.text}`;
    pi.sendMessage({ customType: "pi-1c-plan-execute", content, display: true }, { triggerTurn: true, deliverAs: "followUp" });
  }

  pi.registerCommand("mode", {
    description: "Switch 1C mode: /mode plan | /mode build | /mode ask",
    handler: async (args, ctx) => {
      const requested = args?.trim().toLowerCase();
      if (requested === "plan") return switchToPlan(ctx);
      if (requested === "build") return switchToBuild(ctx);
      if (requested === "ask") return switchToAsk(ctx);
      if (requested) return ctx.ui.notify(`Unknown 1C mode: ${requested}. Use plan, build, or ask.`, "error");
      const selected = uiAvailable(ctx)
        ? await overlayModeSelect(ctx)
        : await ctx.ui.select("1C mode", ["build", "plan", "ask"]);
      if (selected === "plan") await switchToPlan(ctx);
      if (selected === "build") await switchToBuild(ctx);
      if (selected === "ask") await switchToAsk(ctx);
    },
  });

  registerAction("mode-select", async (ctx: ExtensionContext) => {
    const selected = uiAvailable(ctx)
      ? await overlayModeSelect(ctx)
      : await ctx.ui.select("1C mode", ["build", "plan", "ask"]);
    if (selected === "plan") await switchToPlan(ctx);
    if (selected === "build") await switchToBuild(ctx);
    if (selected === "ask") await switchToAsk(ctx);
  });

  registerAction("approve-select", async (ctx: ExtensionContext) => {
    const selected = await ctx.ui.select("Approve mode", ["off", "safe", "strict"]);
    if (selected === "off") setApproveLevel(0, ctx);
    if (selected === "safe") setApproveLevel(1, ctx);
    if (selected === "strict") setApproveLevel(2, ctx);
  });

  registerAction("anon-select", async (ctx: ExtensionContext) => {
    const selected = await ctx.ui.select("Anonymous session", ["off", "1", "2", "3"]);
    if (!selected) return;
    setAnonLevel(selected === "off" ? 0 : Number(selected), ctx);
  });

  async function handleAnon(args: string | undefined, ctx: ExtensionContext) {
    const parsed = anonParse(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify(`Unknown anon argument: ${String(args ?? "").trim()}. Use 1 | 2 | 3 | off | status.`, "error");
      return;
    }
    if (parsed.kind === "status") {
      const level = anonLevel();
      const what = level === 0 ? "off — the shared post-task memory policy applies" : anonDescribe(level);
      ctx.ui.notify(`anon=${level} · ${what} · session-scoped (new session starts at 0)`, "info");
      return;
    }
    setAnonLevel(parsed.level ?? 0, ctx);
  }

  pi.registerCommand("anon", {
    description: "Anonymous session: /anon 1 (no writes) | 2 (no reads) | 3 (no local traces) | off | status",
    handler: handleAnon,
  });
  registerAction("command:anon", (args: any, ctx: any) => handleAnon(args, ctx));

  pi.registerShortcut(Key.ctrlAlt("a"), {
    description: "Cycle anonymous session level: off → 1 → 2 → 3",
    handler: async (ctx) => {
      const current = anonLevel();
      setAnonLevel(current >= 3 ? 0 : current + 1, ctx);
    },
  });

  async function handleApprove(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parseApproveLevel(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify(`Unknown approve argument: ${String(args ?? "").trim()}. Use off | safe | strict | status.`, "error");
      return;
    }
    if (parsed.kind === "status") {
      const level = approveLevel();
      const name = approveLevelName(level);
      ctx.ui.notify(`approve=${name} · ${describeApprove(level)} · session-scoped (new session starts at off)`, "info");
      return;
    }
    if (parsed.kind === "pick") {
      const selected = await ctx.ui.select("Approve mode", ["off", "safe", "strict"]);
      if (selected === "off") setApproveLevel(0, ctx);
      if (selected === "safe") setApproveLevel(1, ctx);
      if (selected === "strict") setApproveLevel(2, ctx);
      return;
    }
    setApproveLevel(parsed.level ?? 0, ctx);
  }

  pi.registerCommand("approve", {
    description: "Approval mode: /approve off | safe | strict | status",
    handler: handleApprove,
  });
  registerAction("command:approve", (args: any, ctx: any) => handleApprove(args, ctx));

  pi.registerShortcut(Key.ctrlAlt("s"), {
    description: "Cycle approval mode: off → safe → strict",
    handler: async (ctx) => {
      setApproveLevel(cycleApproveLevel(approveLevel()), ctx);
    },
  });

  pi.registerShortcut(Key.ctrlAlt("p"), {
    description: "Cycle 1C BUILD/PLAN/ASK mode",
    handler: async (ctx) => {
      if (state.mode === "build") return switchToPlan(ctx);
      if (state.mode === "plan") return switchToAsk(ctx);
      return switchToBuild(ctx);
    },
  });

  pi.events.on("pi-mcp-adapter:tool-approval-request", (request: any) => {
    if (typeof request?.claim !== "function") return;
    const anon = anonLevel();
    if (anon > 0) {
      const verdict = anonVerdict(anon, "mcp", { server: request.serverName, tool: request.originalToolName }, cwd);
      if (!verdict.allowed) {
        request.claim(() => "deny");
        return;
      }
    }
    if (!readOnly()) return;
    request.claim(() => {
      const decision = evaluatePlanMcpToolCall(request.serverName, request.originalToolName);
      return decision.allowed ? "allow_once" : "deny";
    });
  });

  pi.on("tool_call", async (event, ctx) => {
    const anon = anonLevel();
    if (anon > 0) {
      const verdict = anonVerdict(anon, event.toolName, event.input ?? {}, cwd);
      if (!verdict.allowed) {
        return {
          block: true,
          reason: `Anonymous mode (anon:${anon}) blocked '${event.toolName}': ${verdict.reason}. Nothing was stored — report \`Memory: skipped — anonymous\` in the final answer.`,
        };
      }
    }
    const dockerReason = dockerBlockReason(event.toolName, event.input ?? {});
    if (dockerReason) return { block: true, reason: dockerReason };
    if (readOnly()) {
      const viaLib = libCall<{ allowed: boolean; reason?: string }>(ANON_LIB.readOnlyCall, [state.mode, cwd, event.toolName, event.input ?? {}]);
      const decision = viaLib ?? (
        state.mode === "ask" && (event.toolName === "write" || event.toolName === "edit")
          ? { allowed: false, reason: "ASK is read-only research; file writes are disabled" }
          : evaluatePlanToolCall(cwd, event.toolName, event.input ?? {})
      );
      if (!decision.allowed) {
        const hint = state.mode === "ask"
          ? "Continue answering in read-only research mode."
          : "Continue planning without mutating project code.";
        return { block: true, reason: `1C ${state.mode.toUpperCase()} blocked '${event.toolName}': ${decision.reason}. ${hint}` };
      }
      return;
    }
    const level = approveLevel();
    if (level <= 0) return;
    const classification = classifyDanger(event.toolName, event.input ?? {}, cwd);
    if (!shouldPrompt(level, classification.dangerous)) return;
    const scope = approvalScope(event.toolName, classification, event.input ?? {});
    if (approveAllowlist.has(scope)) return;
    if (!ctx?.hasUI) {
      return {
        block: true,
        reason: `Approval mode (${approveLevelName(level)}) blocked '${event.toolName}': ${classification.reason}. No UI available to confirm.`,
      };
    }
    const choice = uiAvailable(ctx)
      ? await overlayApproval(ctx, {
        toolName: event.toolName,
        action: summarizeToolAction(event.toolName, event.input ?? {}),
        reason: classification.reason,
      })
      : await ctx.ui.select(`Approve action? ${event.toolName}: ${classification.reason}`, [APPROVE_ONCE, APPROVE_ALL, APPROVE_DENY]);
    if (choice === APPROVE_ALL) {
      approveAllowlist.add(scope);
      return;
    }
    if (choice === APPROVE_ONCE) return;
    return { block: true, reason: "Отклонено пользователем (approve mode)" };
  });

  pi.on("before_agent_start", async (event) => {
    const changedFrom = isModeLabel(state.lastInjectedMode) && state.lastInjectedMode !== state.mode ? state.lastInjectedMode : undefined;
    state = { ...state, lastInjectedMode: state.mode };
    persist();
    const body = state.mode === "plan" ? PLAN_INSTRUCTIONS : state.mode === "ask" ? ASK_INSTRUCTIONS : BUILD_INSTRUCTIONS;
    let instructions = `${modeNote(state.mode)}\n\n${body}`;
    if (state.mode === "build" && state.phase === "build-executing" && state.plan) {
      instructions += `\n\n# Approved plan handoff\nplan_id: ${state.plan.id}\n\n${state.plan.text}`;
    }
    const anon = anonLevel();
    if (anon > 0) instructions += anonNote(anon);
    const result: { systemPrompt: string; message?: { customType: string; content: string; display: boolean } } = {
      systemPrompt: `${event.systemPrompt}\n\n${instructions}`,
    };
    if (changedFrom) {
      result.message = { customType: "pi-1c-mode-change", content: modeChangeNotice(changedFrom, state.mode), display: true };
    }
    return result;
  });

  pi.on("agent_end", async (event, ctx) => {
    if (state.mode === "build" && state.phase === "build-executing") {
      const viaLib = libCall<ModeState>(ANON_LIB.completeBuild, [state]);
      state = (viaLib ?? { ...state, phase: "build-idle" }) as ModeState;
      sync(ctx);
    }

    if (state.mode !== "plan") return;
    const text = lastAssistantText(event.messages ?? []);
    const artifact = extractPlanArtifact(text);
    if (!artifact?.ready) {
      state = { ...state, phase: "plan-draft" };
      sync(ctx);
      return;
    }

    state = acceptPlan(state, artifact) as ModeState;
    sync(ctx);
    if (!ctx.hasUI) {
      pi.sendMessage({ customType: "pi-1c-plan-ready", content: `Plan ready: ${state.plan?.id}. Use /mode build to switch to BUILD and execute it, or continue refining in PLAN.`, display: true }, { triggerTurn: false });
      return;
    }

    const choice = await ctx.ui.select(`Plan ready (${state.plan?.id})`, ["Execute in BUILD", "Refine plan", "Stay in PLAN"]);
    if (choice === "Execute in BUILD") {
      await executeCurrentPlan(ctx);
    } else if (choice === "Refine plan") {
      state = { ...state, phase: "plan-draft" };
      sync(ctx);
      pi.sendUserMessage("Refine the current plan. Keep the same task intent, address gaps/risks, and emit the complete required plan format again.", { deliverAs: "followUp" });
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    cwd = ctx.cwd;
    buildTools = pi.getActiveTools();

    const entries = ctx.sessionManager.getEntries();
    const entry = entries
      .filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "pi-1c-mode-state")
      .pop() as { data?: { state?: ModeState } } | undefined;
    const restored = entry?.data?.state;
    if (restored) {
      const viaLib = libCall<ModeState>(ANON_LIB.sanitize, [restored]);
      state = (viaLib ?? initialModeState()) as ModeState;
    } else {
      state = { ...initialModeState(), anonLevel: 0 };
    }

    const flag = pi.getFlag("1c-mode");
    const requested = typeof flag === "string" ? flag.toLowerCase() : undefined;
    if (requested === "plan") state = enterPlan(state) as ModeState;
    if (requested === "build") state = enterBuild(state) as ModeState;
    if (requested === "ask") {
      const viaLib = libCall<ModeState>(ANON_LIB.enterAsk, [state]);
      state = (viaLib ?? { ...state, mode: "ask", phase: "ask-idle" }) as ModeState;
    }

    const anonFlag = pi.getFlag("anon");
    const anonEnv = process.env.PI_1C_ANON;
    const anonRaw = anonFlag !== undefined && anonFlag !== null && String(anonFlag).trim() !== ""
      ? String(anonFlag)
      : (!restored && typeof anonEnv === "string" && anonEnv.trim() ? anonEnv : undefined);
    if (anonRaw !== undefined) {
      const parsed = anonParse(anonRaw);
      state = { ...state, anonLevel: anonNormalize(parsed.kind === "set" ? parsed.level : anonRaw) };
    }

    const approveOverride = resolveApproveStartup({
      flag: pi.getFlag("1c-approve"),
      env: process.env.PI_1C_APPROVE,
      restored: Boolean(restored),
    });
    if (approveOverride != null) state = { ...state, approveLevel: approveOverride };

    publishSharedState();
    if (readOnly()) applyReadOnlyTools(); else applyBuildTools();
    updateStatus(ctx);
    persist();
  });
}
