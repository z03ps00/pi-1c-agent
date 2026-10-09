import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readDevEnvFile } from "../../lib/dev-env-key.mjs";
import { writeLayoutPreview } from "../../lib/layout-view.mjs";
import { collectReglog } from "../../lib/reglog.mjs";

function show(ctx: any, pi: ExtensionAPI, text: string, error = false) {
  if (error) ctx.ui.notify(text, "error");
  pi.sendMessage({ customType: "pi-1c-surface", content: text, display: true }, { triggerTurn: false });
}

export default function oneCSurface(pi: ExtensionAPI): void {
  pi.registerCommand("layout-view", {
    description: "Схема формы или макета в HTML, файл в .pi/previews",
    handler: async (args, ctx) => {
      const target = String(args || "").trim();
      if (!target) {
        ctx.ui.notify("Usage: /layout-view <Form.xml or Template.xml>", "info");
        return;
      }
      try {
        const dest = writeLayoutPreview(ctx.cwd, target);
        show(ctx, pi, `Схема записана: ${dest}`);
      } catch (error: any) {
        show(ctx, pi, error?.message || String(error), true);
      }
    },
  });

  pi.registerCommand("reglog", {
    description: "Последние записи журнала регистрации. /reglog [предел] [24h|7d] [error|warning|both]",
    handler: async (args, ctx) => {
      const env = readDevEnvFile(ctx.cwd);
      const tools = typeof pi.getAllTools === "function" ? pi.getAllTools().map((tool) => tool.name) : [];
      const result = await collectReglog({
        values: env.values,
        args,
        tools,
        fetchImpl: globalThis.fetch,
      });
      show(ctx, pi, result.text, !result.ok);
    },
  });
}
