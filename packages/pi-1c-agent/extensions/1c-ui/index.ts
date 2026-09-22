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
  MCP_STATUS_EVENT,
  mcpCountsFromAdapterSnapshot,
  mcpCountsFromConfig,
  modeColor,
  PALETTE_ACTIONS,
  applyTheme,
  currentThemeName,
  formatThemeList,
  listThemes,
  parseThemeArgs,
  publish,
  resolveThemeName,
  registerAction,
  subscribe,
  themeSelectItems,
  uiAvailable,
} from "../../lib/ui/index.mjs";
import { overlayChild, overlayHub, overlayPalette, overlaySelect, overlayStatus } from "./overlays.ts";

let widgetMounted = false;

function readProjectName(cwd: string): string {
  try {
    const raw = fs.readFileSync(path.join(cwd, ".pi", "1c", "project.yaml"), "utf8");
    const m = raw.match(/^\s*name:\s*(.+)$/m);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : "";
  } catch {
    return path.basename(cwd);
  }
}

function collectSnapshot(ctx: any, footerData?: any, pi?: ExtensionAPI) {
  const mode = getSnapshot("mode") || {};
  const rotate = getSnapshot("rotate") || {};
  const capture = getSnapshot("capture") || {};
  const agents = getSnapshot("agents") || {};
  const mcp = getSnapshot("mcp") || {};
  const thinkingSnap = getSnapshot("thinking") || {};
  const usage = typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : undefined;
  const config = (() => { try { return loadConfiguration(ctx.cwd); } catch { return null; } })();
  const init = (() => { try { return initStatus(ctx.cwd); } catch { return null; } })();
  const thinkingLevel = ctx.thinkingLevel
    || (typeof pi?.getThinkingLevel === "function" ? pi.getThinkingLevel() : undefined)
    || thinkingSnap.level
    || "off";
  return {
    mode: mode.mode || "ask",
    phase: mode.phase,
    planId: mode.planId,
    anonLevel: mode.anonLevel || 0,
    approve: mode.approve || "off",
    rotateEnabled: rotate.enabled === true,
    rotateThreshold: rotate.thresholdPercent ?? 85,
    captureEnabled: capture.idleEnabled === true && capture.host === "pi",
    captureMode: capture.distillerMode,
    contextPercent: usage?.percent ?? null,
    gitBranch: footerData?.getGitBranch?.() ?? null,
    gitDirty: false,
    projectName: readProjectName(ctx.cwd) || config?.name,
    model: ctx.model?.id,
    thinkingLevel,
    mcpConnected: Number(mcp.connected) || 0,
    mcpEnabled: Number(mcp.enabled) || 0,
    configuration: config ? `${config.name} ${config.version}` : "",
    knowledge: init?.knowledgeLayout?.complete ? "initialized" : (config ? "layout" : "uninitialized"),
    fingerprint: config?.fingerprint ? "current" : "",
    cognee: capture.cognee || "unknown",
    openviking: capture.openviking || "unknown",
    agents: agents.runs || [],
  };
}

function seedMcpFromDisk(cwd: string) {
  if (getSnapshot("mcp")) return;
  const files = [
    process.env.PI_CODING_AGENT_DIR && path.join(String(process.env.PI_CODING_AGENT_DIR).trim(), "mcp.json"),
    path.join(cwd, "mcp.json"),
    path.join(cwd, ".pi", "mcp.json"),
  ].filter(Boolean) as string[];
  const merged: Record<string, unknown> = {};
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw?.mcpServers && typeof raw.mcpServers === "object") Object.assign(merged, raw.mcpServers);
    } catch {
      // missing or invalid mcp.json is not a footer failure
    }
  }
  publish("mcp", mcpCountsFromConfig({ mcpServers: merged }));
}

function mountFooter(ctx: any, pi?: ExtensionAPI) {
  if (!uiAvailable(ctx) || typeof ctx.ui.setFooter !== "function") return;
  ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
    const unsubBranch = footerData?.onBranchChange?.(() => tui.requestRender()) || (() => {});
    const unsubBus = subscribe(() => tui.requestRender());
    return {
      dispose() { unsubBranch(); unsubBus(); },
      invalidate() {},
      render(width: number) {
        const snap = collectSnapshot(ctx, footerData, pi);
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

function mountAgentWidget(ctx: any) {
  if (!uiAvailable(ctx) || typeof ctx.ui.setWidget !== "function" || widgetMounted) return;
  widgetMounted = true;
  ctx.ui.setWidget("pi-1c-agents", (tui: any) => {
    let tick: ReturnType<typeof setInterval> | null = null;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    let hideSettled = false;
    const unsub = subscribe(() => tui.requestRender());
    const stopTick = () => {
      if (tick) {
        clearInterval(tick);
        tick = null;
      }
    };
    const startTick = () => {
      if (tick) return;
      tick = setInterval(() => tui.requestRender(), 1000);
    };
    return {
      dispose() {
        unsub();
        stopTick();
        if (clearTimer) clearTimeout(clearTimer);
        widgetMounted = false;
      },
      invalidate() {},
      render(width: number) {
        const runs = getSnapshot("agents")?.runs || [];
        const active = runs.filter((r: any) => ACTIVE_STATUSES.includes(r.status));
        if (active.length) {
          hideSettled = false;
          if (clearTimer) {
            clearTimeout(clearTimer);
            clearTimer = null;
          }
          startTick();
        } else {
          stopTick();
          if (!hideSettled && composeWidgetLines(runs).length && !clearTimer) {
            clearTimer = setTimeout(() => {
              hideSettled = true;
              tui.requestRender();
            }, 2500);
          }
        }
        const lines = hideSettled ? [] : composeWidgetLines(runs);
        return lines.map((line) => truncateToWidth(line, Math.max(1, width)));
      },
      handleMouse(event: any) {
        if (event?.type === "click" && event?.button === "left") {
          invokeAction("agents-enter", ctx);
          return { handled: true };
        }
      },
    };
  }, { placement: "aboveEditor" });
}

async function showStatus(ctx: any, pi: ExtensionAPI) {
  const text = composeStatus(collectSnapshot(ctx, undefined, pi));
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
  if (id === "theme") return invokeAction("theme-select", ctx);
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
  registerAction("agents-enter", (ctx: any, agent?: string) => overlayChild(ctx, agent));
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

  async function handleTheme(args: string | undefined, ctx: any) {
    const parsed = parseThemeArgs(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify(`Unknown theme argument: ${parsed.raw}. Use /theme, /theme <name>, /theme list, or /theme status.`, "error");
      return;
    }
    if (parsed.kind === "status" || parsed.kind === "list") {
      ctx.ui.notify(formatThemeList(listThemes(ctx), currentThemeName(ctx)), "info");
      return;
    }
    const name = parsed.kind === "set"
      ? resolveThemeName(parsed.name, listThemes(ctx))
      : await pickTheme(ctx);
    if (!name) return;
    const result = applyTheme(ctx, name);
    if (!result.success) {
      ctx.ui.notify(result.error || `Failed to set theme ${name}`, "error");
      return;
    }
    ctx.ui.notify(`theme=${name}`, "info");
  }

  async function pickTheme(ctx: any): Promise<string | undefined> {
    const items = themeSelectItems(listThemes(ctx), currentThemeName(ctx));
    if (!items.length) {
      ctx.ui.notify("No themes discovered. Built-in: dark, light. Package: standard, dracula.", "warning");
      return undefined;
    }
    if (uiAvailable(ctx)) return overlaySelect(ctx, "Choose theme", items);
    return ctx.ui.select("Theme", items.map((i: { value: string }) => i.value));
  }

  pi.registerCommand("status", {
    description: "Show Pi 1C Agent status (mode, project, memory, agents)",
    handler: async (_args, ctx) => showStatus(ctx, pi),
  });
  pi.registerCommand("palette", {
    description: "Open the Pi 1C command palette (Ctrl+Shift+K)",
    handler: async (_args, ctx) => invokeAction("palette-open", ctx),
  });
  pi.registerCommand("theme", {
    description: "Select TUI theme: /theme | /theme standard | /theme dracula | /theme list | /theme status",
    handler: handleTheme,
  });
  registerAction("theme-select", (ctx: any) => handleTheme(undefined, ctx));
  registerAction("command:theme", (args: any, ctx: any) => handleTheme(args, ctx));

  pi.registerShortcut(Key.alt("a"), {
    description: "Open 1C Agent Hub",
    handler: async (ctx) => showHub(ctx),
  });
  pi.registerShortcut(Key.ctrlShift("k"), {
    description: "Open Pi 1C command palette",
    handler: async (ctx) => invokeAction("palette-open", ctx),
  });

  const events = (pi as { events?: { on?: (event: string, handler: (snapshot: unknown) => void) => void } }).events;
  if (events && typeof events.on === "function") {
    events.on(MCP_STATUS_EVENT, (snapshot: unknown) => {
      publish("mcp", mcpCountsFromAdapterSnapshot(snapshot));
    });
  }

  const publishThinking = (level?: string, ctx?: any) => {
    const next = level
      || ctx?.thinkingLevel
      || (typeof pi.getThinkingLevel === "function" ? pi.getThinkingLevel() : undefined)
      || "off";
    publish("thinking", { level: next });
  };

  pi.on("thinking_level_select", async (event: any, ctx) => {
    publishThinking(event?.level, ctx);
  });
  pi.on("model_select", async (_event, ctx) => {
    publishThinking(undefined, ctx);
  });
  pi.on("session_start", async (_event, ctx) => {
    seedMcpFromDisk(ctx.cwd);
    publishThinking(undefined, ctx);
    if (!uiAvailable(ctx)) return;
    mountFooter(ctx, pi);
    mountAgentWidget(ctx);
  });
  pi.on("agent_end", async (_event, ctx) => {
    if (uiAvailable(ctx)) mountAgentWidget(ctx);
  });
}
