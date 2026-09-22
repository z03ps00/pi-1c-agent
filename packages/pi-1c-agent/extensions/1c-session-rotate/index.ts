import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  STATE_CUSTOM_TYPE,
  applyCommand,
  buildHandoffInstruction,
  buildKickoff,
  defaultHandoffPath,
  handoffReady,
  parseSessionRotateArgs,
  restoreStateFromEntries,
  rotationNewSessionOptions,
  shouldCancelCompact,
  shouldDeferRotationAfterOverflow,
  shouldRotateOnIdle,
  statusText,
} from "../../lib/session-rotate.mjs";
import { publish, registerAction } from "../../lib/ui/index.mjs";
import * as rotateLib from "../../lib/session-rotate.mjs";

type RotateState = { enabled: boolean; thresholdPercent: number };

function callRotateLib<T>(name: string, args: unknown[]): T | undefined {
  const fn = (rotateLib as Record<string, unknown>)[name];
  if (typeof fn !== "function") return undefined;
  try {
    return (fn as (...a: unknown[]) => T)(...args);
  } catch {
    return undefined;
  }
}

function armMidTurnRotation(opts: {
  enabled: boolean;
  percent: number | null;
  thresholdPercent: number;
  isIdle: boolean;
  handoffPending: boolean;
  rotating: boolean;
}): boolean {
  const viaLib = callRotateLib<boolean>("shouldArmMidTurnRotation", [opts]);
  if (typeof viaLib === "boolean") return viaLib;
  const { enabled, percent, thresholdPercent, isIdle, handoffPending, rotating } = opts;
  if (!enabled || isIdle || handoffPending || rotating) return false;
  if (percent === null || percent === undefined) return false;
  const n = Number(percent);
  if (!Number.isFinite(n)) return false;
  return n >= Number(thresholdPercent);
}

function midTurnReason(percent: unknown, thresholdPercent: unknown): string {
  const viaLib = callRotateLib<string>("midTurnBlockReason", [percent, thresholdPercent]);
  if (typeof viaLib === "string" && viaLib) return viaLib;
  return `session-rotate: context ${percent}% >= ${thresholdPercent}% — winding down this turn to rotate into a fresh session. Stop calling tools and end your turn; a handoff will be written and the task continues in a new session.`;
}

export default function sessionRotateExtension(pi: ExtensionAPI): void {
  let state: RotateState = restoreStateFromEntries([]);
  let cancelledForRotation = false;
  let overflowPending = false;
  let handoffPendingPath: string | null = null;
  let rotating = false;
  let midTurnNotified = false;

  function persist(): void {
    pi.appendEntry(STATE_CUSTOM_TYPE, { state });
  }

  function updateStatus(_ctx: ExtensionContext): void {
    publish("rotate", { enabled: state.enabled, thresholdPercent: state.thresholdPercent });
  }

  async function requestHandoff(ctx: ExtensionContext): Promise<void> {
    if (handoffPendingPath || rotating) return;
    const target = defaultHandoffPath(ctx.cwd, new Date());
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
    } catch {
      ctx.ui.notify("session-rotate: cannot create handoffs directory, aborting rotation", "error");
      cancelledForRotation = false;
      overflowPending = false;
      midTurnNotified = false;
      return;
    }
    handoffPendingPath = target;
    ctx.ui.notify("session-rotate: writing handoff, then opening a new session", "info");
    pi.sendUserMessage(buildHandoffInstruction(target), { deliverAs: "followUp" });
  }

  async function continueRotation(ctx: any): Promise<void> {
    if (rotating) return;
    const target = handoffPendingPath;
    if (!target) {
      ctx.ui.notify("session-rotate: no pending handoff to continue", "warning");
      return;
    }
    let text = "";
    try {
      text = fs.readFileSync(target, "utf8");
    } catch {
      text = "";
    }
    const ready = handoffReady(text);
    if (!ready.ok) {
      ctx.ui.notify(`session-rotate: handoff ${ready.reason}, aborting rotation; compaction remains available`, "error");
      handoffPendingPath = null;
      cancelledForRotation = false;
      overflowPending = false;
      rotating = false;
      midTurnNotified = false;
      return;
    }
    if (typeof ctx.newSession !== "function") {
      ctx.ui.notify("session-rotate: newSession is not available on this host (Pi-only)", "warning");
      handoffPendingPath = null;
      cancelledForRotation = false;
      midTurnNotified = false;
      return;
    }
    rotating = true;
    const parentSession = ctx.sessionManager.getSessionFile?.();
    const kickoff = buildKickoff(target);
    const opts = rotationNewSessionOptions({ parentSession, state, kickoff });
    const result = await ctx.newSession({
      parentSession: opts.parentSession,
      setup: async (sm: { appendCustomEntry: (customType: string, data?: unknown) => string }) => {
        sm.appendCustomEntry(opts.setupState.customType, opts.setupState.data);
      },
      withSession: async (fresh: any) => {
        const usage = typeof fresh.getContextUsage === "function" ? fresh.getContextUsage() : undefined;
        const below = usage?.percent === null || usage?.percent === undefined || usage.percent < state.thresholdPercent;
        fresh.ui.notify(
          below
            ? `session-rotate: new session (parent linked). Continue from ${target}`
            : `session-rotate: new session started but context is still ${usage.percent}%`,
          below ? "info" : "warning",
        );
        await fresh.sendUserMessage(kickoff);
      },
    });
    handoffPendingPath = null;
    overflowPending = false;
    cancelledForRotation = false;
    rotating = false;
    midTurnNotified = false;
    if (result?.cancelled) {
      ctx.ui.notify("session-rotate: new session was cancelled", "warning");
    }
  }

  async function maybeRotateWhenIdle(ctx: ExtensionContext): Promise<void> {
    if (!state.enabled || rotating) return;
    if (handoffPendingPath) {
      if (typeof (ctx as any).newSession === "function") {
        await continueRotation(ctx);
        return;
      }
      pi.sendUserMessage("/session-rotate continue", { deliverAs: "followUp", expandPromptTemplates: true });
      return;
    }
    if (overflowPending) {
      overflowPending = false;
      await requestHandoff(ctx);
      return;
    }
    const usage = ctx.getContextUsage?.();
    const percent = usage?.percent ?? null;
    if (!shouldRotateOnIdle({
      enabled: state.enabled,
      percent,
      thresholdPercent: state.thresholdPercent,
      alreadyRotating: rotating,
    })) {
      return;
    }
    await requestHandoff(ctx);
  }

  async function handleSessionRotate(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parseSessionRotateArgs(args);
    if (parsed.action === "continue") return continueRotation(ctx);
    const result = applyCommand(state, parsed);
    if (!result.ok) {
      ctx.ui.notify(result.error ?? "session-rotate: invalid argument", "error");
      ctx.ui.notify(statusText(state), "info");
      return;
    }
    state = result.state;
    if (result.changed) persist();
    updateStatus(ctx);
    ctx.ui.notify(statusText(state), "info");
  }

  pi.registerCommand("session-rotate", {
    description: "Ротация сеанса вместо compaction: /session-rotate on|off|status|<percent>",
    handler: handleSessionRotate,
  });
  registerAction("command:session-rotate", (args: any, ctx: any) => handleSessionRotate(args, ctx));

  pi.on("session_start", async (_event, ctx) => {
    state = restoreStateFromEntries(ctx.sessionManager.getEntries());
    cancelledForRotation = false;
    overflowPending = false;
    handoffPendingPath = null;
    rotating = false;
    midTurnNotified = false;
    updateStatus(ctx);
  });

  pi.on("tool_call", async (_event, ctx) => {
    try {
      if (rotating || handoffPendingPath) return;
      const usage = ctx.getContextUsage?.();
      const percent = usage?.percent ?? null;
      const isIdle = typeof ctx.isIdle === "function" ? ctx.isIdle() : false;
      if (!armMidTurnRotation({
        enabled: state.enabled,
        percent,
        thresholdPercent: state.thresholdPercent,
        isIdle,
        handoffPending: Boolean(handoffPendingPath),
        rotating,
      })) return;
      if (!midTurnNotified) {
        ctx.ui.notify(`session-rotate: threshold reached mid-turn (${percent}%), rotating`, "warning");
        midTurnNotified = true;
      }
      return { block: true, terminate: true, reason: midTurnReason(percent, state.thresholdPercent) };
    } catch {
      return;
    }
  });

  pi.on("session_before_compact", async (event, ctx) => {
    const isIdle = typeof ctx.isIdle === "function" ? ctx.isIdle() : false;
    if (shouldDeferRotationAfterOverflow({ enabled: state.enabled, reason: event.reason })) {
      overflowPending = true;
      return;
    }
    if (shouldCancelCompact({
      enabled: state.enabled,
      reason: event.reason,
      isIdle,
      alreadyCancelledForRotation: cancelledForRotation,
    })) {
      cancelledForRotation = true;
      return { cancel: true };
    }
  });

  pi.on("agent_settled", async (_event, ctx) => {
    await maybeRotateWhenIdle(ctx);
  });
}
