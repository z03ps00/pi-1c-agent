import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key, truncateToWidth } from "@earendil-works/pi-tui";
import { loadConfiguration } from "../../lib/knowledge.mjs";
import { initStatus } from "../../lib/project-init.mjs";
import {
  ACTIVE_STATUSES,
  colorize,
  composeFooter,
  composeStatus,
  composeWidgetLines,
  getSnapshot,
  invokeAction,
  modeColor,
  PALETTE_ACTIONS,
  registerAction,
  subscribe,
  uiAvailable,
} from "../../lib/ui/index.mjs";
import { overlayHub, overlayPalette, overlaySelect, overlayStatus } from "./overlays.ts";

let unsubWidget: (() => void) | null = null;
let widgetClearTimer: ReturnType<typeof setTimeout> | null = null;

function readProjectName(cwd: string): string {
  try {
    const raw = fs.readFileSync(path.join(cwd, ".pi", "1c", "project.yaml"), "utf8");
    const m = raw.match(/^\s*name:\s*(.+)$/m);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : "";
  } catch {
    return path.basename(cwd);
  }
}

function collectSnapshot(ctx: any, footerData?: any) {
  const mode = getSnapshot("mode") || {};
  const rotate = getSnapshot("rotate") || {};
  const capture = getSnapshot("capture") || {};
  const agents = getSnapshot("agents") || {};
  const usage = typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : undefined;
  const config = (() => { try { return loadConfiguration(ctx.cwd); } catch { return null; } })();
  const init = (() => { try { return initStatus(ctx.cwd); } catch { return null; } })();
  return {
    mode: mode.mode || "ask",
    phase: mode.phase,
    planId: mode.planId,
    anonLevel: mode.anonLevel || 0,
    approve: mode.approve || "off",
    rotateEnabled: rotate.enabled === true,
    rotateThreshold: rotate.thresholdPercent,
    captureEnabled: capture.idleEnabled === true && capture.host === "pi",
    captureMode: capture.distillerMode,
    contextPercent: usage?.percent ?? null,
    gitBranch: footerData?.getGitBranch?.() ?? null,
    gitDirty: false,
    projectName: readProjectName(ctx.cwd) || config?.name,
    model: ctx.model?.id,
    configuration: config ? `${config.name} ${config.version}` : "",
    knowledge: init?.knowledgeLayout?.complete ? "initialized" : (config ? "layout" : "uninitialized"),
    fingerprint: config?.fingerprint ? "current" : "",
    cognee: capture.cognee || "unknown",
    openviking: capture.openviking || "unknown",
    agents: agents.runs || [],
  };
}

function mountFooter(ctx: any) {
  if (!uiAvailable(ctx) || typeof ctx.ui.setFooter !== "function") return;
  ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
    const unsubBranch = footerData?.onBranchChange?.(() => tui.requestRender()) || (() => {});
    const unsubBus = subscribe(() => tui.requestRender());
    return {
      dispose() { unsubBranch(); unsubBus(); },
      invalidate() {},
      render(width: number) {
        const snap = collectSnapshot(ctx, footerData);
        const { segments, text } = composeFooter(snap, width);
        const parts = segments.map((s) => {
          if (s.id === "mode") return colorize(theme, modeColor(snap.mode), s.text);
          if (s.id === "anon" || s.id === "approve") return colorize(theme, "warning", s.text);
          if (s.id === "failed") return colorize(theme, "error", s.text);
          return colorize(theme, "dim", s.text);
        });
        const line = parts.join(colorize(theme, "dim", " │ ")) || text;
        return [truncateToWidth(line, Math.max(1, width))];
      },
    };
  });
}

function refreshWidget(ctx: any) {
  if (!uiAvailable(ctx) || typeof ctx.ui.setWidget !== "function") return;
  const runs = getSnapshot("agents")?.runs || [];
  const lines = composeWidgetLines(runs);
  if (widgetClearTimer) {
    clearTimeout(widgetClearTimer);
    widgetClearTimer = null;
  }
  if (!lines.length) {
    ctx.ui.setWidget("pi-1c-agents", undefined);
    return;
  }
  ctx.ui.setWidget("pi-1c-agents", lines, { placement: "aboveEditor" });
  const active = runs.filter((r: any) => ACTIVE_STATUSES.includes(r.status));
  if (!active.length) {
    widgetClearTimer = setTimeout(() => {
      ctx.ui.setWidget("pi-1c-agents", undefined);
      widgetClearTimer = null;
    }, 2500);
  }
}

async function showStatus(ctx: any, pi: ExtensionAPI) {
  const text = composeStatus(collectSnapshot(ctx));
  if (uiAvailable(ctx)) {
    await overlayStatus(ctx, text);
    return;
  }
  if (ctx.hasUI) ctx.ui.notify(text, "info");
  else pi.sendMessage({ customType: "pi-1c-status", content: text, display: true }, { triggerTurn: false });
}

async function showHub(ctx: any) {
  const snap = getSnapshot("agents") || {};
  if (uiAvailable(ctx)) {
    await overlayHub(ctx);
    return;
  }
  const { composeHubText, composeHubRows } = await import("../../lib/ui/index.mjs");
  const text = composeHubText(composeHubRows(snap.discovered || [], snap.runs || []));
  ctx.ui.notify(text, "info");
}

async function runPaletteAction(id: string, ctx: any, pi: ExtensionAPI) {
  if (id === "status") return showStatus(ctx, pi);
  if (id === "agents") return showHub(ctx);
  if (id === "mode") return invokeAction("mode-select", ctx);
  if (id === "approve") return invokeAction("approve-select", ctx);
  if (id === "anon") return invokeAction("anon-select", ctx);
  if (id === "init") return invokeAction("init-open", ctx);
  if (id === "settings") return invokeAction("approve-select", ctx);
  const action = PALETTE_ACTIONS.find((a) => a.id === id);
  if (action?.command) {
    const name = action.command.replace(/^\//, "").split(/\s+/)[0];
    const rest = action.command.replace(/^\//, "").split(/\s+/).slice(1).join(" ");
    return invokeAction(`command:${name}`, rest, ctx);
  }
}

export default function oneCUi(pi: ExtensionAPI): void {
  registerAction("status-open", (ctx: any) => showStatus(ctx, pi));
  registerAction("agents-hub", (ctx: any) => showHub(ctx));
  registerAction("palette-open", async (ctx: any) => {
    if (!uiAvailable(ctx)) {
      ctx.ui.notify(PALETTE_ACTIONS.map((a) => `${a.label}  ${a.command}`).join("\n"), "info");
      return;
    }
    const id = await overlayPalette(ctx);
    if (id) await runPaletteAction(id, ctx, pi);
  });
  registerAction("mode-overlay", (ctx: any) => overlaySelect(ctx, "Choose mode", [
    { value: "build", label: "BUILD", description: "Implementation enabled" },
    { value: "plan", label: "PLAN", description: "Read-only investigation and planning" },
    { value: "ask", label: "ASK", description: "Read-only Q&A" },
  ]));

  pi.registerCommand("status", {
    description: "Show Pi 1C Agent status (mode, project, memory, agents)",
    handler: async (_args, ctx) => showStatus(ctx, pi),
  });
  pi.registerCommand("palette", {
    description: "Open the Pi 1C command palette (Ctrl+Shift+K)",
    handler: async (_args, ctx) => invokeAction("palette-open", ctx),
  });

  pi.registerShortcut(Key.alt("a"), {
    description: "Open 1C Agent Hub",
    handler: async (ctx) => showHub(ctx),
  });
  pi.registerShortcut(Key.ctrlShift("k"), {
    description: "Open Pi 1C command palette",
    handler: async (ctx) => invokeAction("palette-open", ctx),
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!uiAvailable(ctx)) return;
    mountFooter(ctx);
    refreshWidget(ctx);
    unsubWidget?.();
    unsubWidget = subscribe(() => refreshWidget(ctx));
  });
  pi.on("agent_end", async (_event, ctx) => {
    if (uiAvailable(ctx)) refreshWidget(ctx);
  });
}
