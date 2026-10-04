import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { overlaySelect, overlayText } from "../1c-ui/overlays.ts";
import { getSnapshot, uiAvailable } from "../../lib/ui/index.mjs";
import {
  formatCapabilityBlock,
  isStructuralToolName,
  snapshotCapabilities,
} from "../../lib/harness/capabilities.mjs";
import { rankBySummary, tryAdmit } from "../../lib/harness/budget.mjs";
import { renderContextView } from "../../lib/harness/context-view.mjs";
import {
  approveDraft,
  createManualDraft,
  listDrafts,
  queueEvolutionMemory,
} from "../../lib/harness/evolution.mjs";
import {
  applyDecisionStats,
  decide,
  noteToolStats,
  shouldBlockTool,
} from "../../lib/harness/router.mjs";
import { beginTurn, getSession, markStructuralCall, noteTools, setDecision } from "../../lib/harness/session.mjs";
import {
  catalogMarkdownFiles,
  chooseSkills,
  indexManifests,
  loadKnowledgeSlice,
  readSkillBody,
  readTextFile,
} from "../../lib/harness/skills.mjs";
import { bump, formatSessionStats } from "../../lib/harness/stats.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const profileRoot = process.env.PI_CODING_AGENT_DIR?.trim() || path.resolve(packageRoot, "..", "..");

const EVOLVE_CHOICES = [
  { value: "skill", label: "skill", description: "Черновик skill. Активные skills не меняются." },
  { value: "rule", label: "rule", description: "Черновик rule. Активные rules не меняются." },
  { value: "workflow", label: "workflow", description: "Черновик workflow." },
  { value: "prompt", label: "prompt", description: "Черновик prompt." },
  { value: "ruleset", label: "ruleset", description: "Прежний проход LLM-RULES.md: note, show или полный сбор." },
];

const RULESET_KINDS = new Set(["ruleset", "rules", "note", "show"]);

function rulesetInstructions(args: string) {
  const file = path.join(packageRoot, "docs", "evolve-ruleset.md");
  const body = fs.readFileSync(file, "utf8");
  return `${body}\n\nUser arguments: ${args || "(full pass)"}`;
}

function show(pi: ExtensionAPI, ctx: any, title: string, body: string) {
  if (uiAvailable(ctx)) return overlayText(ctx, title, body);
  pi.sendMessage({ customType: "pi-1c-harness", content: body, display: true }, { triggerTurn: false });
  return undefined;
}

function currentMode() {
  return getSnapshot("mode")?.mode || "ask";
}

function anonLevel() {
  return Number(getSnapshot("mode")?.anonLevel) || 0;
}

function memoryConnected() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(profileRoot, "mcp.json"), "utf8"));
    const names = Object.keys(raw?.mcpServers || {});
    if (!names.some((name) => /memory|knowledge|cognee|viking/i.test(name))) return false;
  } catch {
    return false;
  }
  return Number(getSnapshot("mcp")?.connected) > 0;
}

function admitFile(session: ReturnType<typeof getSession>, id: string, bucket: "skill" | "rules" | "knowledge", text: string) {
  return tryAdmit(session.budget, { id, bucket, text }, session.stats);
}

export default function oneCContextRouter(pi: ExtensionAPI): void {
  pi.registerCommand("capabilities", {
    description: "Show the 1C capability snapshot",
    handler: async (_args, ctx) => {
      const body = formatCapabilityBlock(snapshotCapabilities(getSession().tools));
      await show(pi, ctx, "1C Capabilities", body);
    },
  });

  pi.registerCommand("context", {
    description: "Show context budget, loaded skills, rules, knowledge, and source strategy",
    handler: async (_args, ctx) => {
      const session = getSession();
      const body = renderContextView({
        budget: session.budget,
        loaded: session.loaded,
        skipped: session.skipped,
        decision: session.decision,
      });
      await show(pi, ctx, "Context", body);
    },
  });

  pi.registerCommand("session-stats", {
    description: "Print session routing and context counters",
    handler: async () => {
      pi.sendMessage({
        customType: "pi-1c-session-stats",
        content: formatSessionStats(getSession().stats),
        display: true,
      }, { triggerTurn: false });
    },
  });

  pi.registerCommand("evolve", {
    description: "Draft a skill, rule, workflow, or prompt. Empty opens the picker. approve <id> marks a draft.",
    handler: async (args, ctx) => {
      const raw = String(args ?? "").trim();
      let kind = raw.split(/\s+/)[0] || "";
      if (!kind) {
        const picked = uiAvailable(ctx)
          ? await overlaySelect(ctx, "Evolve", EVOLVE_CHOICES, "Черновик не меняет активные skills и rules.")
          : await ctx.ui.select("Evolve", ["skill", "rule", "workflow", "prompt"]);
        kind = String(picked || "");
      }
      if (!kind) return;
      if (RULESET_KINDS.has(kind)) {
        pi.sendUserMessage(rulesetInstructions(raw || kind), { deliverAs: "followUp" });
        return;
      }
      if (kind === "approve") {
        const id = raw.split(/\s+/).slice(1).join(" ");
        const result = approveDraft(profileRoot, id);
        const content = result.ok ? result.message : result.reason;
        pi.sendMessage({ customType: "pi-1c-evolve", content: content || "", display: true }, { triggerTurn: false });
        return;
      }
      const created = createManualDraft(profileRoot, kind);
      if (!created.ok) {
        ctx.ui.notify(created.reason || "evolve failed", "error");
        return;
      }
      const memory = queueEvolutionMemory({
        profileDir: profileRoot,
        draft: created.draft,
        connected: memoryConnected(),
        anonLevel: anonLevel(),
        cwd: ctx.cwd,
      });
      const pending = listDrafts(profileRoot, kind).map((draft) => `- ${draft.id} [${draft.status}] ${draft.subject}`).join("\n");
      const memoryLine = memory.skipped ? "Memory write skipped." : `Memory queued: ${memory.queued}.`;
      pi.sendMessage({
        customType: "pi-1c-evolve",
        content: `Draft ${created.draft.id} is not active.\n${memoryLine}\n${pending}`,
        display: true,
      }, { triggerTurn: false });
    },
  });

  pi.on("session_start", async () => {
    try { noteTools(pi.getActiveTools()); } catch { noteTools([]); }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const session = getSession();
    try { noteTools(pi.getActiveTools()); } catch { /* keep the previous tool list */ }
    const capabilities = snapshotCapabilities(session.tools);
    const decision = decide({ text: String(event.prompt || ""), capabilities });
    setDecision(decision);
    applyDecisionStats(session.stats, decision);
    beginTurn(String(event.systemPrompt || ""));
    session.decision = decision;

    const mode = currentMode();
    const manifests = indexManifests(path.join(profileRoot, "skills"));
    const choice = chooseSkills({ manifests, text: String(event.prompt || ""), mode, available: capabilities, limit: 2 });
    session.skipped = choice.skipped;
    let extra = "";
    for (const manifest of choice.selected) {
      const body = readSkillBody(manifest.dir);
      const admitted = admitFile(session, `skill:${manifest.id}`, "skill", body);
      if (!admitted.admitted) {
        session.skipped.push({ id: manifest.id, reason: admitted.reason });
        continue;
      }
      session.loaded.skills.push(manifest.id);
      bump(session.stats, "skillsLoaded");
      extra += `\n\n# Skill ${manifest.id}\n${body}`;
    }

    const rulesDir = path.join(profileRoot, "rules-1c", "rules");
    const rules = rankBySummary(catalogMarkdownFiles(rulesDir), String(event.prompt || ""), 2);
    for (const rule of rules) {
      const body = readTextFile(rule.file);
      const admitted = admitFile(session, `rule:${rule.id}`, "rules", body);
      if (!admitted.admitted) continue;
      session.loaded.rules.push(rule.id);
      bump(session.stats, "rulesLoaded");
      extra += `\n\n# Rule ${rule.id}\n${body}`;
    }

    const wantKnowledge = decision.first === "configuration_knowledge";
    const knowledge = loadKnowledgeSlice(ctx?.cwd || process.cwd(), String(event.prompt || ""), { limit: 5 });
    if (wantKnowledge) bump(session.stats, knowledge.length ? "knowledgeHits" : "knowledgeMisses");
    for (const item of knowledge) {
      const admitted = admitFile(session, `knowledge:${item.id}`, "knowledge", String(item.statement || ""));
      if (!admitted.admitted) continue;
      session.loaded.knowledge.push(item.id);
    }

    if (!extra) return undefined;
    return { systemPrompt: `${event.systemPrompt || ""}\n${extra}` };
  });

  pi.on("tool_call", async (event) => {
    const session = getSession();
    const structural = isStructuralToolName(event.toolName);
    const block = shouldBlockTool({
      decision: session.decision,
      toolName: event.toolName,
      input: event.input,
      structuralCallSeen: session.structuralCallSeen,
    });
    if (block) return block;
    if (structural) markStructuralCall();
    noteToolStats(session.stats, event.toolName, { structural });
    return undefined;
  });
}
