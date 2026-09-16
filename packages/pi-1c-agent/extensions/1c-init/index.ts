import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  applyProjectInitialization,
  auditDevEnvSchema,
  autoDetectedValues,
  collectSiblingSharedEnv,
  configurationRootForLayout,
  detectConfiguration,
  effectiveVariableMeta,
  ensureProjectKnowledgeLayout,
  inferSourceLayoutRoot,
  initStatus,
  inspectSourceScaffold,
  inspectBuildScaffold,
  inspectDocsScaffold,
  loadDevEnvSchema,
  locateDevEnvExample,
  parseEnvTemplate,
  parseEnvValues,
  redactValue,
  summarizeEnv,
} from "../../lib/project-init.mjs";
import { loadConfiguration } from "../../lib/knowledge.mjs";

type OneCMode = "plan" | "build";
type SharedState = typeof globalThis & { __PI_1C_MODE__?: OneCMode };
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = loadDevEnvSchema();

function currentMode(): OneCMode {
  return (globalThis as SharedState).__PI_1C_MODE__ === "plan" ? "plan" : "build";
}

function trusted(ctx: any): boolean {
  return typeof ctx.isProjectTrusted === "function" ? ctx.isProjectTrusted() : false;
}

function runBootstrap(cwd: string) {
  return spawnSync(process.execPath, [path.join(packageRoot, "tools", "bootstrap.mjs"), "--project"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function existingOr(values: Record<string, string>, name: string, fallback: string) {
  return Object.prototype.hasOwnProperty.call(values, name) && values[name] !== "" ? values[name] : fallback;
}

function defaultFor(meta: any): string {
  return meta.templateDefault !== undefined ? String(meta.templateDefault) : String(meta.default ?? "");
}

function choiceLabel(value: string): string {
  const labels: Record<string, string> = {
    main_configuration: "Основная конфигурация",
    extension: "Расширение",
    file: "Файловая ИБ",
    server: "Клиент-серверная ИБ",
    manual: "manual — UI-тесты только по явному запросу",
    auto: "auto — UI-тесты автоматически после deploy/verification",
    off: "off — отключить",
    true: "Да",
    false: "Нет",
    deny: "deny — запрещать прямую правку типовых locked-объектов",
    warn: "warn — предупреждать, но разрешать",
    end: "end — как Конфигуратор",
    byName: "byName — сортировать по имени внутри группы",
    standard: "standard — рекомендуемый обычный режим",
    extended: "extended",
    economy: "economy — активнее делегировать субагентам",
    full: "full — максимальная проверка",
    lite: "lite — облегчённая проверка низкого риска",
    on: "on",
  };
  return labels[value] ?? (value || "пусто / базовый профиль");
}

async function askText(ctx: any, title: string, current = "", placeholder = "Введите значение", emptyUsesCurrent = true) {
  const hint = current ? `Текущее/предложенное: ${current}` : placeholder;
  const value = await ctx.ui.input(title, hint);
  if (value == null) return null;
  const trimmed = value.trim();
  return emptyUsesCurrent && !trimmed && current ? current : trimmed;
}

async function askVariable(ctx: any, meta: any, values: Record<string, string>, decisions: Record<string, any>, detected: Record<string, string>) {
  const name = meta.name;
  const current = String(values[name] ?? "");
  const templateDefault = defaultFor(meta);
  const auto = String(detected[name] ?? "");
  const recommended = auto || current || templateDefault || String(meta.default ?? "");
  const prefix = `${meta._index}/${meta._total} ${name} — ${meta.title}`;
  const dependency = meta.dependsOn ? `\nЗависимость: ${Object.entries(meta.dependsOn).map(([k, v]) => `${k}=${v}`).join(", ")}.` : "";
  const details = `${meta.description}\nКласс: ${meta.class}.${dependency} ${meta.secret ? "Секрет: значение не попадёт в preview/project.yaml." : ""}`;

  const options: string[] = [];
  const actions = new Map<string, { kind: string; value?: string }>();
  if (auto) {
    const label = `Использовать автодетект: ${redactValue(name, auto, schema)}`;
    options.push(label); actions.set(label, { kind: "value", value: auto });
  }
  if (current && current !== auto) {
    const label = `Оставить текущее: ${redactValue(name, current, schema)}`;
    options.push(label); actions.set(label, { kind: "value", value: current });
  }

  if (Array.isArray(meta.choices)) {
    for (const value of meta.choices) {
      if (value === "") continue;
      const label = `Выбрать: ${choiceLabel(value)}`;
      if (!actions.has(label)) { options.push(label); actions.set(label, { kind: "value", value }); }
    }
  }

  const semanticDefault = String(meta.default ?? "");
  if (meta.class === "defaulted" || meta.class === "advisory" || meta.class === "optional" || meta.class === "highly-desirable") {
    const defaultMeaning = semanticDefault || templateDefault || "пусто / механизм не используется";
    const label = `Использовать upstream default: ${choiceLabel(defaultMeaning)}${templateDefault === "" && semanticDefault ? " (в .dev.env останется пусто)" : ""}`;
    if (!actions.has(label)) { options.push(label); actions.set(label, { kind: "default", value: templateDefault }); }
  }

  const manual = meta.secret ? "Ввести DEV/TEST секрет сейчас (ввод может быть видим в TUI)" : "Ввести другое значение";
  options.push(manual); actions.set(manual, { kind: "manual" });
  const empty = meta.secret ? "Не сохранять секрет / оставить пустым" : "Не использовать / оставить пустым";
  options.push(empty); actions.set(empty, { kind: "empty", value: "" });

  ctx.ui.notify(details, "info");
  const selected = await ctx.ui.select(prefix, options);
  if (!selected) return false;
  const action = actions.get(selected)!;
  if (action.kind === "manual") {
    if (meta.secret) {
      const ok = await ctx.ui.confirm("Секретное значение", "Pi input не гарантирует маскирование. Вводить только DEV/TEST секрет и только если вы согласны, что он может быть видим при вводе. Продолжить?");
      if (!ok) { values[name] = ""; decisions[name] = { state: "deferred-secret" }; return true; }
    }
    const entered = await askText(ctx, name, recommended && !meta.secret ? recommended : "", "Введите значение", false);
    if (entered == null) return false;
    values[name] = entered;
    decisions[name] = { state: entered ? "configured" : "empty" };
    return true;
  }
  values[name] = action.value ?? "";
  decisions[name] = { state: action.kind === "default" ? "default" : (values[name] ? "configured" : "disabled") };
  return true;
}

const QUICK_NAMES = new Set([
  "PREFIX", "COMPANY", "DEVELOPER", "PLATFORM_VERSION", "NEW_OBJECTS_IN",
  "PLATFORM_PATH", "INFOBASE_KIND", "INFOBASE_PATH", "EXTENSION_NAME", "EXTENSION_NAMES", "EXPORT_PATH", "EXTENSIONS_PATH",
  "UI_TESTING", "INFOBASE_PUBLISH_URL", "USE_EDT", "SUPPORT_GUARD", "REPOSITORY_PATH",
  "VERIFICATION_DEPTH", "ORCHESTRATION"
]);

function previewText(project: any, templateRaw: string, values: Record<string, string>, decisions: Record<string, any>, knowledgeEnabled: boolean, openSpecEnabled: boolean, sourceScaffoldEnabled: boolean, scaffoldPlan: any, buildScaffoldEnabled: boolean, buildPlan: any, docsScaffoldEnabled: boolean, docsPlan: any) {
  const summary = summarizeEnv(templateRaw, values, decisions, schema);
  const groups = new Map<string, any[]>();
  for (const item of summary) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group)!.push(item);
  }
  const lines = [
    "# 1C Project Initialization — preview",
    "",
    `Project: ${project.projectName}`,
    `Configuration: ${project.configurationName || "(не определена)"} ${project.configurationVersion || ""}`.trim(),
    `Configuration source root: ${project.sourceRoot || "."}`,
    `1C source layout root: ${project.sourceLayoutRoot || "src"}`,
    `Configuration Knowledge: ${knowledgeEnabled ? "enabled" : "disabled"}`,
    `OpenSpec: ${openSpecEnabled ? "enabled" : "disabled"}`,
    "",
    "## Standard 1C source layout",
    `Scaffold: ${sourceScaffoldEnabled ? "enabled" : "disabled"}`,
  ];
  for (const item of scaffoldPlan?.directories ?? []) {
    lines.push(`- ${item.path}: ${item.exists ? "exists — untouched" : (sourceScaffoldEnabled ? "will create" : "missing — will not create")}`);
  }
  lines.push("", "## Compiled artifacts (build/)", `Scaffold: ${buildScaffoldEnabled ? "enabled" : "disabled"}`);
  for (const item of buildPlan?.directories ?? []) {
    lines.push(`- ${item.path}: ${item.exists ? "exists — untouched" : (buildScaffoldEnabled ? "will create" : "missing — will not create")}`);
  }
  lines.push("  names: OriginalName_YYYYMMDD.cf/.cfe/.epf/.erf");
  lines.push("", "## Documentation", `Scaffold: ${docsScaffoldEnabled ? "enabled" : "disabled"}`);
  for (const item of docsPlan?.directories ?? []) {
    lines.push(`- ${item.path}: ${item.exists ? "exists — untouched" : (docsScaffoldEnabled ? "will create" : "missing — will not create")}`);
  }
  lines.push("", `ENV variables: ${summary.length}`);
  for (const group of schema.groups) {
    const items = groups.get(group.id) ?? [];
    if (!items.length) continue;
    lines.push("", `## ${group.title}`);
    for (const item of items) lines.push(`- ${item.name}: ${item.state}${item.secret ? (item.state.includes("configured") ? " [secret configured]" : " [secret not shown]") : item.value !== "(пусто)" ? ` = ${item.value}` : ""}`);
  }
  lines.push("", "Будут созданы/обновлены:", "- .dev.env (mode 600 на POSIX)", "- .gitignore (.dev.env, build/)", "- .pi/1c/project.yaml", "- .pi/1c/init-state.json");
  if (sourceScaffoldEnabled) lines.push(`- ${project.sourceLayoutRoot || "src"}/{cf,cfe,epf,erf} — только отсутствующие каталоги; существующие данные не изменяются`);
  if (buildScaffoldEnabled) lines.push("- build/{cf,cfe,epf,erf} — готовые .cf/.cfe/.epf/.erf, имя + штамп даты");
  if (docsScaffoldEnabled) lines.push("- docs/ и docs/techtask/ — документация и сырые ТЗ агенту");
  lines.push("- .pi/1c/{knowledge,knowledge-drafts,rules} — каркас знаний проекта (агент и OpenSpec не копируются)");
  if (knowledgeEnabled) lines.push("- .pi/1c/configuration.json + fingerprint (если ещё не инициализированы)");
  if (openSpecEnabled && !fs.existsSync(path.join(project.cwd, "openspec"))) lines.push("- OpenSpec помечен как enabled; после init будет предложен /openspec-setup");
  return lines.join("\n");
}

const SOURCE_EMPTY = "Пустая структура исходников (scaffold) — .dev.env и каталоги, без выгрузки ИБ";
const SOURCE_DUMP = "Выгрузка из существующей ИБ / .cf / .dt";
const FROM_IB_FOLLOW_UP = `The user chose dump from an existing infobase / .cf / .dt — the from-infobase scenario of /init. /initproject is this alias.

Do not create an empty cf/cfe/epf/erf scaffold as the primary outcome. Follow the dump procedure: check .dev.env (PLATFORM_PATH, INFOBASE_PATH, EXPORT_PATH, EXTENSION_NAMES), confirm the target infobase, then dump. If .dev.env is missing, collect blocking keys first. Do not run against production without an explicit dump-only confirmation.`;

function parseInitRequest(args?: string) {
  const raw = (args?.trim() || "");
  const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);
  return {
    raw,
    tokens,
    status: tokens.includes("status"),
    knowledge: tokens.includes("knowledge"),
    advanced: tokens.includes("advanced"),
    quick: tokens.includes("quick"),
    empty: tokens.includes("empty"),
    fromIb: tokens.some((t) => t === "from-ib" || t === "from-cf" || t === "from-dt" || t.startsWith("from-cf") || t.startsWith("from-dt")),
  };
}

function knowledgeResultLine(layout: any, knowledgeEnabled: boolean) {
  const dirs = `layout created=${layout?.created?.length ?? 0}, existing=${layout?.existing?.length ?? 0}`;
  if (layout?.fingerprintInitialized) {
    return `Configuration Knowledge: initialized (${layout.configuration?.fileCount ?? 0} 1C files fingerprinted); ${dirs}`;
  }
  if (layout?.configurationAlreadyPresent && layout?.configuration) {
    return `Configuration Knowledge: already initialized (${layout.configuration.name} ${layout.configuration.version}); ${dirs}`;
  }
  if (knowledgeEnabled) return `Configuration Knowledge: layout only; fingerprint skipped; ${dirs}`;
  return `Configuration Knowledge: layout only (fingerprint not requested); ${dirs}`;
}

export default function oneCInit(pi: ExtensionAPI): void {
  async function handleInit(args: string | undefined, ctx: any, aliasName?: string) {
      if (aliasName) ctx.ui.notify(`/${aliasName} is an alias of /init`, "info");
      if (!trusted(ctx)) return ctx.ui.notify("/init is project-scoped and requires a trusted project.", "error");
      if (currentMode() !== "build") return ctx.ui.notify("/init writes .dev.env and project state. Switch to BUILD first. PLAN remains read-only for project initialization.", "error");

      const requested = parseInitRequest(args);
      if (requested.status) {
        const st = initStatus(ctx.cwd);
        const text = [
          `1C init: ${st.state ? "INITIALIZED" : "NOT INITIALIZED"}`,
          `template: ${st.example ?? "missing"}`,
          `.dev.env: ${st.envFile ?? "missing"}`,
          `configured non-empty values: ${st.configuredCount}`,
          st.audit ? `upstream/schema variables: ${st.audit.discovered.length}/${st.audit.known.length}; unknown=${st.audit.unknown.length}; missing=${st.audit.missing.length}` : "schema audit unavailable",
          st.scaffold ? `source scaffold: ${st.scaffold.complete ? "complete" : `missing ${st.scaffold.missing.join(", ")}`}` : "source scaffold: not initialized",
          st.buildScaffold ? `build scaffold: ${st.buildScaffold.complete ? "complete" : `missing ${st.buildScaffold.missing.join(", ")}`}` : "build scaffold: not initialized",
          st.docsScaffold ? `docs scaffold: ${st.docsScaffold.complete ? "complete" : `missing ${st.docsScaffold.missing.join(", ")}`}` : "docs scaffold: not initialized",
          st.knowledgeLayout ? `knowledge layout: ${st.knowledgeLayout.complete ? "complete" : `missing ${st.knowledgeLayout.missing.join(", ")}`}` : "knowledge layout: missing",
        ].join("\n");
        return pi.sendMessage({ customType: "pi-1c-init-status", content: text, display: true }, { triggerTurn: false });
      }

      if (requested.knowledge) {
        const config = detectConfiguration(ctx.cwd);
        const existing = loadConfiguration(ctx.cwd);
        const projectName = (await askText(ctx, "Название проекта", path.basename(ctx.cwd), "Например: Valenta EXON")) ?? path.basename(ctx.cwd);
        const configurationName = (await askText(ctx, "Название конфигурации 1С", existing?.name || config.name, "Например: 1С:ERP Управление предприятием")) ?? (existing?.name || config.name);
        const configurationVersion = (await askText(ctx, "Версия конфигурации", existing?.version || config.version, "Например: 2.5.25.56")) ?? (existing?.version || config.version);
        const sourceRoot = (await askText(
          ctx,
          "Каталог основной конфигурации",
          existing?.sourceRoot || config.sourceRoot || "src/cf",
          "Например: src/cf — здесь ожидается Configuration.xml",
        )) ?? (existing?.sourceRoot || config.sourceRoot || "src/cf");
        const willFingerprint = !existing && Boolean(configurationName && configurationVersion);
        const preview = [
          "# /init knowledge — только каркас знаний проекта",
          "",
          "Не копирует агента, OpenSpec, .dev.env и не запускает bootstrap --project.",
          "",
          `- project: ${projectName}`,
          `- configuration: ${configurationName || "(пусто)"} ${configurationVersion || ""}`.trim(),
          `- sourceRoot: ${sourceRoot}`,
          `- fingerprint: ${existing ? "skip — configuration.json already present" : (willFingerprint ? "yes" : "skip — name/version missing")}`,
          "",
          "Будут созданы только недостающие каталоги:",
          "- .pi/1c/knowledge/items/",
          "- .pi/1c/knowledge-drafts/",
          "- .pi/1c/rules/configuration/",
          "- .pi/1c/rules/project/",
          existing ? "- .pi/1c/configuration.json — already present, not overwritten" : (willFingerprint ? "- .pi/1c/configuration.json + knowledge/fingerprint.json" : "- configuration.json не создаётся без имени и версии"),
          "- .pi/1c/project.yaml и init-state.json — только если отсутствуют",
        ].join("\n");
        pi.sendMessage({ customType: "pi-1c-init-knowledge-preview", content: preview, display: true }, { triggerTurn: false });
        const apply = await ctx.ui.confirm("Посадить каркас знаний?", "Существующие drafts/items/rules не удаляются. Агент, .pi/prompts, .pi/skills и .dev.env не записываются.");
        if (!apply) return ctx.ui.notify("Инициализация знаний отменена. Ничего не записано.", "info");
        try {
          const result = ensureProjectKnowledgeLayout(ctx.cwd, {
            projectName,
            configurationName,
            configurationVersion,
            sourceRoot,
            fingerprint: willFingerprint,
            writeManifests: true,
          });
          const next = [
            "1C project knowledge layout complete.",
            knowledgeResultLine(result, willFingerprint),
            result.manifestsCreated.length ? `Manifests created: ${result.manifestsCreated.join(", ")}` : "Manifests: already present",
            "Agent/OpenSpec were not copied.",
            "Next: /learn to add facts, or /init for the full .dev.env wizard.",
          ].join("\n");
          pi.sendMessage({ customType: "pi-1c-init-knowledge-complete", content: next, display: true }, { triggerTurn: false });
        } catch (error: any) {
          ctx.ui.notify(error?.message || String(error), "error");
        }
        return;
      }

      let sourceChoice = requested.fromIb ? "dump" : (requested.empty || requested.advanced || requested.quick ? "empty" : "");
      if (!sourceChoice) {
        const selected = await ctx.ui.select("Источник проекта (первый вопрос /init)", [SOURCE_EMPTY, SOURCE_DUMP]);
        if (!selected) return;
        sourceChoice = selected === SOURCE_DUMP ? "dump" : "empty";
      }
      if (sourceChoice === "dump") {
        const extra = requested.raw ? `\nArguments: ${requested.raw}` : "";
        return pi.sendMessage({ customType: "pi-1c-init-from-ib", content: `${FROM_IB_FOLLOW_UP}${extra}`, display: true }, { triggerTurn: true, deliverAs: "followUp" });
      }

      let example = locateDevEnvExample(ctx.cwd);
      if (!example) {
        const ok = await ctx.ui.confirm("1C rules bootstrap required", "Не найден .dev.env.example из ai_rules_1c. Запустить pinned /bootstrap project сейчас?");
        if (!ok) return;
        const r = runBootstrap(ctx.cwd);
        if (r.status !== 0) return ctx.ui.notify(`Bootstrap failed: ${(r.stderr || r.stdout || "").slice(-1000)}`, "error");
        example = locateDevEnvExample(ctx.cwd);
        if (!example) return ctx.ui.notify("Bootstrap завершился, но .dev.env.example всё ещё не найден.", "error");
      }

      const templateRaw = fs.readFileSync(example, "utf8");
      const audit = auditDevEnvSchema(templateRaw, schema);
      if (audit.duplicates.length) return ctx.ui.notify(`Upstream .dev.env.example contains duplicate variables: ${audit.duplicates.join(", ")}`, "error");
      if (audit.unknown.length || audit.missing.length) {
        const proceed = await ctx.ui.confirm("Upstream/schema drift", `Обнаружено отличие от UX-схемы. Новые upstream: ${audit.unknown.join(", ") || "нет"}; отсутствуют ожидаемые: ${audit.missing.join(", ") || "нет"}. Неизвестные переменные будут показаны generic-вопросом. Продолжить?`);
        if (!proceed) return;
      }

      let wizard = requested.advanced ? "advanced" : requested.quick ? "quick" : "";
      if (!wizard) {
        const selected = await ctx.ui.select("Режим /init", [
          "Подробный — пройти все переменные .dev.env (рекомендуется)",
          "Быстрый — только ключевые решения, остальное upstream defaults",
        ]);
        if (!selected) return;
        wizard = selected.startsWith("Подробный") ? "advanced" : "quick";
      }

      const config = detectConfiguration(ctx.cwd);
      const existingEnvPath = path.join(ctx.cwd, ".dev.env");
      const existingValues = fs.existsSync(existingEnvPath) ? parseEnvValues(fs.readFileSync(existingEnvPath, "utf8")) : {};
      if (fs.existsSync(existingEnvPath)) {
        const action = await ctx.ui.select("Найден существующий .dev.env", ["Сохранить текущие значения и пересмотреть", "Начать с upstream defaults", "Отмена"]);
        if (!action || action === "Отмена") return;
        if (action === "Начать с upstream defaults") for (const k of Object.keys(existingValues)) delete existingValues[k];
      }

      const parsed = parseEnvTemplate(templateRaw);
      const values: Record<string, string> = Object.fromEntries(parsed.variables.map((x: any) => [x.name, x.defaultValue]));
      Object.assign(values, existingValues);
      const decisions: Record<string, any> = {};

      const projectName = (await askText(ctx, "Название проекта", path.basename(ctx.cwd), "Например: Valenta EXON")) ?? path.basename(ctx.cwd);
      const configurationName = (await askText(ctx, "Название конфигурации 1С", config.name, "Например: 1С:ERP Управление предприятием")) ?? config.name;
      const configurationVersion = (await askText(ctx, "Версия конфигурации", config.version, "Например: 2.5.25.56")) ?? config.version;

      const detectedLayoutRoot = inferSourceLayoutRoot(ctx.cwd, config.sourceRoot || ".");
      const sourceLayoutRoot = (await askText(
        ctx,
        "Корень структуры исходников 1С",
        detectedLayoutRoot,
        "Например: src — внутри будут cf/cfe/epf/erf",
      )) ?? detectedLayoutRoot;
      const defaultConfigurationRoot = configurationRootForLayout(ctx.cwd, config, sourceLayoutRoot);
      const sourceRoot = (await askText(
        ctx,
        "Каталог основной конфигурации",
        defaultConfigurationRoot,
        "Например: src/cf — здесь ожидается Configuration.xml",
      )) ?? defaultConfigurationRoot;

      let scaffoldPlan: any;
      try {
        scaffoldPlan = inspectSourceScaffold(ctx.cwd, sourceLayoutRoot);
      } catch (error: any) {
        return ctx.ui.notify(error?.message || String(error), "error");
      }
      const sourceScaffoldEnabled = await ctx.ui.confirm(
        "Стандартная структура исходников 1С",
        `Создать отсутствующие каталоги cf, cfe, epf и erf внутри ${sourceLayoutRoot}? Уже существующие каталоги и файлы не изменяются.`,
      );
      let buildPlan: any;
      let docsPlan: any;
      try {
        buildPlan = inspectBuildScaffold(ctx.cwd);
        docsPlan = inspectDocsScaffold(ctx.cwd);
      } catch (error: any) {
        return ctx.ui.notify(error?.message || String(error), "error");
      }
      const buildScaffoldEnabled = await ctx.ui.confirm(
        "Каталог готовых сборок build/",
        "Создать build/{cf,cfe,epf,erf} для скомпилированных конфигураций, расширений, обработок и отчётов? Имена файлов: исходноеИмя_ГГГГММДД. Существующие каталоги не изменяются.",
      );
      const docsScaffoldEnabled = await ctx.ui.confirm(
        "Документация docs/",
        "Создать docs/ для документации проекта и docs/techtask/ для сырых технических заданий агенту? Существующие файлы не перезаписываются.",
      );

      const detected = autoDetectedValues(ctx.cwd, { sourceLayoutRoot, configurationSourceRoot: sourceRoot });
      for (const [k, v] of Object.entries(detected)) if (v && !values[k]) values[k] = v;

      const siblingLock = new Set<string>();
      const siblingScan = collectSiblingSharedEnv(ctx.cwd, schema);
      const siblingHints = siblingScan.suggestions.filter((h) => !String(values[h.name] ?? "").trim());
      if (siblingHints.length) {
        const hintLines = siblingHints.map((h) => {
          const alt = h.alternatives.length ? `; другие значения: ${h.alternatives.slice(0, 3).join(", ")}` : "";
          return `- ${h.name}=${redactValue(h.name, h.value, schema)}  ← ${h.sources.join(", ")}${alt}`;
        });
        pi.sendMessage({
          customType: "pi-1c-init-sibling-hints",
          content: [
            "# Подсказки из соседних 1С-проектов (один уровень вверх)",
            `Каталог: ${siblingScan.parent}`,
            `Похожих проектов: ${siblingScan.projects.length}`,
            "",
            ...hintLines,
            "",
            "Секреты (пароли ИБ/хранилища, SUPPORT_KEY) не копируются.",
            "Ничего не записывается, пока не подтвердите Apply в конце.",
          ].join("\n"),
          display: true,
        }, { triggerTurn: false });
        const action = await ctx.ui.select("Общие значения из соседних проектов", [
          "Принять все предложенные",
          "Разобрать по одной (оставить / поправить / пропустить)",
          "Не использовать соседние проекты",
        ]);
        if (!action || action.startsWith("Не использовать")) {
          // keep going; remaining variables will be asked
        } else if (action.startsWith("Принять все")) {
          for (const h of siblingHints) {
            values[h.name] = h.value;
            decisions[h.name] = { state: "sibling-hint", sources: h.sources };
            siblingLock.add(h.name);
          }
        } else {
          for (const h of siblingHints) {
            const keep = `Оставить: ${h.name}=${redactValue(h.name, h.value, schema)}`;
            const skip = `Пропустить ${h.name}`;
            const edit = `Ввести другое для ${h.name}`;
            const picked = await ctx.ui.select(`${h.name} из ${h.sources.join(", ")}`, [keep, skip, edit]);
            if (!picked || picked === skip) continue;
            if (picked === keep) {
              values[h.name] = h.value;
              decisions[h.name] = { state: "sibling-hint", sources: h.sources };
              siblingLock.add(h.name);
              continue;
            }
            const entered = await askText(ctx, h.name, h.value, "Введите значение", false);
            if (entered == null) return ctx.ui.notify("Инициализация отменена. Проект не изменён.", "info");
            values[h.name] = entered;
            decisions[h.name] = { state: entered ? "configured" : "empty" };
            siblingLock.add(h.name);
          }
        }
      } else {
        ctx.ui.notify("Соседних 1С-проектов с общими .dev.env-подсказками не найдено — спрашиваю переменные по одной.", "info");
      }

      let knowledgeEnabled = await ctx.ui.confirm("Configuration Knowledge Layer", "Инициализировать fingerprint/knowledge layer для этой конфигурации после подтверждения?");
      const openSpecEnabled = await ctx.ui.confirm("OpenSpec", "Используется OpenSpec в этом проекте? Если да и artifacts ещё нет, после инициализации будет предложена /openspec-setup.");

      if (knowledgeEnabled) {
        if (!configurationName || !configurationVersion) {
          ctx.ui.notify("Configuration Knowledge требует название и версию конфигурации. Заполните их или повторите /init с отключённым Knowledge Layer.", "error");
          return;
        }
        const sourceAbs = path.resolve(ctx.cwd, sourceRoot || ".");
        const scaffoldCfAbs = path.resolve(ctx.cwd, sourceLayoutRoot || "src", "cf");
        const sourceWillBeCreated = sourceScaffoldEnabled && sourceAbs === scaffoldCfAbs;
        if (!fs.existsSync(sourceAbs) && !sourceWillBeCreated) {
          const disable = await ctx.ui.confirm("Source root не найден", `Каталог ${sourceRoot || "."} не существует и не входит в создаваемый scaffold. Отключить Configuration Knowledge для этой инициализации и продолжить?`);
          if (!disable) return;
          knowledgeEnabled = false;
        }
      }

      const metas = effectiveVariableMeta(templateRaw, schema);
      const selectedMetas = wizard === "advanced" ? metas : metas.filter((m: any) => QUICK_NAMES.has(m.name));
      for (let i = 0; i < selectedMetas.length; i++) {
        if (siblingLock.has(selectedMetas[i].name)) continue;
        const meta = { ...selectedMetas[i], _index: i + 1, _total: selectedMetas.length };
        const ok = await askVariable(ctx, meta, values, decisions, detected);
        if (!ok) return ctx.ui.notify("Инициализация отменена. Проект не изменён.", "info");
      }

      const project = { cwd: ctx.cwd, projectName, configurationName, configurationVersion, sourceRoot, sourceLayoutRoot };
      const preview = previewText(project, templateRaw, values, decisions, knowledgeEnabled, openSpecEnabled, sourceScaffoldEnabled, scaffoldPlan, buildScaffoldEnabled, buildPlan, docsScaffoldEnabled, docsPlan);
      pi.sendMessage({ customType: "pi-1c-init-preview", content: preview, display: true }, { triggerTurn: false });
      const apply = await ctx.ui.confirm("Применить инициализацию?", "До этого момента файлы проекта не изменялись. Apply создаст/обновит .dev.env, project.yaml, init-state.json и — если включено — отсутствующие каталоги src, build и docs. Секреты в preview/project.yaml не записываются.");
      if (!apply) return ctx.ui.notify("Инициализация отменена. Ничего не записано.", "info");

      try {
        const result = applyProjectInitialization(ctx.cwd, { templateRaw, values, decisions, projectName, configurationName, configurationVersion, sourceRoot, sourceLayoutRoot, sourceScaffoldEnabled, buildScaffoldEnabled, docsScaffoldEnabled, knowledgeEnabled, openSpecEnabled });
        const knowledgeLine = knowledgeResultLine(result.knowledgeLayout, knowledgeEnabled);
        const next = [
          "1C project initialization complete.",
          `ENV: ${result.summary.length} upstream variables reviewed/materialized`,
          `Project manifest: ${path.relative(ctx.cwd, result.projectYaml)}`,
          sourceScaffoldEnabled ? `Source scaffold: ${result.scaffold.root}/{cf,cfe,epf,erf}; created=${result.scaffold.created.length}, existing=${result.scaffold.existing.length}` : "Source scaffold: disabled",
          buildScaffoldEnabled ? `Build scaffold: build/{cf,cfe,epf,erf}; created=${result.buildScaffold.created.length}, existing=${result.buildScaffold.existing.length}` : "Build scaffold: disabled",
          docsScaffoldEnabled ? `Docs scaffold: docs/ + docs/techtask; created=${result.docsScaffold.created.length}, existing=${result.docsScaffold.existing.length}` : "Docs scaffold: disabled",
          knowledgeLine,
          openSpecEnabled && !fs.existsSync(path.join(ctx.cwd, "openspec")) ? "Next: run /openspec-setup to materialize native Pi OpenSpec artifacts." : "",
          "Next: run /doctor project.",
        ].filter(Boolean).join("\n");
        pi.sendMessage({ customType: "pi-1c-init-complete", content: next, display: true }, { triggerTurn: false });
      } catch (error: any) {
        ctx.ui.notify(error?.message || String(error), "error");
      }
  }

  pi.registerCommand("init", {
    description: "Initialize a 1C project — empty source scaffold or dump from an existing infobase / .cf / .dt: /init [empty|from-ib|advanced|quick|status|knowledge]",
    handler: async (args, ctx) => handleInit(args, ctx),
  });
}
