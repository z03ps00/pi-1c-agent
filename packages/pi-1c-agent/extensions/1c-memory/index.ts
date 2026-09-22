import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  applyCaptureModel,
  applyIdleToggle,
  captureDoesNotTouchMainChat,
  captureModelStatus,
  captureSession,
  CAPTURE_STATE_TYPE,
  distillHeuristic,
  isSubstantial,
  parseCaptureModelArgs,
  parseWrapArgs,
  restoreCaptureState,
  shouldIdleCapture,
} from "../../lib/session-capture.mjs";
import * as captureLib from "../../lib/session-capture.mjs";
import {
  formatReconcileReport,
  reconcilePending,
  resolveMemoryStateRoots,
  shouldSkipStartupReconcile,
  STARTUP_RECONCILE_BUDGET_MS,
  withBudget,
} from "../../lib/memory-reconcile.mjs";
import { createMcpAdapters, probeMemoryServers } from "../../lib/memory-mcp.mjs";
import { emitDiagnostic } from "../../lib/diagnostics.mjs";
import { current1cMode, isBuildMode } from "../../lib/mode-state.mjs";
import { publish, registerAction } from "../../lib/ui/index.mjs";

type CaptureState = ReturnType<typeof restoreCaptureState>;

function callCaptureLib<T>(name: string, args: unknown[]): T | undefined {
  const fn = (captureLib as Record<string, unknown>)[name];
  if (typeof fn !== "function") return undefined;
  try {
    return (fn as (...a: unknown[]) => T)(...args);
  } catch {
    return undefined;
  }
}

function hostOf(ctx: ExtensionContext): "pi" | "cursor" {
  const viaLib = callCaptureLib<"pi" | "cursor">("detectCaptureHost", [ctx]);
  if (viaLib === "pi" || viaLib === "cursor") return viaLib;
  const c = ctx as { newSession?: unknown; getContextUsage?: unknown };
  return typeof c.getContextUsage === "function" || typeof c.newSession === "function" ? "pi" : "cursor";
}

function restoreAnonLevel(entries: unknown[]): number {
  if (!Array.isArray(entries)) return 0;
  const hits = entries.filter((e: any) => e && e.type === "custom" && e.customType === "pi-1c-mode-state");
  const last = hits[hits.length - 1] as any;
  return Math.trunc(Number(last?.data?.state?.anonLevel ?? last?.data?.anonLevel)) || 0;
}

function profileDir(): string {
  return String(process.env.PI_CODING_AGENT_DIR || "").trim() || process.cwd();
}

function sessionIdOf(ctx: ExtensionContext): string {
  const file = (ctx as any).sessionManager?.getSessionFile?.();
  return file ? path.basename(String(file), path.extname(String(file))) : "session";
}

function sessionEntries(ctx: ExtensionContext): any[] {
  try {
    return ctx.sessionManager.getEntries() ?? [];
  } catch {
    return [];
  }
}

function flattenEntries(entries: any[]): any[] {
  const viaLib = callCaptureLib<any[]>("flattenSessionEntries", [entries]);
  if (Array.isArray(viaLib)) return viaLib;
  const out: any[] = [];
  for (const raw of Array.isArray(entries) ? entries : []) {
    if (!raw || typeof raw !== "object") continue;
    const inner = raw.message && typeof raw.message === "object" && !Array.isArray(raw.message)
      ? raw.message
      : raw;
    const contentParts = Array.isArray(inner.content) ? inner.content : [];
    const textFromParts = contentParts
      .filter((x: any) => x && x.type === "text")
      .map((x: any) => String(x.text ?? ""))
      .filter(Boolean)
      .join("\n");
    const content = typeof inner.content === "string"
      ? inner.content
      : (textFromParts || (typeof raw.content === "string" ? raw.content : "") || String(inner.text || raw.text || ""));
    const tool = inner.toolName || inner.name || inner.tool || raw.toolName || raw.name || raw.tool || "";
    const input = inner.input || inner.args || inner.arguments || raw.input || raw.args || {};
    out.push({
      type: raw.type || inner.type || inner.role,
      role: inner.role || raw.role || raw.type,
      tool,
      input,
      content,
    });
    for (const part of contentParts) {
      if (!part || part.type !== "toolCall") continue;
      out.push({
        type: "toolCall",
        role: inner.role || raw.role || "assistant",
        tool: part.name || part.toolName || part.tool || "",
        input: part.arguments || part.args || part.input || {},
        content: "",
      });
    }
  }
  return out;
}

export default function memoryExtension(pi: ExtensionAPI): void {
  let state: CaptureState = restoreCaptureState([]);
  let sessionCorrelation = "";
  let captureInFlight = false;
  let lifecycle: Promise<string> | null = null;

  function persist(): void {
    pi.appendEntry(CAPTURE_STATE_TYPE, { state });
  }

  function updateStatus(ctx: ExtensionContext): void {
    publish("capture", {
      idleEnabled: state.idleEnabled,
      distillerMode: state.distiller?.mode,
      host: hostOf(ctx),
    });
  }

  function adapters() {
    return createMcpAdapters();
  }

  async function stackDistill(opts: { mode?: string; entries?: unknown } = {}): Promise<unknown> {
    const fn = (captureLib as Record<string, unknown>).distillWithProvider;
    if (typeof fn !== "function") return null;
    try {
      return await (fn as (args: unknown) => Promise<unknown>)({
        ...opts,
        model: state.distiller.model,
        profileDir: profileDir(),
      });
    } catch {
      return null;
    }
  }

  async function probeAndReconcile(ctx: ExtensionContext): Promise<string> {
    if (shouldSkipStartupReconcile()) {
      emitDiagnostic("memory.lifecycle.probe.skipped", { reason: "child-process" });
      return "memory-flush: skipped — child process";
    }
    if (!isBuildMode()) {
      emitDiagnostic("memory.lifecycle.probe.skipped", { reason: "not-build", mode: current1cMode() });
      return "memory-flush: skipped — BUILD required";
    }
    const anonLevel = restoreAnonLevel(sessionEntries(ctx));
    try {
      const roots = resolveMemoryStateRoots(profileDir());
      fs.mkdirSync(roots.done, { recursive: true });
      fs.mkdirSync(roots.pending, { recursive: true });
      fs.mkdirSync(roots.processing, { recursive: true });
      fs.mkdirSync(roots.failed, { recursive: true });
    } catch {
      // ignore
    }
    const reachable = await probeMemoryServers();
    const summary = await reconcilePending({
      profileDir: profileDir(),
      anonymous: anonLevel >= 1,
      serversReachable: reachable,
      ...adapters(),
    });
    return formatReconcileReport(summary);
  }

  async function runLifecycle(ctx: ExtensionContext, opts: { budgetMs?: number } = {}): Promise<string> {
    if (lifecycle) return lifecycle;
    lifecycle = (async () => {
      try {
        if (opts.budgetMs) {
          return await withBudget(probeAndReconcile(ctx), opts.budgetMs, "startup reconcile");
        }
        return await probeAndReconcile(ctx);
      } catch (error: any) {
        emitDiagnostic("memory.lifecycle.probe.failed", { reason: error?.message || String(error) });
        return `memory-flush: probe failed (${error?.message || String(error)})`;
      } finally {
        lifecycle = null;
      }
    })();
    return lifecycle;
  }

  async function runCapture(ctx: ExtensionContext, opts: { archive?: boolean; idle?: boolean } = {}): Promise<void> {
    const contract = captureDoesNotTouchMainChat();
    if (contract.injectsIntoMainChat) return;
    const entries = flattenEntries(sessionEntries(ctx));
    const mode = current1cMode();
    const anonLevel = restoreAnonLevel(sessionEntries(ctx));
    if (!sessionCorrelation) sessionCorrelation = `${sessionIdOf(ctx)}`;
    const result = await captureSession({
      entries,
      sessionId: sessionIdOf(ctx),
      cwd: ctx.cwd,
      mode,
      anonLevel,
      archiveTranscript: opts.archive === true || state.archiveTranscript,
      distillerMode: state.distiller.mode,
      distillWithProvider: stackDistill,
      profileDir: profileDir(),
      correlationId: sessionCorrelation,
      ...adapters(),
    });
    if (opts.idle) return;
    if (result.status === "skipped") {
      const skipped = callCaptureLib<string>("formatWrapNotify", [result])
        ?? (result.reason === "anonymous" ? "Memory: skipped — anonymous" : `wrap: ${result.reason}`);
      ctx.ui.notify(skipped, "info");
      return;
    }
    const viaLib = callCaptureLib<string>("formatWrapNotify", [result]);
    const message = viaLib || (
      result.status === "recorded"
        ? `wrap: recorded (${result.correlation_id})`
        : `wrap: ${result.status}`
    );
    ctx.ui.notify(message, result.status === "recorded" ? "info" : "warning");
  }

  pi.registerCommand("memory-flush", {
    description: "Replay pending Cognee/OpenViking records: /memory-flush",
    handler: async (_args, ctx) => {
      const report = await runLifecycle(ctx);
      ctx.ui.notify(report, "info");
    },
  });

  async function handleWrap(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parseWrapArgs(args);
    if (parsed.action === "auto") {
      const result = applyIdleToggle(state, parsed.value);
      if (!result.ok) {
        ctx.ui.notify(result.error ?? "wrap auto: use on|off|status", "error");
        return;
      }
      state = result.state;
      if (result.changed) persist();
      updateStatus(ctx);
      ctx.ui.notify(`wrap auto: ${state.idleEnabled ? "on" : "off"}`, "info");
      return;
    }
    if (parsed.action === "status") {
      ctx.ui.notify(`wrap auto: ${state.idleEnabled ? "on" : "off"}; ${captureModelStatus(state)}`, "info");
      return;
    }
    if (parsed.action !== "capture") {
      ctx.ui.notify("wrap: use now | archive | auto on|off|status", "error");
      return;
    }
    await runCapture(ctx, { archive: parsed.archive === true });
  }

  pi.registerCommand("wrap", {
    description: "Capture this dialog now: /wrap | /wrap auto on|off|status | /wrap archive",
    handler: handleWrap,
  });
  registerAction("command:wrap", (args: any, ctx: any) => handleWrap(args, ctx));

  pi.registerCommand("capture-model", {
    description: "Distiller for session capture: /capture-model status|off|stack|ollama <model>|routerai <model>|chat",
    handler: async (args, ctx) => {
      const parsed = parseCaptureModelArgs(args);
      const result = applyCaptureModel(state, parsed);
      if (!result.ok) {
        ctx.ui.notify(result.error ?? "capture-model: invalid argument", "error");
        return;
      }
      state = result.state;
      if (result.changed) persist();
      updateStatus(ctx);
      ctx.ui.notify(captureModelStatus(state), "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    state = restoreCaptureState(ctx.sessionManager.getEntries());
    sessionCorrelation = sessionIdOf(ctx);
    updateStatus(ctx);
    const reportPromise = runLifecycle(ctx, { budgetMs: STARTUP_RECONCILE_BUDGET_MS });
    reportPromise.then((report) => {
      if (ctx.hasUI && report && !report.includes("skipped") && !report.includes("deferred") && !report.includes("probe failed")) {
        ctx.ui.notify(report, "info");
      }
    }).catch(() => {});
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (hostOf(ctx) !== "pi") return;
    if (captureInFlight) return;
    const entries = flattenEntries(sessionEntries(ctx));
    // Gate on the same heuristic distillate that would be stored, so a read-only
    // Q&A (no file changes, no decisions) is never auto-captured.
    const substantial = isSubstantial(distillHeuristic(entries));
    if (!shouldIdleCapture({
      host: "pi",
      idleEnabled: state.idleEnabled,
      mode: current1cMode(),
      anonLevel: restoreAnonLevel(sessionEntries(ctx)),
      substantial,
    })) {
      return;
    }
    captureInFlight = true;
    void runCapture(ctx, { idle: true }).catch(() => {}).finally(() => {
      captureInFlight = false;
    });
  });
}
