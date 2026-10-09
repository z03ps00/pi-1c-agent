import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { alignChatTree } from "../../lib/ui/message-align.mjs";
import { readDevEnvFile } from "../../lib/dev-env-key.mjs";
import { infobaseLabel } from "../../lib/ib-label.mjs";
import { loadConfiguration } from "../../lib/knowledge.mjs";
import { readGitMark } from "../../lib/ui/git-mark.mjs";
import { formatCapabilityFooter, snapshotCapabilities } from "../../lib/harness/capabilities.mjs";
import { readLearningMode } from "../../lib/harness/learning.mjs";
import { contextPercent } from "../../lib/harness/budget.mjs";
import { getSession } from "../../lib/harness/session.mjs";
import { initStatus } from "../../lib/project-init.mjs";
import {
  ACTIVE_STATUSES,
  colorize,
  composeWorkFooter,
  countOpenChanges,
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
  THEME_INTRO,
  themeSelectItems,
  uiAvailable,
} from "../../lib/ui/index.mjs";
import { overlayChild, overlayCommandGroups, overlayHub, overlayModeSelect, overlayPalette, overlaySelect, overlayStatus } from "./overlays.ts";

let widgetMounted = false;
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const profileRoot = process.env.PI_CODING_AGENT_DIR?.trim() || path.resolve(packageRoot, "..", "..");

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
  const session = getSession();
  const harnessPct = session.budget?.used ? contextPercent(session.budget) : null;
  const env = readDevEnvFile(ctx.cwd).values || {};
  const ib = infobaseLabel(env);
  const git = readGitMark(ctx.cwd, footerData?.getGitBranch?.() ?? "");
  const thinkingLevel = ctx.thinkingLevel
    || (typeof pi?.getThinkingLevel === "function" ? pi.getThinkingLevel() : undefined)
    || thinkingSnap.level
    || "off";
  return {
    mode: mode.mode || "ask",
    phase: mode.phase,
    planId: mode.planId,
    taskmode: mode.taskmode || "auto",
    anonLevel: mode.anonLevel || 0,
    approve: mode.approve || "off",
    learning: readLearningMode(profileRoot),
    rotateEnabled: rotate.enabled === true,
    rotateThreshold: rotate.thresholdPercent ?? 85,
    captureEnabled: capture.idleEnabled === true && capture.host === "pi",
    captureMode: capture.distillerMode,
    contextPercent: harnessPct ?? usage?.percent ?? null,
    capabilityFooter: session.tools.length ? formatCapabilityFooter(snapshotCapabilities(session.tools)) : "",
    gitBranch: git.branch || footerData?.getGitBranch?.() || "",
    gitDirty: git.dirty === true,
    depth: env.VERIFICATION_DEPTH || "standard",
    economy: env.ORCHESTRATION || "standard",
    ui: env.UI_TESTING || "essential",
    changes: countOpenChanges(ctx.cwd),
    ibKind: ib.kind,
    ibName: ib.name,
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
        const paintFg = (token: string, text: string) => {
          try { return typeof theme?.fg === "function" ? theme.fg(token, text) : text; } catch { return text; }
        };
        const paints = {
          border: (text: string) => paintFg("text", text),
          title: (text: string) => paintFg("accent", typeof theme?.bold === "function" ? theme.bold(text) : text),
          bg: (text: string) => {
            try { return typeof theme?.bg === "function" ? theme.bg("userMessageBg", text) : text; } catch { return text; }
          },
        };
        if (alignChatTree(tui, paints, { visibleWidth, truncateToWidth })) tui.requestRender?.();
        const snap = collectSnapshot(ctx, footerData, pi);
        const view = composeWorkFooter(snap, width);
        const modeWord = ({ ask: "Вопрос", plan: "Планирование", build: "Реализация" } as Record<string, string>)[String(snap.mode || "ask")] || "";
        return view.lines.map((line: { kind: string; text: string }) => {
          if (line.kind === "title") return truncateToWidth(colorize(theme, "accent", line.text), Math.max(1, width));
          if (line.kind === "rule") return truncateToWidth(colorize(theme, "dim", line.text), Math.max(1, width));
          if (line.kind === "primary" && modeWord) {
            const colored = line.text.replace(modeWord, colorize(theme, modeColor(snap.mode), modeWord));
            return truncateToWidth(colored, Math.max(1, width));
          }
          return truncateToWidth(colorize(theme, "dim", line.text), Math.max(1, width));
        });
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
  if (id === "taskmode") return invokeAction("taskmode-select", ctx);
  if (id === "approve") return invokeAction("approve-select", ctx);
  if (id === "anon") return invokeAction("anon-select", ctx);
  if (id === "init") return invokeAction("init-open", ctx);
  if (id === "theme") return invokeAction("theme-select", ctx);
  if (id === "settings") return showStatus(ctx, pi);
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
  registerAction("mode-overlay", (ctx: any) => overlayModeSelect(ctx));

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
    if (uiAvailable(ctx)) return overlaySelect(ctx, "Choose theme", items, THEME_INTRO);
    return ctx.ui.select("Theme", items.map((i: { value: string }) => i.value));
  }

  pi.registerCommand("status", {
    description: "Статус: режим, проект, память и агенты",
    handler: async (_args, ctx) => showStatus(ctx, pi),
  });
  pi.registerCommand("palette", {
    description: "Палитра частых действий (Ctrl+Shift+K)",
    handler: async (_args, ctx) => invokeAction("palette-open", ctx),
  });
  pi.registerCommand("theme", {
    description: "Тема терминала: /theme, /theme standard, /theme dracula, /theme list, /theme status",
    handler: handleTheme,
  });
  registerAction("theme-select", (ctx: any) => handleTheme(undefined, ctx));
  registerAction("command:theme", (args: any, ctx: any) => handleTheme(args, ctx));

  pi.registerShortcut(Key.alt("a"), {
    description: "Список субагентов",
    handler: async (ctx) => showHub(ctx),
  });
  let slashGroupsAttached = false;
  let groupsOpening = false;
  let slashCtx: any = null;

  function slashToken(lines: string[], cursorLine: number, cursorCol: number) {
    const line = String(lines?.[cursorLine] ?? "");
    const left = line.slice(0, Math.max(0, cursorCol));
    const match = left.match(/(?:^|\s)(\/[^\s]*)$/);
    return match ? match[1] : "";
  }

  function attachSlashGroups(ctx: any) {
    slashCtx = ctx;
    if (slashGroupsAttached) return;
    if (typeof ctx?.ui?.addAutocompleteProvider !== "function") return;
    slashGroupsAttached = true;
    ctx.ui.addAutocompleteProvider((current: any) => ({
      triggerCharacters: ["/"],
      async getSuggestions(lines: string[], cursorLine: number, cursorCol: number, options: any) {
        const live = slashCtx || ctx;
        const joined = (lines || []).join("\n").trim();
        const token = slashToken(lines || [], cursorLine, cursorCol);
        if (joined === "/" && token === "/") {
          if (!groupsOpening) {
            groupsOpening = true;
            queueMicrotask(async () => {
              try {
                if (typeof live.ui?.setEditorText === "function") live.ui.setEditorText("");
                await openCommandGroups(live);
              } finally {
                groupsOpening = false;
              }
            });
          }
          return null;
        }
        if (typeof current?.getSuggestions === "function") {
          return current.getSuggestions(lines, cursorLine, cursorCol, options);
        }
        return null;
      },
      applyCompletion(lines: string[], cursorLine: number, cursorCol: number, item: any, prefix: string) {
        if (typeof current?.applyCompletion === "function") {
          return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
        }
        return { lines, cursorLine, cursorCol };
      },
    }));
  }

  async function openCommandGroups(ctx: any) {
    const listed = typeof pi.getCommands === "function" ? pi.getCommands() : [];
    const name = await overlayCommandGroups(ctx, listed);
    if (!name) return;
    const text = `/${name} `;
    if (typeof ctx.ui?.setEditorText === "function") {
      ctx.ui.setEditorText(text);
      return;
    }
    ctx.ui.notify(text.trim(), "info");
  }

  pi.registerCommand("groups", {
    description: "Разделы команд. Выбранная команда попадает в поле и не запускается",
    handler: async (_args, ctx) => openCommandGroups(ctx),
  });
  pi.registerShortcut(Key.ctrlShift("g"), {
    description: "Открыть разделы команд",
    handler: async (ctx) => openCommandGroups(ctx),
  });

  pi.registerShortcut(Key.ctrlShift("k"), {
    description: "Открыть палитру частых действий",
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
    attachSlashGroups(ctx);
    if (!uiAvailable(ctx)) return;
    mountFooter(ctx, pi);
    mountAgentWidget(ctx);
  });
  pi.on("agent_end", async (_event, ctx) => {
    if (uiAvailable(ctx)) mountAgentWidget(ctx);
  });
}
