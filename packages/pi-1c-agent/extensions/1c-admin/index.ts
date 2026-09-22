import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAction } from "../../lib/ui/index.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function runNode(script: string, args: string[], cwd: string) {
  return spawnSync(process.execPath, [path.join(packageRoot, "tools", script), ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function defaultScope(cwd: string): "project" | "global" {
  return fs.existsSync(path.join(cwd, ".pi", "1c", "bootstrap.manifest.json")) ? "project" : "global";
}

export default function oneCAdmin(pi: ExtensionAPI): void {
  async function handleDoctor(args: string | undefined, ctx: any, aliasName?: string) {
    if (aliasName) ctx.ui.notify(`/${aliasName} is an alias of /doctor`, "info");
    const requested = args?.trim().toLowerCase();
    const scope = requested === "project" || requested === "global" ? requested : defaultScope(ctx.cwd);
    const result = runNode("doctor.mjs", [scope === "project" ? "--project" : "--global"], ctx.cwd);
    const text = `${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`.trim() || `doctor exited ${result.status}`;
    pi.sendMessage({ customType: "pi-1c-doctor", content: text, display: true }, { triggerTurn: false });
  }

  pi.registerCommand("doctor", {
    description: "Детерминированный doctor Pi 1C (без догадок LLM): /doctor [project|global]",
    handler: async (args, ctx) => handleDoctor(args, ctx),
  });
  registerAction("command:doctor", (args: string | undefined, ctx: any) => handleDoctor(args, ctx));
  pi.registerCommand("bootstrap", {
    description: "Развернуть закреплённый снимок ai_rules_1c в project/global область Pi",
    handler: async (args, ctx) => {
      const requested = args?.trim().toLowerCase();
      const scope = requested === "global" ? "global" : "project";
      if (scope === "project" && typeof ctx.isProjectTrusted === "function" && !ctx.isProjectTrusted()) {
        ctx.ui.notify("Project bootstrap requires a trusted project. Trust it first or run /bootstrap global.", "error");
        return;
      }
      ctx.ui.notify(`Bootstrapping pinned 1C rules into ${scope} scope...`, "info");
      const result = runNode("bootstrap.mjs", [scope === "project" ? "--project" : "--global"], ctx.cwd);
      const text = `${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
      pi.sendMessage({ customType: "pi-1c-bootstrap", content: text || `bootstrap exited ${result.status}`, display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("openspec-setup", {
    description: "Поставить проверенный OpenSpec baseline для vanilla Pi в текущий проект",
    handler: async (_args, ctx) => {
      if (typeof ctx.isProjectTrusted === "function" && !ctx.isProjectTrusted()) {
        ctx.ui.notify("OpenSpec setup writes project planning artifacts and requires a trusted project.", "error");
        return;
      }
      const result = runNode("openspec-setup.mjs", ["--install-cli"], ctx.cwd);
      const text = `${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
      pi.sendMessage({ customType: "pi-1c-openspec-setup", content: text || `openspec setup exited ${result.status}`, display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("agent-scope", {
    description: "Включить локальные .pi/agents в делегирование 1C: /agent-scope on|off",
    handler: async (args, ctx) => {
      if (typeof ctx.isProjectTrusted === "function" && !ctx.isProjectTrusted()) {
        ctx.ui.notify("Project agent scope can only be changed in a trusted project.", "error");
        return;
      }
      const value = args?.trim().toLowerCase();
      if (value !== "on" && value !== "off") {
        ctx.ui.notify("Usage: /agent-scope on|off", "info");
        return;
      }
      const dir = path.join(ctx.cwd, ".pi", "1c");
      const file = path.join(dir, "settings.json");
      fs.mkdirSync(dir, { recursive: true });
      let settings: any = {};
      try { if (fs.existsSync(file)) settings = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
      settings.projectAgents = value === "on";
      fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
      ctx.ui.notify(`Project 1C agents ${value === "on" ? "enabled" : "disabled"}. Trust gate still applies.`, "info");
    },
  });
}
