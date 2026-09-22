import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  applyDraft,
  auditDraft,
  auditKnowledge,
  automaticInvalidations,
  computeConfigurationCandidate,
  createDraft,
  disableItem,
  draftsDir,
  findItem,
  initConfiguration,
  loadAllItems,
  loadConfiguration,
  loadDraft,
  parseKnowledgeProposals,
  queryKnowledge,
} from "../../lib/knowledge.mjs";
import { current1cMode, requireBuild as assertBuild } from "../../lib/mode-state.mjs";
import { registerAction } from "../../lib/ui/index.mjs";

type Pending = {
  type: "learn" | "config-analyze" | "config-update";
  input: string;
  meta?: any;
  automaticProposals?: any[];
};

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

function trusted(ctx: any): boolean {
  return typeof ctx.isProjectTrusted === "function" ? ctx.isProjectTrusted() : false;
}

function parseDoubleColon(raw = ""): string[] {
  return raw.split("::").map((x) => x.trim());
}

function formatKnowledgeItem(item: any): string {
  const evidence = (item.provenance?.evidence ?? []).map((e: any) => e.path ? `${e.path}${e.line ? `:${e.line}` : ""}` : e.note).filter(Boolean);
  return [
    `### ${item.id}`,
    `- kind/scope: ${item.kind}/${item.scope}`,
    `- status: ${item.status}; confidence: ${item.confidence}; precedence: ${item._precedence ?? "n/a"}`,
    `- topic: ${item.topic}`,
    `- statement: ${item.statement}`,
    evidence.length ? `- evidence: ${evidence.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function formatDraftSummary(draft: any, audit: any): string {
  const proposals = (draft.proposals ?? []).map((p: any, i: number) => {
    const item = p.item ?? {};
    return `${i + 1}. ${p.action} ${p.targetId ?? item.id ?? ""} [${item.scope ?? "?"}/${item.kind ?? "?"}] ${item.topic ?? ""}: ${item.statement ?? p.reason ?? ""}`;
  });
  const warnings = audit?.warnings?.length ? `\nWarnings:\n${audit.warnings.map((x: string) => `- ${x}`).join("\n")}` : "";
  const errors = audit?.errors?.length ? `\nErrors:\n${audit.errors.map((x: string) => `- ${x}`).join("\n")}` : "";
  return `Draft ${draft.id} (${draft.status})\n${proposals.join("\n") || "- no proposals"}${warnings}${errors}`;
}

const KnowledgeParams = Type.Object({
  query: Type.String(),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
  scopes: Type.Optional(Type.Array(Type.String())),
  kinds: Type.Optional(Type.Array(Type.String())),
});

function draftChoiceLabel(draft: any): string {
  const first = draft?.proposals?.[0]?.item ?? {};
  const scope = first.scope || "?";
  const kind = first.kind || "?";
  const topic = String(first.topic || draft?.input || "draft").replace(/\s+/g, " ").trim().slice(0, 48) || "draft";
  const id = String(draft?.id ?? "draft");
  const short = id.length > 8 ? id.slice(-8) : id;
  return `…${short} · ${scope}/${kind} · ${topic}`;
}

function pendingDrafts(cwd: string): any[] {
  const dir = draftsDir(cwd);
  if (!fs.existsSync(dir)) return [];
  const drafts: any[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
    try {
      const draft = JSON.parse(fs.readFileSync(path.join(dir, ent.name), "utf8"));
      if (!draft?.id || draft.status !== "pending") continue;
      drafts.push(draft);
    } catch {}
  }
  return drafts.sort((a, b) => {
    const ta = Date.parse(a.createdAt || "") || 0;
    const tb = Date.parse(b.createdAt || "") || 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });
}

export default function oneCKnowledge(pi: ExtensionAPI): void {
  let pending: Pending | null = null;

  function persistPending(): void {
    pi.appendEntry("pi-1c-knowledge-pending", { pending });
  }

  function requireTrusted(ctx: any): boolean {
    if (trusted(ctx)) return true;
    ctx.ui.notify("Знания конфигурации/проекта привязаны к проекту и требуют доверия к проекту.", "error");
    return false;
  }

  function requireBuild(ctx: any, action: string): boolean {
    try {
      assertBuild(action);
      return true;
    } catch {
      ctx.ui.notify(`${action} меняет канонические знания/конфигурацию и требует BUILD. PLAN может только создавать предложения и черновики.`, "error");
      return false;
    }
  }

  function beginAnalysis(ctx: any, next: Pending, prompt: string): void {
    if (!requireTrusted(ctx)) return;
    pending = next;
    persistPending();
    pi.sendUserMessage(prompt);
  }

  async function pickPendingDraftId(ctx: any, title: string): Promise<string | null> {
    const drafts = pendingDrafts(ctx.cwd);
    if (!drafts.length) {
      ctx.ui.notify("Нет черновиков знаний.", "info");
      return null;
    }
    const labels = drafts.map((draft: any) => draftChoiceLabel(draft));
    const selected = await ctx.ui.select(title, labels);
    if (!selected) return null;
    return drafts.find((draft: any) => draftChoiceLabel(draft) === selected)?.id ?? null;
  }

  async function resolveDraftId(ctx: any, rawId: string, title: string): Promise<string | null> {
    const id = rawId.trim();
    if (id) return id;
    return pickPendingDraftId(ctx, title);
  }

  async function approveDraftById(ctx: any, rawId: string): Promise<void> {
    if (!requireBuild(ctx, "/learn approve")) return;
    const id = await resolveDraftId(ctx, rawId, "Утвердить черновик знаний");
    if (!id) return;
    try {
      const result = applyDraft(ctx.cwd, id);
      ctx.ui.notify(`Утверждён ${id}; применено действий: ${result.results.length}.`, "info");
    } catch (error: any) { ctx.ui.notify(error?.message || String(error), "error"); }
  }

  async function rejectDraftById(ctx: any, rawId: string): Promise<void> {
    const id = await resolveDraftId(ctx, rawId, "Отклонить черновик знаний");
    if (!id) return;
    const draft = loadDraft(ctx.cwd, id);
    if (!draft) return ctx.ui.notify(`Черновик не найден: ${id}`, "error");
    draft.status = "rejected";
    draft.rejectedAt = new Date().toISOString();
    fs.writeFileSync(path.join(draftsDir(ctx.cwd), `${id}.json`), `${JSON.stringify(draft, null, 2)}\n`);
    ctx.ui.notify(`Отклонён ${id}.`, "info");
  }

  function startLearnAnalysis(ctx: any, input: string): void {
    const text = input.trim();
    if (!text) return;
    const config = loadConfiguration(ctx.cwd);
    const prompt = `Classify the following 1C learning input without changing canonical rules.\n\nINPUT:\n${text}\n\nConfiguration: ${config ? `${config.name} ${config.version}` : "not initialized"}\n\nDecide FACT | RULE | PREFERENCE | ASSUMPTION and scope configuration | project. Reusable behavior of the standard configuration is configuration scope. Customer/team policy is project scope. Search/read evidence when necessary; facts marked verified require evidence. Detect if this should update/replace an existing concept rather than add a duplicate.\n\nReturn exactly one section at the end:\n## Knowledge Proposals\n\n\`\`\`json\n[{"action":"add|update","targetId":"optional","kind":"fact|rule|preference|assumption","scope":"configuration|project","topic":"...","title":"...","statement":"...","confidence":"verified|high|medium|low|unknown","tags":[],"evidence":[],"appliesTo":{}}]\n\`\`\`\n\nThis creates a draft only. Do not claim it is active.`;
    beginAnalysis(ctx, { type: "learn", input: text }, prompt);
  }

  async function pickLearnAction(ctx: any): Promise<void> {
    const selected = await ctx.ui.select("Обучение", [
      "новый факт/правило",
      "утвердить черновик",
      "отклонить черновик",
    ]);
    if (selected === "утвердить черновик") return approveDraftById(ctx, "");
    if (selected === "отклонить черновик") return rejectDraftById(ctx, "");
    if (selected !== "новый факт/правило") return;
    const value = await ctx.ui.input("Новый факт или правило", "Что нужно запомнить?");
    if (value == null) return;
    const trimmed = value.trim();
    if (!trimmed) return ctx.ui.notify("Текст не введён; черновик не создан.", "info");
    startLearnAnalysis(ctx, trimmed);
  }

  pi.registerTool({
    name: "knowledge_1c",
    label: "1C Knowledge",
    description: "Selectively retrieve configuration/project facts and rules. Results are precedence-ranked; BASE rules remain in ai_rules_1c and are not duplicated here.",
    parameters: KnowledgeParams,
    async execute(_id, params: any, _signal: AbortSignal | undefined, _onUpdate: any, ctx: any) {
      if (!trusted(ctx)) return { content: [{ type: "text", text: "Project knowledge is unavailable until the project is trusted." }], isError: true };
      const results = queryKnowledge(ctx.cwd, params.query, { limit: params.limit ?? 12, scopes: params.scopes, kinds: params.kinds });
      const text = results.length
        ? results.map((item: any) => formatKnowledgeItem(item)).join("\n\n")
        : "No matching configuration/project knowledge. Fall back to BASE rules and source exploration; do not invent a rule.";
      return { content: [{ type: "text", text }], details: { count: results.length, results } };
    },
  });

  const handleConfig = async (args: string | undefined, ctx: any) => {
      const raw = args?.trim() ?? "";
      const [sub, ...restParts] = raw.split(/\s+/);
      const rest = raw.slice(sub?.length ?? 0).trim();

      if (!sub || sub === "status") {
        if (!requireTrusted(ctx)) return;
        const config = loadConfiguration(ctx.cwd);
        if (!config) return ctx.ui.notify("Configuration knowledge is not initialized. In BUILD: /config init <name> :: <version> :: <sourceRoot?>", "info");
        const audit = auditKnowledge(ctx.cwd);
        pi.sendMessage({ customType: "pi-1c-config-status", content: `Configuration: ${config.name} ${config.version}\nsourceRoot: ${config.sourceRoot}\nfingerprint: ${config.fingerprint}\nitems: ${audit.counts.total}; active: ${audit.counts.active}\nstale: ${audit.stale.length}; conflicts: ${audit.conflicts.length}`, display: true }, { triggerTurn: false });
        return;
      }

      if (sub === "init") {
        if (!requireTrusted(ctx) || !requireBuild(ctx, "/config init")) return;
        const [name, version, sourceRoot = "."] = parseDoubleColon(rest);
        if (!name || !version) return ctx.ui.notify("Usage: /config init <configuration name> :: <version> :: <sourceRoot optional>", "info");
        try {
          const config = initConfiguration(ctx.cwd, { name, version, family: name, sourceRoot });
          ctx.ui.notify(`Initialized ${config.name} ${config.version}; ${config.fileCount} fingerprinted 1C files.`, "info");
        } catch (error: any) { ctx.ui.notify(error?.message || String(error), "error"); }
        return;
      }

      if (sub === "analyze") {
        if (!requireTrusted(ctx)) return;
        if (current1cMode() !== "plan") return ctx.ui.notify("/config analyze is PLAN-only. Switch with /mode plan so discovery cannot mutate project code.", "error");
        const config = loadConfiguration(ctx.cwd);
        const focus = rest || "architecture, metadata, common modules, integrations, patterns and project-significant constraints";
        const prompt = `Perform a PLAN-only analysis of this 1C configuration and prepare reusable configuration knowledge.\n\nConfiguration: ${config ? `${config.name} ${config.version}; sourceRoot=${config.sourceRoot}` : "not initialized yet"}\nFocus: ${focus}\n\nUse read-only 1C subagents where useful: explorer, analytic, architect. Distinguish facts from policies/preferences/assumptions. Facts require evidence paths; do not mark confidence=verified without evidence. Customer-specific policies belong to project scope, reusable configuration behavior belongs to configuration scope.\n\nReturn the normal complete PLAN sections required by 1C PLAN mode. Then append exactly:\n\n## Knowledge Proposals\n\n\`\`\`json\n[\n  {\n    "action":"add",\n    "kind":"fact|rule|preference|assumption",\n    "scope":"configuration|project",\n    "topic":"stable topic key",\n    "title":"short title",\n    "statement":"atomic reusable statement",\n    "confidence":"verified|high|medium|low|unknown",\n    "tags":[],\n    "evidence":[{"type":"source","path":"relative/path","line":1,"note":"why this proves the statement"}],\n    "appliesTo":{"subsystems":[],"objects":[],"paths":[]}\n  }\n]\n\`\`\`\n\nDo not activate knowledge; this output becomes a draft requiring approval in BUILD.`;
        beginAnalysis(ctx, { type: "config-analyze", input: focus }, prompt);
        return;
      }

      if (sub === "update") {
        if (!requireTrusted(ctx)) return;
        if (current1cMode() !== "plan") return ctx.ui.notify("/config update is PLAN-only for discovery. Apply the resulting draft later in BUILD.", "error");
        const [versionMaybe, focusMaybe] = parseDoubleColon(rest);
        try {
          const current = loadConfiguration(ctx.cwd);
          if (!current) throw new Error("configuration is not initialized");
          const requestedVersion = versionMaybe && /^\d/.test(versionMaybe) ? versionMaybe : undefined;
          const focus = requestedVersion ? focusMaybe : rest;
          const candidate = computeConfigurationCandidate(ctx.cwd, { version: requestedVersion });
          const changed = candidate.diff.changed;
          const automatic = automaticInvalidations(ctx.cwd, changed, { candidateVersion: candidate.candidate.version });
          const preview = changed.slice(0, 200);
          const prompt = `Analyze a 1C configuration update in PLAN mode.\n\nOld: ${current.name} ${current.version} fingerprint=${current.fingerprint}\nCandidate: ${candidate.candidate.name} ${candidate.candidate.version} fingerprint=${candidate.candidate.fingerprint}\nChanged paths (${changed.length}):\n${preview.map((x) => `- ${x}`).join("\n") || "- none"}\nFocus: ${focus || "all affected reusable knowledge"}\n\nUse source evidence and read-only agents. Propose additions/updates/invalidations only; do not mutate canonical knowledge. Return the complete PLAN sections and then append `;
          const suffix = `\n## Knowledge Proposals\n\n\`\`\`json\n[\n  {"action":"add|update|invalidate","targetId":"optional existing id","kind":"fact|rule|preference|assumption","scope":"configuration|project","topic":"...","statement":"...","confidence":"verified|high|medium|low|unknown","evidence":[],"reason":"..."}\n]\n\`\`\``;
          beginAnalysis(ctx, {
            type: "config-update",
            input: focus || "configuration update",
            automaticProposals: automatic,
            meta: { configurationCandidate: candidate.candidate, fingerprintIndex: candidate.index, diff: candidate.diff },
          }, prompt + suffix);
        } catch (error: any) { ctx.ui.notify(error?.message || String(error), "error"); }
        return;
      }

      if (sub === "apply") {
        if (!requireTrusted(ctx) || !requireBuild(ctx, "/config apply")) return;
        const draftId = await resolveDraftId(ctx, rest, "Применить черновик знаний");
        if (!draftId) return;
        try {
          const result = applyDraft(ctx.cwd, draftId);
          pi.sendMessage({ customType: "pi-1c-config-apply", content: `Applied ${draftId}:\n${result.results.map((r: any) => `- ${r.action}: ${r.id ?? r.version ?? ""}`).join("\n") || "- no changes"}`, display: true }, { triggerTurn: false });
        } catch (error: any) { ctx.ui.notify(error?.message || String(error), "error"); }
        return;
      }

      ctx.ui.notify("Usage: /config init|status|analyze|update|apply", "info");
  };
  pi.registerCommand("config", {
    description: "Жизненный цикл знаний конфигурации: init|status|analyze|update|apply",
    handler: handleConfig,
  });
  registerAction("command:config", (args: any, ctx: any) => handleConfig(args, ctx));

  pi.registerCommand("learn", {
    description: "Обучение: новый факт/правило | утвердить черновик | отклонить черновик (без аргумента — меню)",
    handler: async (args, ctx) => {
      if (!requireTrusted(ctx)) return;
      const raw = args?.trim() ?? "";
      if (!raw) return pickLearnAction(ctx);
      if (raw === "approve" || raw.startsWith("approve ")) return approveDraftById(ctx, raw.slice("approve".length));
      if (raw === "reject" || raw.startsWith("reject ")) return rejectDraftById(ctx, raw.slice("reject".length));
      startLearnAnalysis(ctx, raw);
    },
  });

  pi.registerCommand("rule", {
    description: "Правила: add|list|show|audit|conflicts|disable",
    handler: async (args, ctx) => {
      if (!requireTrusted(ctx)) return;
      const raw = args?.trim() ?? "";
      const [sub] = raw.split(/\s+/);
      const rest = raw.slice(sub?.length ?? 0).trim();

      if (sub === "add") {
        const [scope, topic, statement] = parseDoubleColon(rest);
        if (!scope || !topic || !statement || !["project", "configuration"].includes(scope)) {
          return ctx.ui.notify("Usage: /rule add project|configuration :: <topic> :: <statement>", "info");
        }
        const draft = createDraft(ctx.cwd, { source: "user", input: statement, proposals: [{ action: "add", kind: "rule", scope, topic, statement, confidence: "verified", evidence: [{ type: "user", note: "explicit user rule" }] }] });
        const review = auditDraft(ctx.cwd, draft);
        pi.sendMessage({ customType: "pi-1c-rule-draft", content: `${formatDraftSummary(draft, review)}\n\nNothing is active yet. In BUILD approve with /learn approve (picker) or /learn approve ${draft.id}`, display: true }, { triggerTurn: false });
        return;
      }

      if (!sub || sub === "list") {
        const scope = rest.trim();
        const items = loadAllItems(ctx.cwd).filter((x: any) => (x.kind === "rule" || x.kind === "preference") && (!scope || x.scope === scope));
        const text = items.length ? items.map((x: any) => `${x.id} [${x.scope}/${x.status}] ${x.topic}: ${x.statement}`).join("\n") : "No rules.";
        return pi.sendMessage({ customType: "pi-1c-rule-list", content: text, display: true }, { triggerTurn: false });
      }

      if (sub === "show") {
        const id = rest.trim();
        const item = findItem(ctx.cwd, id);
        const draft = item ? null : loadDraft(ctx.cwd, id);
        return pi.sendMessage({ customType: "pi-1c-rule-show", content: item ? JSON.stringify(item, null, 2) : draft ? formatDraftSummary(draft, auditDraft(ctx.cwd, draft)) : `Not found: ${id}`, display: true }, { triggerTurn: false });
      }

      if (sub === "audit" || sub === "conflicts") {
        const draftId = rest.trim();
        if (sub === "audit" && draftId) {
          const draft = loadDraft(ctx.cwd, draftId);
          if (!draft) return ctx.ui.notify(`Черновик не найден: ${draftId}`, "error");
          return pi.sendMessage({ customType: "pi-1c-rule-audit-draft", content: formatDraftSummary(draft, auditDraft(ctx.cwd, draft)), display: true }, { triggerTurn: false });
        }
        const audit = auditKnowledge(ctx.cwd);
        const payload = sub === "conflicts" ? { conflicts: audit.conflicts } : audit;
        return pi.sendMessage({ customType: `pi-1c-rule-${sub}`, content: JSON.stringify(payload, null, 2), display: true }, { triggerTurn: false });
      }

      if (sub === "disable") {
        if (!requireBuild(ctx, "/rule disable")) return;
        try { disableItem(ctx.cwd, rest.trim(), "explicit user disable command"); ctx.ui.notify(`Disabled ${rest.trim()}.`, "info"); }
        catch (error: any) { ctx.ui.notify(error?.message || String(error), "error"); }
        return;
      }

      ctx.ui.notify("Usage: /rule add|list|show|audit|conflicts|disable", "info");
    },
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!pending) return;
    if (!trusted(ctx)) { pending = null; persistPending(); return; }
    const text = lastAssistantText(event.messages ?? []);
    const parsed = parseKnowledgeProposals(text);
    if (!parsed.ok) {
      ctx.ui.notify(`Knowledge draft not created: ${parsed.errors.join("; ")}`, "warning");
      return;
    }
    const proposals = [...(pending.automaticProposals ?? []), ...parsed.proposals];
    const draft = createDraft(ctx.cwd, { source: pending.type === "learn" ? "user-assisted" : "analysis", input: pending.input, proposals, meta: pending.meta ?? {} });
    const review = auditDraft(ctx.cwd, draft);
    pi.sendMessage({ customType: "pi-1c-knowledge-draft", content: `${formatDraftSummary(draft, review)}\n\nThis is only a draft. Review with /rule show ${draft.id} or /rule audit ${draft.id}. Activate only in BUILD with /learn approve or /config apply (picker), or /learn approve ${draft.id} / /config apply ${draft.id}.`, display: true }, { triggerTurn: false });
    pending = null;
    persistPending();
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const entry = entries
      .filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "pi-1c-knowledge-pending")
      .pop() as { data?: { pending?: Pending | null } } | undefined;
    pending = entry?.data?.pending ?? null;
  });
}
