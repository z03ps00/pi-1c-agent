import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CAVEMAN_CHOICES,
  DEFAULTS,
  ECONOMY_CHOICES,
  ECONOMY_CLIENT_CHOICES,
  ECONOMY_PRESET_CHOICES,
  ECONOMY_PRESETS,
  PREVIEW_CHOICES,
  RULESMODEL_CHOICES,
  SDLC_CHOICES,
  SETTINGS_STATE_TYPE,
  UITESTS_CHOICES,
  detectEconomyClient,
  parseCavemanArgs,
  parseEconomyArgs,
  parseLitemodeArgs,
  parsePreviewArgs,
  parseRulesmodelArgs,
  parseSdlcArgs,
  parseUitestsArgs,
  settingsNote,
} from "../../lib/project-settings.mjs";
import { readDevEnvKey, setDevEnvKey, setDevEnvKeys } from "../../lib/dev-env-key.mjs";
import { pickOverlay } from "../1c-ui/overlays.ts";
import { registerAction } from "../../lib/ui/index.mjs";

type SettingsState = {
  VERIFICATION_DEPTH?: string;
  UI_TESTING?: string;
  MCP_QA_CLIENT_VISIBLE?: string;
  METADATA_PREVIEW?: string;
  CAVEMAN?: string;
  cavemanSession?: string;
  previewOnce?: boolean;
  ORCHESTRATION?: string;
  AGENT_MODEL?: string;
  SUBAGENT_MODEL_CODING?: string;
  SUBAGENT_MODEL_ANALYSIS?: string;
  SUBAGENT_MODEL_LIGHT?: string;
};

function restore(entries: any[]): SettingsState {
  const hits = (entries || []).filter((e: any) => e?.type === "custom" && e.customType === SETTINGS_STATE_TYPE);
  const last = hits[hits.length - 1];
  return last?.data?.state && typeof last.data.state === "object" ? { ...last.data.state } : {};
}

export default function projectSettingsExtension(pi: ExtensionAPI): void {
  let state: SettingsState = {};
  let cwd = process.cwd();

  function persist(): void {
    pi.appendEntry(SETTINGS_STATE_TYPE, { state });
  }

  function fileKey(name: string): { exists: boolean; value: string } {
    return readDevEnvKey(cwd, name);
  }

  function applyKey(name: string, value: string, comment: string, sessionField: keyof SettingsState): { persisted: boolean } {
    const written = setDevEnvKey(cwd, name, value, comment);
    if (written.persisted) {
      delete state[sessionField];
      persist();
      return { persisted: true };
    }
    (state as Record<string, unknown>)[sessionField] = value;
    persist();
    return { persisted: false };
  }

  function scopeLine(persisted: boolean): string {
    return persisted ? "записано в .dev.env проекта" : "только эта сессия (.dev.env нет — частичный файл не создаю)";
  }

  async function handleSdlc(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parseSdlcArgs(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify("sdlc: lite | standard | full | status", "error");
      return;
    }
    if (parsed.kind === "status") {
      const file = fileKey("VERIFICATION_DEPTH");
      const value = state.VERIFICATION_DEPTH || file.value || DEFAULTS.VERIFICATION_DEPTH;
      const ui = state.UI_TESTING || fileKey("UI_TESTING").value || DEFAULTS.UI_TESTING;
      ctx.ui.notify(`sdlc=${value} · UI_TESTING=${ui} (не меняется этой командой)`, "info");
      return;
    }
    const depth = parsed.kind === "pick"
      ? await pickOverlay(ctx, "SDLC QA profile", SDLC_CHOICES)
      : parsed.depth;
    if (!depth) return;
    const { persisted } = applyKey("VERIFICATION_DEPTH", depth, "# full | standard | lite (/sdlc, /litemode)", "VERIFICATION_DEPTH");
    ctx.ui.notify(`sdlc=${depth} · ${scopeLine(persisted)} · UI_TESTING не тронут · syntaxcheck остаётся обязательным`, "info");
  }

  async function handleLitemode(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parseLitemodeArgs(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify("litemode: lite | standard | full | off | status", "error");
      return;
    }
    if (parsed.kind === "status") {
      const depth = state.VERIFICATION_DEPTH || fileKey("VERIFICATION_DEPTH").value || DEFAULTS.VERIFICATION_DEPTH;
      const ui = state.UI_TESTING || fileKey("UI_TESTING").value || DEFAULTS.UI_TESTING;
      ctx.ui.notify(`litemode: VERIFICATION_DEPTH=${depth} · UI_TESTING=${ui}`, "info");
      return;
    }
    const depth = parsed.kind === "pick"
      ? await pickOverlay(ctx, "Verification depth", SDLC_CHOICES)
      : parsed.depth;
    if (!depth) return;
    const depthWrite = setDevEnvKey(cwd, "VERIFICATION_DEPTH", depth, "# full | standard | lite (/litemode)");
    if (depthWrite.persisted) delete state.VERIFICATION_DEPTH;
    else state.VERIFICATION_DEPTH = depth;
    let uiNote = "";
    if (depth === "lite") {
      const uiWrite = setDevEnvKey(cwd, "UI_TESTING", "off", "# /litemode lite disables UI tests");
      if (uiWrite.persisted) delete state.UI_TESTING;
      else state.UI_TESTING = "off";
      uiNote = " · UI_TESTING=off";
    }
    persist();
    const persisted = depthWrite.persisted;
    ctx.ui.notify(`VERIFICATION_DEPTH=${depth}${uiNote} · ${scopeLine(persisted)} · syntaxcheck на задетых модулях обязателен`, "info");
  }

  async function handleUitests(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parseUitestsArgs(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify("uitests: essential | auto | manual | off | visible | hidden | status", "error");
      return;
    }
    if (parsed.kind === "status") {
      const ui = state.UI_TESTING || fileKey("UI_TESTING").value || DEFAULTS.UI_TESTING;
      const vis = state.MCP_QA_CLIENT_VISIBLE || fileKey("MCP_QA_CLIENT_VISIBLE").value || DEFAULTS.MCP_QA_CLIENT_VISIBLE;
      ctx.ui.notify(`UI_TESTING=${ui} · MCP_QA_CLIENT_VISIBLE=${vis}`, "info");
      return;
    }
    let key = parsed.key;
    let value = parsed.value;
    if (parsed.kind === "pick") {
      const selected = await pickOverlay(ctx, "UI tests", UITESTS_CHOICES);
      if (!selected) return;
      const next = parseUitestsArgs(selected);
      if (next.kind !== "set") return;
      key = next.key;
      value = next.value;
    }
    const field = key === "UI_TESTING" ? "UI_TESTING" : "MCP_QA_CLIENT_VISIBLE";
    const { persisted } = applyKey(key as string, String(value), `# ${key} (/uitests)`, field);
    ctx.ui.notify(`${key}=${value} · ${scopeLine(persisted)} · это политика, не запуск тестов`, "info");
  }

  async function handlePreview(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parsePreviewArgs(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify("previewmode: on | auto | off | once | status", "error");
      return;
    }
    if (parsed.kind === "status") {
      const file = fileKey("METADATA_PREVIEW");
      const value = state.METADATA_PREVIEW || file.value || DEFAULTS.METADATA_PREVIEW;
      ctx.ui.notify(`METADATA_PREVIEW=${value}${state.previewOnce ? " · once for the next write" : ""}`, "info");
      return;
    }
    const selected = parsed.kind === "pick"
      ? await pickOverlay(ctx, "Metadata preview", PREVIEW_CHOICES)
      : parsed.kind === "once" ? "once" : parsed.value;
    if (!selected) return;
    if (selected === "once") {
      state.previewOnce = true;
      persist();
      ctx.ui.notify("previewmode=once · только следующий metadata write, .dev.env не меняю", "info");
      return;
    }
    state.previewOnce = false;
    const { persisted } = applyKey("METADATA_PREVIEW", selected, "# on | auto | off (/previewmode)", "METADATA_PREVIEW");
    ctx.ui.notify(`METADATA_PREVIEW=${selected} · ${scopeLine(persisted)}`, "info");
  }

  async function handleCaveman(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parseCavemanArgs(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify("caveman: on | auto | off | lite | full | ultra | status", "error");
      return;
    }
    if (parsed.kind === "status") {
      const file = fileKey("CAVEMAN");
      const value = state.CAVEMAN || file.value || DEFAULTS.CAVEMAN;
      ctx.ui.notify(`CAVEMAN=${value}${state.cavemanSession ? ` · session ${state.cavemanSession}` : ""}`, "info");
      return;
    }
    let value = parsed.value;
    let persistFile = parsed.persist;
    if (parsed.kind === "pick") {
      const selected = await pickOverlay(ctx, "Caveman style", CAVEMAN_CHOICES);
      if (!selected) return;
      const next = parseCavemanArgs(selected);
      if (next.kind !== "set") return;
      value = next.value;
      persistFile = next.persist;
    }
    if (!persistFile) {
      state.cavemanSession = value;
      persist();
      ctx.ui.notify(`caveman session=${value} · .dev.env не меняю`, "info");
      return;
    }
    state.cavemanSession = undefined;
    const { persisted } = applyKey("CAVEMAN", String(value), "# on | auto | off (/caveman)", "CAVEMAN");
    ctx.ui.notify(`CAVEMAN=${value} · ${scopeLine(persisted)} · гейты и syntaxcheck не ослабляются`, "info");
  }

  async function configureModels(ctx: ExtensionContext) {
    let client = detectEconomyClient(cwd);
    if (!client) client = await pickOverlay(ctx, "AI client for subagent models", ECONOMY_CLIENT_CHOICES);
    if (!client) return;
    const preset = await pickOverlay(ctx, "Subagent model preset", ECONOMY_PRESET_CHOICES);
    if (!preset) return;
    if (preset === "inherit") {
      ctx.ui.notify("SUBAGENT_MODEL_* не пишу — субагенты наследуют модель родителя", "warning");
      return;
    }
    let coding = "";
    let analysis = "";
    let light = "";
    const row = ECONOMY_PRESETS[client as keyof typeof ECONOMY_PRESETS]?.[preset as "economy" | "balanced" | "quality"];
    if (row) {
      [coding, analysis, light] = row;
    } else {
      if (!ctx.hasUI || typeof ctx.ui.input !== "function") {
        ctx.ui.notify("economymode models: введите /economymode models после открытия TUI, либо задайте три slug вручную в .dev.env", "error");
        return;
      }
      coding = String(await ctx.ui.input("SUBAGENT_MODEL_CODING") ?? "").trim();
      analysis = String(await ctx.ui.input("SUBAGENT_MODEL_ANALYSIS") ?? "").trim();
      light = String(await ctx.ui.input("SUBAGENT_MODEL_LIGHT") ?? "").trim();
      if (!coding || !analysis || !light) {
        ctx.ui.notify("нужны три slug: coding, analysis, light", "error");
        return;
      }
    }
    const written = setDevEnvKeys(cwd, {
      SUBAGENT_MODEL_CODING: { value: coding },
      SUBAGENT_MODEL_ANALYSIS: { value: analysis },
      SUBAGENT_MODEL_LIGHT: { value: light },
    });
    if (written.persisted) {
      delete state.SUBAGENT_MODEL_CODING;
      delete state.SUBAGENT_MODEL_ANALYSIS;
      delete state.SUBAGENT_MODEL_LIGHT;
    } else {
      state.SUBAGENT_MODEL_CODING = coding;
      state.SUBAGENT_MODEL_ANALYSIS = analysis;
      state.SUBAGENT_MODEL_LIGHT = light;
    }
    persist();
    const scope = written.persisted ? "записано в .dev.env" : "только сессия (.dev.env нет)";
    ctx.ui.notify(`модели субагентов ${client}/${preset}: coding=${coding} · analysis=${analysis} · light=${light} · ${scope}. Нужен install.ps1 update / перезапуск клиента, чтобы файлы субагентов перечитались.`, "info");
  }

  async function handleEconomy(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parseEconomyArgs(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify("economymode: on | off | models | rtk | status", "error");
      return;
    }
    if (parsed.kind === "status") {
      const orch = state.ORCHESTRATION || fileKey("ORCHESTRATION").value || DEFAULTS.ORCHESTRATION;
      ctx.ui.notify(`ORCHESTRATION=${orch} · модели: /economymode models · rtk: /economymode rtk`, "info");
      return;
    }
    if (parsed.kind === "models") {
      await configureModels(ctx);
      return;
    }
    if (parsed.kind === "rtk") {
      ctx.ui.notify("rtk — сторонний прокси сжатия shell-вывода. Установка не из этого окна. Linux/macOS: brew install rtk или curl install.sh; затем rtk init -g [--agent cursor|--codex|--opencode]. Снос: rtk init -g --uninstall. Только после явного подтверждения в shell.", "info");
      return;
    }
    const selected = parsed.kind === "pick"
      ? await pickOverlay(ctx, "Orchestrator economy", ECONOMY_CHOICES)
      : parsed.value === "economy" ? "on" : "off";
    if (!selected) return;
    const value = selected === "on" || selected === "economy" ? "economy" : "standard";
    const { persisted } = applyKey("ORCHESTRATION", value, "# standard | economy (/economymode)", "ORCHESTRATION");
    if (value === "economy") {
      ctx.ui.notify(`ORCHESTRATION=economy · ${scopeLine(persisted)} · модели субагентов: /economymode models`, "info");
      return;
    }
    ctx.ui.notify(`ORCHESTRATION=standard · ${scopeLine(persisted)} · SUBAGENT_MODEL_* не трогаю`, "info");
  }

  async function handleRulesmodel(args: string | undefined, ctx: ExtensionContext) {
    const parsed = parseRulesmodelArgs(args);
    if (parsed.kind === "invalid") {
      ctx.ui.notify("rulesmodel: opus5 | sonnet5 | fable5 | gpt56 | gpt6 | off | status", "error");
      return;
    }
    if (parsed.kind === "status") {
      const file = fileKey("AGENT_MODEL");
      const value = state.AGENT_MODEL !== undefined ? state.AGENT_MODEL : (file.value || "");
      ctx.ui.notify(`AGENT_MODEL=${value || "(empty, base ruleset)"}`, "info");
      return;
    }
    const selected = parsed.kind === "pick"
      ? await pickOverlay(ctx, "Agent model profile", RULESMODEL_CHOICES)
      : parsed.value === "" ? "off" : parsed.value;
    if (!selected) return;
    const slug = selected === "off" ? "" : selected;
    const { persisted } = applyKey("AGENT_MODEL", slug, "# opus5 | sonnet5 | fable5 | gpt56 | gpt6 (/rulesmodel)", "AGENT_MODEL");
    if (!slug) {
      ctx.ui.notify(`AGENT_MODEL очищен · ${scopeLine(persisted)} · базовый model-neutral свод`, "info");
      return;
    }
    ctx.ui.notify(`AGENT_MODEL=${slug} · ${scopeLine(persisted)} · гейты и syntaxcheck не ослабляются`, "info");
  }

  pi.registerCommand("sdlc", {
    description: "SDLC QA profile: /sdlc lite | standard | full | status",
    handler: handleSdlc,
  });
  pi.registerCommand("litemode", {
    description: "Verification depth: /litemode lite | standard | full | status",
    handler: handleLitemode,
  });
  pi.registerCommand("uitests", {
    description: "UI testing policy: /uitests essential|auto|manual|off|visible|hidden|status",
    handler: handleUitests,
  });
  pi.registerCommand("previewmode", {
    description: "Metadata preview: /previewmode on|auto|off|once|status",
    handler: handlePreview,
  });
  pi.registerCommand("caveman", {
    description: "Caveman style: /caveman on|auto|off|lite|full|ultra|status",
    handler: handleCaveman,
  });
  pi.registerCommand("economymode", {
    description: "Orchestrator economy: /economymode on|off|models|rtk|status",
    handler: handleEconomy,
  });
  pi.registerCommand("rulesmodel", {
    description: "Parent-agent model profile: /rulesmodel opus5|sonnet5|fable5|gpt56|gpt6|off|status",
    handler: handleRulesmodel,
  });

  registerAction("command:sdlc", (args: any, ctx: any) => handleSdlc(args, ctx));
  registerAction("command:litemode", (args: any, ctx: any) => handleLitemode(args, ctx));
  registerAction("command:uitests", (args: any, ctx: any) => handleUitests(args, ctx));
  registerAction("command:previewmode", (args: any, ctx: any) => handlePreview(args, ctx));
  registerAction("command:caveman", (args: any, ctx: any) => handleCaveman(args, ctx));
  registerAction("command:economymode", (args: any, ctx: any) => handleEconomy(args, ctx));
  registerAction("command:rulesmodel", (args: any, ctx: any) => handleRulesmodel(args, ctx));

  pi.on("session_start", async (_event, ctx) => {
    cwd = ctx.cwd;
    state = restore(ctx.sessionManager.getEntries());
  });

  pi.on("before_agent_start", async (event) => {
    const note = settingsNote({
      VERIFICATION_DEPTH: state.VERIFICATION_DEPTH,
      UI_TESTING: state.UI_TESTING,
      MCP_QA_CLIENT_VISIBLE: state.MCP_QA_CLIENT_VISIBLE,
      METADATA_PREVIEW: state.METADATA_PREVIEW,
      previewOnce: state.previewOnce,
      CAVEMAN: state.CAVEMAN,
      cavemanSession: state.cavemanSession,
      ORCHESTRATION: state.ORCHESTRATION,
      AGENT_MODEL: state.AGENT_MODEL,
      SUBAGENT_MODEL_CODING: state.SUBAGENT_MODEL_CODING,
      SUBAGENT_MODEL_ANALYSIS: state.SUBAGENT_MODEL_ANALYSIS,
      SUBAGENT_MODEL_LIGHT: state.SUBAGENT_MODEL_LIGHT,
    });
    if (!note) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${note}` };
  });
}
