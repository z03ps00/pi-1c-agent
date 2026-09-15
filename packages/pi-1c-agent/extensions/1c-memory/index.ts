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
  footerCaptureLabel,
  isSubstantial,
  parseCaptureModelArgs,
  parseWrapArgs,
  restoreCaptureState,
  shouldIdleCapture,
} from "../../lib/session-capture.mjs";
import {
  formatReconcileReport,
  reconcilePending,
  resolveMemoryStateRoots,
} from "../../lib/memory-reconcile.mjs";
import { createMcpAdapters, probeMemoryServers } from "../../lib/memory-mcp.mjs";

type CaptureState = ReturnType<typeof restoreCaptureState>;
type Shared = typeof globalThis & { __PI_1C_MODE__?: string };

function hostOf(ctx: ExtensionContext): "pi" | "cursor" {
  return typeof (ctx as { newSession?: unknown }).newSession === "function" ? "pi" : "cursor";
}

function currentMode(): string {
  return (globalThis as Shared).__PI_1C_MODE__ || "build";
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
  return entries.map((e) => ({
    type: e?.type || e?.role,
    role: e?.role || e?.type,
    tool: e?.toolName || e?.name || e?.tool,
    input: e?.input || e?.args || {},
    content: typeof e?.content === "string"
      ? e.content
      : Array.isArray(e?.content)
        ? e.content.filter((x: any) => x?.type === "text").map((x: any) => x.text).join("\n")
        : e?.text || "",
  }));
}

export default function memoryExtension(pi: ExtensionAPI): void {
  let state: CaptureState = restoreCaptureState([]);
  let sessionCorrelation = "";
  let captureInFlight = false;

  function persist(): void {
    pi.appendEntry(CAPTURE_STATE_TYPE, { state });
  }

  function updateStatus(ctx: ExtensionContext): void {
    const host = hostOf(ctx);
    const color = state.idleEnabled && host === "pi" ? "success" : "dim";
    ctx.ui.setStatus("pi-1c-capture", ctx.ui.theme.fg(color, footerCaptureLabel(state, host)));
  }

  function adapters() {
    return createMcpAdapters();
  }

  async function probeAndReconcile(ctx: ExtensionContext): Promise<string> {
    const anonLevel = restoreAnonLevel(sessionEntries(ctx));
    try {
      const roots = resolveMemoryStateRoots(profileDir());
      fs.mkdirSync(roots.done, { recursive: true });
      fs.mkdirSync(roots.pending, { recursive: true });
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

  async function runCapture(ctx: ExtensionContext, opts: { archive?: boolean; idle?: boolean } = {}): Promise<void> {
    const contract = captureDoesNotTouchMainChat();
    if (contract.injectsIntoMainChat) return;
    const entries = flattenEntries(sessionEntries(ctx));
    const mode = currentMode();
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
      profileDir: profileDir(),
      correlationId: sessionCorrelation,
      ...adapters(),
    });
    if (opts.idle) return;
    if (result.status === "skipped") {
      ctx.ui.notify(result.reason === "anonymous" ? "Memory: skipped — anonymous" : `wrap: ${result.reason}`, "info");
      return;
    }
    ctx.ui.notify(
      result.status === "recorded"
        ? `wrap: recorded (${result.correlation_id})`
        : `wrap: ${result.status}`,
      result.status === "recorded" ? "info" : "warning",
    );
  }

  pi.registerCommand("memory-flush", {
    description: "Replay pending Cognee/OpenViking records: /memory-flush",
    handler: async (_args, ctx) => {
      const report = await probeAndReconcile(ctx);
      ctx.ui.notify(report, "info");
    },
  });

  pi.registerCommand("wrap", {
    description: "Capture this dialog now: /wrap | /wrap auto on|off|status | /wrap archive",
    handler: async (args, ctx) => {
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
    },
  });

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
    void probeAndReconcile(ctx).catch(() => {});
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
      mode: currentMode(),
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
